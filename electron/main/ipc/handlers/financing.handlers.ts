import { CancelFinancingPlan } from '../../../../src/application/use-cases/financing/CancelFinancingPlan';
import { CreateFinancingPlan } from '../../../../src/application/use-cases/financing/CreateFinancingPlan';
import { DeleteFinancingPlan } from '../../../../src/application/use-cases/financing/DeleteFinancingPlan';
import { ListFinancingPlans } from '../../../../src/application/use-cases/financing/ListFinancingPlans';
import { PayFinancingInstallment } from '../../../../src/application/use-cases/financing/PayFinancingInstallment';
import { UpdateFinancingPlan } from '../../../../src/application/use-cases/financing/UpdateFinancingPlan';
import { CancelFinancingSchema, CHANNELS, CreateFinancingSchema, DeleteFinancingSchema, FinancingPlanDto, ListFinancingsSchema, PayFinancingInstallmentSchema, UpdateFinancingSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handleAuthenticated } from '../register';

export function registerFinancingHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof CreateFinancingSchema, { planId: string }>(ctx, CHANNELS.financingCreate, CreateFinancingSchema, async (payload, auth) => new CreateFinancingPlan(ctx.uow).execute({ ...payload, assetType: payload.assetType, createdByPersonId: auth.personId }));
  handleAuthenticated<typeof ListFinancingsSchema, FinancingPlanDto[]>(ctx, CHANNELS.financingList, ListFinancingsSchema, async (payload) => {
    const records = await new ListFinancingPlans(ctx.repos).execute(payload.nucleusId);
    return records.map(({ plan, installments }) => ({
      id: plan.id, assetType: plan.assetType, description: plan.description, termMonths: plan.termMonths,
      installmentAmountCents: plan.installmentAmountCents, firstDueDate: plan.firstDueDate,
      paymentResourceId: plan.paymentResourceId, responsiblePersonId: plan.responsiblePersonId, status: plan.status,
      installments: installments.map((item) => ({ id: item.id, installmentNumber: item.installmentNumber, dueDate: item.dueDate, amountCents: item.amountCents, paidAmountCents: item.paidAmountCents, status: item.status, paidAt: item.paidAt, paymentMovementId: item.paymentMovementId, paymentResourceId: item.paymentResourceId })),
    }));
  });
  handleAuthenticated<typeof PayFinancingInstallmentSchema, { movementId: string; paidAmountCents: number }>(ctx, CHANNELS.financingPayInstallment, PayFinancingInstallmentSchema, async (payload, auth) => new PayFinancingInstallment(ctx.uow).execute({ ...payload, actorPersonId: auth.personId }));
  handleAuthenticated<typeof CancelFinancingSchema, { cancelled: boolean }>(ctx, CHANNELS.financingCancel, CancelFinancingSchema, async (payload, auth) => { await new CancelFinancingPlan(ctx.uow).execute({ ...payload, actorPersonId: auth.personId }); return { cancelled: true }; });
  handleAuthenticated<typeof UpdateFinancingSchema, { updated: boolean }>(ctx, CHANNELS.financingUpdate, UpdateFinancingSchema, async (payload, auth) => { await new UpdateFinancingPlan(ctx.uow).execute({ ...payload, actorPersonId: auth.personId }); return { updated: true }; });
  handleAuthenticated<typeof DeleteFinancingSchema, { deleted: boolean }>(ctx, CHANNELS.financingDelete, DeleteFinancingSchema, async (payload, auth) => { await new DeleteFinancingPlan(ctx.uow).execute({ ...payload, actorPersonId: auth.personId }); return { deleted: true }; });
}
