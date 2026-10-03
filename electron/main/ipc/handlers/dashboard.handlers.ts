import { GetDashboardSummary } from '../../../../src/application/use-cases/balance/GetDashboardSummary';
import { CHANNELS, DashboardSummaryDto, GetDashboardSummarySchema } from '../../../../src/shared/ipc-contract';
import { toResourceDto } from '../dto';
import { IpcContext, handleAuthenticated } from '../register';

export function registerDashboardHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof GetDashboardSummarySchema, DashboardSummaryDto>(
    ctx,
    CHANNELS.dashboardGetSummary,
    GetDashboardSummarySchema,
    async (payload) => {
      const summary = await new GetDashboardSummary(ctx.repos).execute(payload);
      return {
        resources: summary.resources.map((r) => ({
          resource: toResourceDto(r.resource),
          balanceCents: r.balanceCents,
        })),
        moneyTotalCents: summary.moneyTotalCents,
        applicationTotalCents: summary.applicationTotalCents,
        benefitTotalCents: summary.benefitTotalCents,
        creditOutstandingCents: summary.creditOutstandingCents,
        periodIncomeCents: summary.periodIncomeCents,
        periodExpenseCents: summary.periodExpenseCents,
        recentMovements: summary.recentMovements.map((entry) => ({
          id: entry.movement.id,
          nucleusId: entry.movement.nucleusId,
          type: entry.movement.type,
          status: entry.movement.status,
          date: entry.movement.date,
          description: entry.movement.description,
          categoryId: entry.movement.categoryId,
          responsiblePersonId: entry.movement.responsiblePersonId,
          paymentMethod: entry.movement.paymentMethod,
          invoiceDueDate: entry.movement.invoiceDueDate,
          cancelledAt: entry.movement.cancelledAt ? entry.movement.cancelledAt.toISOString() : null,
          cancelledReason: entry.movement.cancelledReason,
          legs: entry.legs.map((leg) => ({ id: leg.id, resourceId: leg.resourceId, amountCents: leg.amountCents })),
        })),
      };
    },
  );
}
