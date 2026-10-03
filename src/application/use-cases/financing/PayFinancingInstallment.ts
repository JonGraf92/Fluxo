import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';
import { createExpenseInRepositories } from '../movement/CreateExpense';

export interface PayFinancingInstallmentInput {
  nucleusId: string;
  installmentId: string;
  paymentResourceId: string;
  paymentMethod: 'DEBIT' | 'PIX';
  paidAmountCents: number;
  paidAt: string;
  actorPersonId: string;
}

export class PayFinancingInstallment {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: PayFinancingInstallmentInput): Promise<{ movementId: string; paidAmountCents: number }> {
    return this.uow.run(async (repos) => {
      const installment = await repos.financings.findInstallmentById(input.installmentId);
      if (!installment) throw new NotFoundError('Parcela', input.installmentId);
      const plan = await repos.financings.findPlanById(installment.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', installment.planId);
      if (plan.status !== 'ACTIVE') throw new DomainError('FINANCING_NOT_ACTIVE', 'Este financiamento não está ativo.');
      if (installment.status !== 'PENDING') throw new DomainError('FINANCING_INSTALLMENT_ALREADY_PAID', 'Esta parcela já foi baixada.');
      if (!Number.isInteger(input.paidAmountCents) || input.paidAmountCents <= 0) {
        throw new DomainError('FINANCING_INSTALLMENT_AMOUNT_INVALID', 'Informe um valor de parcela maior que zero.');
      }
      const resource = await repos.resources.findById(input.paymentResourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) throw new NotFoundError('Conta de pagamento', input.paymentResourceId);
      if (resource.archived) throw new DomainError('RESOURCE_ARCHIVED', 'Reative a conta antes de usá-la no pagamento.');
      if (resource.type !== 'MONEY_ACCOUNT' && resource.type !== 'CASH') {
        throw new DomainError('FINANCING_PAYMENT_RESOURCE_INVALID', 'Escolha uma conta ou dinheiro físico.');
      }
      const legs = await repos.movements.listLegsForBalance(input.nucleusId);
      const balance = calculateResourceBalance(resource.id, resource.initialBalanceCents, legs).toCents();
      if (input.paidAmountCents > balance) {
        throw new DomainError('INSUFFICIENT_BALANCE', `Saldo insuficiente em ${resource.name}. Disponível: ${balance} centavos.`);
      }

      const expense = await createExpenseInRepositories(repos, {
        nucleusId: input.nucleusId, resourceId: resource.id, categoryId: plan.categoryId,
        amountCents: input.paidAmountCents,
        description: `${plan.description} — parcela ${installment.installmentNumber}/${plan.termMonths}`,
        date: input.paidAt, createdByPersonId: input.actorPersonId,
        responsiblePersonId: plan.responsiblePersonId, paymentMethod: input.paymentMethod,
        invoiceDueDate: null, clientOperationId: `financing-installment-${installment.id}`,
      });
      await repos.financings.markInstallmentPaid(installment.id, input.paidAmountCents, input.paidAt, expense.movementId, resource.id);
      const installments = await repos.financings.listInstallments(plan.id);
      if (installments.every((item) => item.status === 'PAID' || item.id === installment.id)) {
        await repos.financings.setPlanStatus(plan.id, 'COMPLETED');
      }
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingInstallment', entityId: installment.id, action: 'PAY_FINANCING_INSTALLMENT',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { amountCents: installment.amountCents, status: installment.status },
        after: { paidAmountCents: input.paidAmountCents, paidAt: input.paidAt, paymentResourceId: resource.id, movementId: expense.movementId },
      }));
      return { movementId: expense.movementId, paidAmountCents: input.paidAmountCents };
    });
  }
}
