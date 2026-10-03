import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

export class CancelFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}
  async execute(input: { nucleusId: string; planId: string; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const plan = await repos.financings.findPlanById(input.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', input.planId);
      if (plan.status === 'COMPLETED') throw new DomainError('FINANCING_ALREADY_COMPLETED', 'Este financiamento já foi concluído.');
      if (plan.status === 'CANCELLED') return;
      await repos.financings.setPlanStatus(plan.id, 'CANCELLED');
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'CANCEL_FINANCING_PLAN',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { status: plan.status }, after: { status: 'CANCELLED' },
      }));
    });
  }
}
