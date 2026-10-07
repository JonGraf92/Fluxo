import { v4 as uuid } from 'uuid';
import { FinancingInstallment, FinancingPlan, FinancingAssetType, LOAN_FINANCING_TYPE, LOAN_MAX_TERM_MONTHS, LoanTerms, allowedFinancingTerms, currentMonthInstallmentNearDate, financingCategoryName, financingDueDate } from '../../../domain/entities/Financing';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { Money } from '../../../domain/value-objects/Money';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';
import { resolveLoanTerms } from './loanTerms';

export interface CreateFinancingPlanInput {
  nucleusId: string;
  assetType: FinancingAssetType;
  description: string;
  termMonths: number;
  installmentAmountCents: number;
  firstDueDate: string;
  paymentResourceId: string;
  responsiblePersonId: string;
  createdByPersonId: string;
  currentMonthInstallmentPaid?: boolean;
  /** Obrigatório quando `assetType` é LOAN; proibido nos demais (ADR D-036). */
  loan?: LoanTerms | null;
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class CreateFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateFinancingPlanInput): Promise<{ planId: string }> {
    const description = input.description.trim();
    if (!description) throw new DomainError('FINANCING_DESCRIPTION_REQUIRED', 'Informe uma descrição para o financiamento.');
    if (!Number.isInteger(input.installmentAmountCents) || input.installmentAmountCents <= 0) {
      throw new DomainError('FINANCING_INSTALLMENT_AMOUNT_INVALID', 'Informe um valor de parcela maior que zero.');
    }
    if (!validDate(input.firstDueDate)) throw new DomainError('FINANCING_FIRST_DUE_DATE_INVALID', 'Informe uma data válida para o primeiro vencimento.');
    if (!allowedFinancingTerms(input.assetType).includes(input.termMonths)) {
      throw new DomainError(
        'FINANCING_TERM_NOT_ALLOWED',
        input.assetType === LOAN_FINANCING_TYPE
          ? `Informe a quantidade de parcelas do empréstimo, de 1 a ${LOAN_MAX_TERM_MONTHS}.`
          : 'O prazo não está disponível para esse tipo de financiamento.',
      );
    }
    const loan = resolveLoanTerms(input.assetType, input.loan);
    const categoryName = financingCategoryName(input.assetType);

    return this.uow.run(async (repos) => {
      const [resource, membership, categories] = await Promise.all([
        repos.resources.findById(input.paymentResourceId),
        repos.memberships.findByPersonAndNucleus(input.responsiblePersonId, input.nucleusId),
        repos.categories.listByNucleus(input.nucleusId),
      ]);
      if (!resource || resource.nucleusId !== input.nucleusId) throw new NotFoundError('Conta de pagamento', input.paymentResourceId);
      if (resource.archived) throw new DomainError('RESOURCE_ARCHIVED', 'Reative a conta antes de vinculá-la ao financiamento.');
      if (resource.type !== 'MONEY_ACCOUNT' && resource.type !== 'CASH') {
        throw new DomainError('FINANCING_PAYMENT_RESOURCE_INVALID', 'Vincule uma conta ou dinheiro físico para pagar as parcelas.');
      }
      if (!membership) throw new DomainError('MEMBER_NOT_IN_NUCLEUS', 'A pessoa responsável não pertence a este núcleo.');
      const category = categories.find((item) => item.name === categoryName && item.kind === 'EXPENSE');
      if (!category) throw new DomainError('FINANCING_CATEGORY_MISSING', `A categoria ${categoryName} não está disponível neste núcleo.`);

      const now = new Date();
      const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentMonthInstallment = currentMonthInstallmentNearDate(input.firstDueDate, input.termMonths, entryDate);
      if (currentMonthInstallment !== null && input.currentMonthInstallmentPaid === undefined) {
        throw new DomainError('FINANCING_CURRENT_INSTALLMENT_CONFIRMATION_REQUIRED', 'Confirme se a parcela com vencimento próximo neste mês já foi paga.');
      }
      const plan: FinancingPlan = {
        id: uuid(), nucleusId: input.nucleusId, categoryId: category.id, assetType: input.assetType,
        description, termMonths: input.termMonths,
        installmentAmountCents: Money.fromCents(input.installmentAmountCents).toCents(),
        firstDueDate: input.firstDueDate, paymentResourceId: resource.id,
        responsiblePersonId: input.responsiblePersonId, createdByPersonId: input.createdByPersonId,
        loan, status: 'ACTIVE', createdAt: now,
      };
      const installments: FinancingInstallment[] = Array.from({ length: plan.termMonths }, (_, index) => {
        const installmentNumber = index + 1;
        const dueDate = financingDueDate(plan.firstDueDate, installmentNumber);
        const isNearCurrentMonth = installmentNumber === currentMonthInstallment;
        const wasAlreadyPaid = isNearCurrentMonth
          ? input.currentMonthInstallmentPaid === true
          : dueDate < entryDate;
        return {
          id: uuid(), planId: plan.id, installmentNumber,
          dueDate,
          amountCents: plan.installmentAmountCents,
          paidAmountCents: wasAlreadyPaid ? plan.installmentAmountCents : null,
          status: wasAlreadyPaid ? 'PAID' : 'PENDING',
          paidAt: wasAlreadyPaid ? dueDate : null, paymentMovementId: null, paymentResourceId: resource.id,
        };
      });
      const historicalPaidCount = installments.filter((item) => item.status === 'PAID').length;
      const completedPlan: FinancingPlan = historicalPaidCount === installments.length ? { ...plan, status: 'COMPLETED' } : plan;
      await repos.financings.create(completedPlan, installments);
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'CREATE_FINANCING_PLAN',
        actorPersonId: input.createdByPersonId, nucleusId: input.nucleusId,
        after: { assetType: plan.assetType, termMonths: plan.termMonths, installmentAmountCents: plan.installmentAmountCents, firstDueDate: plan.firstDueDate, paymentResourceId: plan.paymentResourceId, entryDate, planStatus: completedPlan.status, installmentsMarkedPaidAtRegistration: historicalPaidCount, currentMonthInstallment, currentMonthInstallmentPaid: input.currentMonthInstallmentPaid ?? null, loan },
      }));
      return { planId: plan.id };
    });
  }
}
