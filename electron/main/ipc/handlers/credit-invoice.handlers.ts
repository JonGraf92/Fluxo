import { CloseCreditInvoice } from '../../../../src/application/use-cases/movement/CloseCreditInvoice';
import { ListOpenCreditInvoices } from '../../../../src/application/use-cases/movement/ListOpenCreditInvoices';
import { PayCreditInvoice } from '../../../../src/application/use-cases/movement/PayCreditInvoice';
import { CHANNELS, CloseCreditInvoiceSchema, ListCreditInvoicesSchema, OpenCreditInvoiceDto, PayCreditInvoiceSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handleAuthenticated } from '../register';

export function registerCreditInvoiceHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof ListCreditInvoicesSchema, OpenCreditInvoiceDto[]>(ctx, CHANNELS.creditInvoicesList, ListCreditInvoicesSchema, async (payload) => new ListOpenCreditInvoices(ctx.repos).execute(payload.nucleusId));
  handleAuthenticated<typeof CloseCreditInvoiceSchema, { closed: boolean }>(ctx, CHANNELS.creditInvoiceClose, CloseCreditInvoiceSchema, async (payload) => new CloseCreditInvoice(ctx.uow).execute(payload));
  handleAuthenticated<typeof PayCreditInvoiceSchema, { movementId: string; wasAlreadyCreated: boolean; amountCents: number }>(ctx, CHANNELS.creditInvoicePay, PayCreditInvoiceSchema, async (payload, auth) => new PayCreditInvoice(ctx.uow).execute({ ...payload, createdByPersonId: auth.personId }));
}
