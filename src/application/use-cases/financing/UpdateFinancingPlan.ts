import { FinancingAssetType, LOAN_FINANCING_TYPE, LoanTerms } from '../../../domain/entities/Financing';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';
import { resolveLoanTerms } from './loanTerms';

export class UpdateFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: { nucleusId: string; planId: string; assetType: FinancingAssetType; description: string; installmentAmountCents: number; loan?: LoanTerms | null; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const plan = await repos.financings.findPlanById(input.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', input.planId);
      // Empréstimo e financiamento usam categorias diferentes, e a categoria do plano já
      // está nos lançamentos das parcelas pagas. Trocar de um para o outro deixaria o
      // histórico numa categoria e as próximas baixas em outra (ADR D-036).
      if ((plan.assetType === LOAN_FINANCING_TYPE) !== (input.assetType === LOAN_FINANCING_TYPE)) {
        throw new DomainError('FINANCING_TYPE_CHANGE_NOT_ALLOWED', 'Não é possível transformar um financiamento em empréstimo, nem o contrário. Cadastre um novo plano.');
      }
      const loan = resolveLoanTerms(input.assetType, input.loan);
      const values = { assetType: input.assetType, description: input.description.trim(), installmentAmountCents: input.installmentAmountCents, loan };
      await repos.financings.updateDetails(plan.id, values);
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'UPDATE_FINANCING_PLAN',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { assetType: plan.assetType, description: plan.description, installmentAmountCents: plan.installmentAmountCents, loan: plan.loan },
        after: values,
      }));
    });
  }
}
