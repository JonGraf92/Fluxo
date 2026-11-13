import { GetDashboardSummary } from '../../../../src/application/use-cases/balance/GetDashboardSummary';
import { CHANNELS, DashboardSummaryDto, GetDashboardSummarySchema } from '../../../../src/shared/ipc-contract';
import { toMovementDto, toResourceDto } from '../dto';
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
        periodBenefitIncomeCents: summary.periodBenefitIncomeCents,
        periodBenefitExpenseCents: summary.periodBenefitExpenseCents,
        expenseByCategory: summary.expenseByCategory,
        financingOutstandingCents: summary.financingOutstandingCents,
        recentMovements: summary.recentMovements.map(toMovementDto),
      };
    },
  );
}
