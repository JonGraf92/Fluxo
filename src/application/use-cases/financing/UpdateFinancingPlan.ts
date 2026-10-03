import { FinancingAssetType } from '../../../domain/entities/Financing';
import { NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

export class UpdateFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: { nucleusId: string; planId: string; assetType: FinancingAssetType; description: string; installmentAmountCents: number; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const plan = await repos.financings.findPlanById(input.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', input.planId);
      const values = { assetType: input.assetType, description: input.description.trim(), installmentAmountCents: input.installmentAmountCents };
      await repos.financings.updateDetails(plan.id, values);
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'UPDATE_FINANCING_PLAN',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { assetType: plan.assetType, description: plan.description, installmentAmountCents: plan.installmentAmountCents },
        after: values,
      }));
    });
  }
}
