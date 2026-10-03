import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { planExpenseLeg } from '../../../domain/services/LegFactory';
import { Money } from '../../../domain/value-objects/Money';
import { PaymentMethod } from '../../../domain/value-objects/enums';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { RepositoryContext } from '../../ports/RepositoryContext';
import { buildAuditLog, buildLegs, buildMovement } from './shared';
import { firstEligibleInvoiceDueDate, nextInvoiceDueDate } from '../../../domain/services/CreditInvoiceCycle';

export interface CreateExpenseInput {
  nucleusId: string;
  resourceId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  date: string;
  createdByPersonId: string;
  responsiblePersonId?: string;
  paymentMethod?: PaymentMethod;
  invoiceDueDate?: string | null;
  clientOperationId: string;
}

export interface CreateExpenseResult {
  movementId: string;
  wasAlreadyCreated: boolean;
}

/** SAÍDA — seção 23. Sempre gera exatamente 1 MovementLeg negativa (ADR D-018). */
export class CreateExpense {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateExpenseInput): Promise<CreateExpenseResult> {
    return this.uow.run((repos) => createExpenseInRepositories(repos, input));
  }
}

/** Reúso transacional pela baixa de parcela: aplica a mesma validação da saída manual. */
export async function createExpenseInRepositories(repos: RepositoryContext, input: CreateExpenseInput): Promise<CreateExpenseResult> {
  const description = input.description.trim();
  if (!description) throw new DomainError('MOVEMENT_DESCRIPTION_REQUIRED', 'Informe uma descrição para o lançamento.');
      const existing = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (existing) {
        return { movementId: existing.id, wasAlreadyCreated: true };
      }

      const resource = await repos.resources.findById(input.resourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) {
        throw new NotFoundError('Recurso', input.resourceId);
      }
      if (resource.archived) {
        throw new DomainError('RESOURCE_ARCHIVED', 'Não é possível lançar em um recurso arquivado.');
      }

      if (input.categoryId) {
        const category = await repos.categories.findById(input.categoryId);
        if (!category || category.nucleusId !== input.nucleusId) {
          throw new NotFoundError('Categoria', input.categoryId);
        }
        if (category.kind !== 'EXPENSE') {
          throw new DomainError('CATEGORY_KIND_MISMATCH', 'Esta categoria não é de saída.');
        }
      }

      const responsiblePersonId = input.responsiblePersonId ?? input.createdByPersonId;
      if (!(await repos.memberships.findByPersonAndNucleus(responsiblePersonId, input.nucleusId))) {
        throw new DomainError('MEMBER_NOT_IN_NUCLEUS', 'A pessoa responsável não pertence a este núcleo.');
      }

      const paymentMethod = input.paymentMethod ?? (resource.type === 'BENEFIT' ? 'BENEFIT' : resource.type === 'CREDIT_CARD' ? 'CREDIT' : 'DEBIT');
      if (paymentMethod === 'BENEFIT' && resource.type !== 'BENEFIT') {
        throw new DomainError('PAYMENT_RESOURCE_MISMATCH', 'Selecione um recurso de benefício para pagamento com VR/VA.');
      }
      if (paymentMethod === 'CREDIT' && resource.type !== 'CREDIT_CARD') {
        throw new DomainError('PAYMENT_RESOURCE_MISMATCH', 'Selecione o cartão de crédito usado nesta compra.');
      }
      if ((paymentMethod === 'DEBIT' || paymentMethod === 'PIX') && resource.type !== 'MONEY_ACCOUNT' && resource.type !== 'CASH') {
        throw new DomainError('PAYMENT_RESOURCE_MISMATCH', 'Débito e PIX precisam sair de uma conta ou dinheiro físico.');
      }
      if (paymentMethod !== 'CREDIT' && input.invoiceDueDate) {
        throw new DomainError('INVOICE_DATE_NOT_ALLOWED', 'Somente compras no crédito pertencem a uma fatura.');
      }
      if (paymentMethod === 'CREDIT' && !input.invoiceDueDate) {
        throw new DomainError('INVOICE_DATE_REQUIRED', 'Escolha a data de vencimento da fatura desta compra.');
      }

      let invoiceDueDate = input.invoiceDueDate ?? null;
      if (paymentMethod === 'CREDIT') {
        if (resource.statementDueDay == null || resource.statementClosingDay == null) throw new DomainError('RESOURCE_CARD_CYCLE_MISSING', 'Configure o fechamento e o vencimento do cartão antes de lançar compras.');
        const firstDueDate = firstEligibleInvoiceDueDate(input.date, resource.statementClosingDay, resource.statementDueDay);
        if (invoiceDueDate! < firstDueDate) throw new DomainError('INVOICE_BEFORE_CUTOFF', `Esta compra deve entrar na fatura com vencimento em ${firstDueDate} ou depois, conforme o corte do cartão.`);
        // If the current cycle was consolidated early, carry the purchase to the next open cycle.
        let openCycleFound = false;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          const invoice = await repos.creditInvoices.findByCardAndDueDate(resource.id, invoiceDueDate!);
          if (!invoice || invoice.status === 'OPEN') { openCycleFound = true; break; }
          invoiceDueDate = nextInvoiceDueDate(invoiceDueDate!);
        }
        if (!openCycleFound) throw new DomainError('NO_OPEN_INVOICE_CYCLE', 'Não foi possível encontrar uma fatura aberta para esta compra.');
      }

      const amount = Money.fromCents(input.amountCents);
      const legPlan = paymentMethod === 'CREDIT'
        ? { resourceId: input.resourceId, amountCents: amount.toCents() }
        : planExpenseLeg(input.resourceId, amount);

      const movement = buildMovement({
        nucleusId: input.nucleusId,
        type: 'EXPENSE',
        status: 'CONFIRMED',
        date: input.date,
        description,
        categoryId: input.categoryId,
        createdByPersonId: input.createdByPersonId,
        responsiblePersonId,
        paymentMethod,
        invoiceDueDate,
        clientOperationId: input.clientOperationId,
      });
      const legs = buildLegs(movement.id, [legPlan]);

      await repos.movements.createWithLegs(movement, legs);
      await repos.auditLogs.record(
        buildAuditLog({
          entityType: 'Movement',
          entityId: movement.id,
          action: 'CREATE_EXPENSE',
          actorPersonId: input.createdByPersonId,
          nucleusId: input.nucleusId,
          after: { type: 'EXPENSE', resourceId: input.resourceId, amountCents: input.amountCents },
        }),
      );

      return { movementId: movement.id, wasAlreadyCreated: false };
}
