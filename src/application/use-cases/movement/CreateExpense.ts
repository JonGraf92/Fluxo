import { FuelType } from '../../../domain/entities/FuelDetails';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { planExpenseLeg } from '../../../domain/services/LegFactory';
import { Money } from '../../../domain/value-objects/Money';
import { PaymentMethod } from '../../../domain/value-objects/enums';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { RepositoryContext } from '../../ports/RepositoryContext';
import { buildAuditLog, buildLegs, buildMovement, newId } from './shared';
import { financingDueDate } from '../../../domain/entities/Financing';
import { MAX_CARD_INSTALLMENTS, splitInstallments } from '../../../domain/services/CardInstallments';
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
  /** Só na categoria Combustível (ADR D-038). Digitação manual: o resto vem de nota fiscal. */
  fuel?: { fuelType?: FuelType | null; pricePerLiterMillis?: number | null; odometerKm?: number | null } | null;
  /** Número de parcelas no cartão de crédito (ADR D-039). Ausente ou 1 = à vista. */
  installments?: number;
  clientOperationId: string;
}

/** Primeira fatura ainda aberta a partir de dueDate: compra não entra em fatura já consolidada. */
async function firstOpenInvoiceDueDate(repos: RepositoryContext, cardId: string, dueDate: string): Promise<string> {
  let candidate = dueDate;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const invoice = await repos.creditInvoices.findByCardAndDueDate(cardId, candidate);
    if (!invoice || invoice.status === 'OPEN') return candidate;
    candidate = nextInvoiceDueDate(candidate);
  }
  throw new DomainError('NO_OPEN_INVOICE_CYCLE', 'Não foi possível encontrar uma fatura aberta para esta compra.');
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

      const category = input.categoryId ? await repos.categories.findById(input.categoryId) : null;
      if (input.categoryId) {
        if (!category || category.nucleusId !== input.nucleusId) {
          throw new NotFoundError('Categoria', input.categoryId);
        }
        if (category.kind !== 'EXPENSE') {
          throw new DomainError('CATEGORY_KIND_MISMATCH', 'Esta categoria não é de saída.');
        }
      }

      const fuelInput = {
        fuelType: input.fuel?.fuelType ?? null,
        pricePerLiterMillis: input.fuel?.pricePerLiterMillis ?? null,
        odometerKm: input.fuel?.odometerKm ?? null,
      };
      const hasFuel = fuelInput.fuelType !== null || fuelInput.pricePerLiterMillis !== null || fuelInput.odometerKm !== null;
      // A categoria é reconhecida pela chave, nunca pelo nome (ADR D-032).
      if (hasFuel && category?.systemKey !== 'FUEL') {
        throw new DomainError('FUEL_DETAILS_NOT_ALLOWED', 'Preço por litro e hodômetro só existem na categoria Combustível.');
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


      const count = input.installments ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > MAX_CARD_INSTALLMENTS) {
        throw new DomainError('INSTALLMENTS_INVALID', `Informe de 1 a ${MAX_CARD_INSTALLMENTS} parcelas.`);
      }
      if (count > 1 && paymentMethod !== 'CREDIT') {
        throw new DomainError('INSTALLMENTS_ONLY_ON_CREDIT', 'Só compras no cartão de crédito podem ser parceladas.');
      }
      if (count > input.amountCents) {
        throw new DomainError('INSTALLMENTS_INVALID', 'O valor é pequeno demais para esse número de parcelas.');
      }

      let invoiceDueDate = input.invoiceDueDate ?? null;
      if (paymentMethod === 'CREDIT') {
        if (resource.statementDueDay == null || resource.statementClosingDay == null) throw new DomainError('RESOURCE_CARD_CYCLE_MISSING', 'Configure o fechamento e o vencimento do cartão antes de lançar compras.');
        const firstDueDate = firstEligibleInvoiceDueDate(input.date, resource.statementClosingDay, resource.statementDueDay);
        if (invoiceDueDate! < firstDueDate) throw new DomainError('INVOICE_BEFORE_CUTOFF', `Esta compra deve entrar na fatura com vencimento em ${firstDueDate} ou depois, conforme o corte do cartão.`);
        // Se o ciclo já foi consolidado, a compra vai para o próximo ciclo aberto.
        invoiceDueDate = await firstOpenInvoiceDueDate(repos, resource.id, invoiceDueDate!);
      }

      // À vista é uma parcela só. Parcelado: N compras confirmadas, cada uma com a data do seu
      // mês e a fatura do seu ciclo; os centavos da divisão ficam na primeira (ADR D-039).
      const groupId = count > 1 ? newId() : null;
      const amounts = splitInstallments(Money.fromCents(input.amountCents).toCents(), count);
      let firstMovementId = '';
      for (const [index, amountCents] of amounts.entries()) {
        const number = index + 1;
        if (number > 1) invoiceDueDate = await firstOpenInvoiceDueDate(repos, resource.id, nextInvoiceDueDate(invoiceDueDate!));
        const amount = Money.fromCents(amountCents);
        const legPlan = paymentMethod === 'CREDIT'
          ? { resourceId: input.resourceId, amountCents: amount.toCents() }
          : planExpenseLeg(input.resourceId, amount);

        const movement = buildMovement({
          nucleusId: input.nucleusId,
          type: 'EXPENSE',
          status: 'CONFIRMED',
          date: financingDueDate(input.date, number),
          description: groupId ? `${description} (${number}/${count})` : description,
          categoryId: input.categoryId,
          createdByPersonId: input.createdByPersonId,
          responsiblePersonId,
          paymentMethod,
          invoiceDueDate,
          installment: groupId ? { groupId, number, count } : null,
          // A primeira parcela carrega o id da operação: reenvio encontra a compra já gravada.
          clientOperationId: number === 1 ? input.clientOperationId : `${input.clientOperationId}:${number}`,
        });
        await repos.movements.createWithLegs(movement, buildLegs(movement.id, [legPlan]));
        if (number === 1) {
          firstMovementId = movement.id;
          if (hasFuel) {
            await repos.fuelDetails.save({
              movementId: movement.id, ...fuelInput, quantityMl: null, stationName: null, stationCnpj: null,
              stationAddress: null, taxTotalCents: null, taxes: [], provenance: 'MANUAL', accessKey: null,
            });
          }
        }
        await repos.auditLogs.record(
          buildAuditLog({
            entityType: 'Movement',
            entityId: movement.id,
            action: 'CREATE_EXPENSE',
            actorPersonId: input.createdByPersonId,
            nucleusId: input.nucleusId,
            after: { type: 'EXPENSE', resourceId: input.resourceId, amountCents, installment: movement.installment },
          }),
        );
      }

      return { movementId: firstMovementId, wasAlreadyCreated: false };
}
