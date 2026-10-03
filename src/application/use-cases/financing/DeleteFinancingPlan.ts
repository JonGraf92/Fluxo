import { NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

export class DeleteFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: { nucleusId: string; planId: string; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const plan = await repos.financings.findPlanById(input.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', input.planId);
      const installments = await repos.financings.listInstallments(plan.id);
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'DELETE_FINANCING_PLAN',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { assetType: plan.assetType, description: plan.description, status: plan.status, installmentCount: installments.length, paidCount: installments.filter((item) => item.status === 'PAID').length },
      }));
      await repos.financings.deletePlan(plan.id);
    });
  }
}
