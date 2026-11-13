import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CloseCreditInvoice } from '../../src/application/use-cases/movement/CloseCreditInvoice';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { ListOpenCreditInvoices } from '../../src/application/use-cases/movement/ListOpenCreditInvoices';
import { SettleCreditInvoice, SettleCreditInvoiceInput } from '../../src/application/use-cases/movement/SettleCreditInvoice';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { SettleCreditInvoiceSchema } from '../../src/shared/ipc-contract';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

const BALANCE = 100_000;
const INVOICE_TOTAL = 5_000;
const DUE = '2026-12-10';

describe('Pagar fatura em um passo (ADR D-040)', () => {
  let db: TestDb;
  let personId: string;
  let nucleusId: string;
  let accountId: string;
  let cardId: string;
  let op = 0;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    personId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, personId, { initialBalanceCents: BALANCE })).id;
    cardId = (await new CreateResource(db.uow).execute({ nucleusId, name: 'Cartão', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 1, initialBalanceCents: 0, ownerPersonId: personId })).resource.id;
    await buy(3_000);
    await buy(2_000);
  });

  afterEach(() => db.close());

  const buy = (amountCents: number, date = '2026-11-10', invoiceDueDate = DUE) =>
    new CreateExpense(db.uow).execute({ nucleusId, resourceId: cardId, categoryId: null, amountCents, description: 'Compra', date, invoiceDueDate, createdByPersonId: personId, clientOperationId: 'buy-' + (op += 1) });
  const settle = (overrides: Partial<SettleCreditInvoiceInput> = {}) =>
    new SettleCreditInvoice(db.uow).execute({
      nucleusId, cardResourceId: cardId, invoiceDueDate: DUE, paymentResourceId: accountId, date: '2026-12-08',
      paidAmountCents: INVOICE_TOTAL, createdByPersonId: personId, clientOperationId: 'pay-' + (op += 1), ...overrides,
    });
  const state = async () => {
    const summary = await new GetDashboardSummary(db.repos).execute({ nucleusId, periodDateFrom: '2026-12-01', periodDateTo: '2026-12-31' });
    return {
      money: summary.moneyTotalCents,
      cardDebt: summary.creditOutstandingCents,
      decemberExpense: summary.periodExpenseCents,
      invoice: (await db.repos.creditInvoices.findByCardAndDueDate(cardId, DUE))?.status ?? 'OPEN',
    };
  };
  const untouched = { money: BALANCE, cardDebt: INVOICE_TOTAL, decemberExpense: 0, invoice: 'OPEN' };

  it('consolida e paga na mesma operação, pelo total lançado', async () => {
    const result = await settle();

    expect(result).toMatchObject({ wasAlreadyCreated: false, amountCents: INVOICE_TOTAL });
    expect(await state()).toEqual({ money: BALANCE - INVOICE_TOTAL, cardDebt: 0, decemberExpense: 0, invoice: 'PAID' });
    const payment = await db.repos.movements.findById(result.movementId);
    expect(payment).toMatchObject({ type: 'TRANSFER', cardInvoiceResourceId: cardId, invoiceDueDate: DUE });
  });

  it('também paga fatura que já estava consolidada', async () => {
    await new CloseCreditInvoice(db.uow).execute({ nucleusId, cardResourceId: cardId, invoiceDueDate: DUE });
    await settle();
    expect((await state()).invoice).toBe('PAID');
  });

  it('recusa pagamento parcial e diferença sem classificação, sem gravar nada', async () => {
    await expect(settle({ paidAmountCents: INVOICE_TOTAL - 1 })).rejects.toMatchObject({ code: 'INVOICE_PARTIAL_NOT_SUPPORTED' });
    await expect(settle({ paidAmountCents: INVOICE_TOTAL + 250 })).rejects.toMatchObject({ code: 'INVOICE_DIFFERENCE_UNCLASSIFIED' });
    expect(await state()).toEqual(untouched);
  });

  it('valor pago a maior vira despesa no cartão, classificada, na mesma fatura', async () => {
    await settle({ paidAmountCents: INVOICE_TOTAL + 250, differenceKind: 'CHARGES' });

    expect(await state()).toEqual({ money: BALANCE - INVOICE_TOTAL - 250, cardDebt: 0, decemberExpense: 250, invoice: 'PAID' });
    const charges = (await db.repos.categories.listByNucleus(nucleusId)).find((category) => category.systemKey === 'CARD_CHARGES');
    const extra = (await db.repos.movements.list({ nucleusId, type: 'EXPENSE', dateFrom: '2026-12-08' }))[0];
    expect(extra).toMatchObject({ categoryId: charges!.id, paymentMethod: 'CREDIT', invoiceDueDate: DUE, date: '2026-12-08' });
  });

  it('compra não lançada entra sem categoria', async () => {
    await settle({ paidAmountCents: INVOICE_TOTAL + 990, differenceKind: 'UNRECORDED_PURCHASE' });
    const extra = (await db.repos.movements.list({ nucleusId, type: 'EXPENSE', dateFrom: '2026-12-08' }))[0];
    expect(extra?.categoryId).toBeNull();
    expect((await state()).cardDebt).toBe(0);
  });

  it('saldo insuficiente desfaz tudo, inclusive a diferença e a consolidação', async () => {
    await expect(settle({ paidAmountCents: BALANCE + 1, differenceKind: 'CHARGES' })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await state()).toEqual(untouched);
  });

  it('não paga duas vezes: segunda operação é recusada e reenvio da mesma não duplica', async () => {
    const first = await settle({ paidAmountCents: INVOICE_TOTAL + 250, differenceKind: 'CHARGES', clientOperationId: 'mesma-op' });
    const resent = await settle({ paidAmountCents: INVOICE_TOTAL + 250, differenceKind: 'CHARGES', clientOperationId: 'mesma-op' });
    expect(resent).toEqual({ movementId: first.movementId, wasAlreadyCreated: true, amountCents: 0 });
    await expect(settle()).rejects.toMatchObject({ code: 'INVOICE_ALREADY_PAID' });
    expect(await state()).toEqual({ money: BALANCE - INVOICE_TOTAL - 250, cardDebt: 0, decemberExpense: 250, invoice: 'PAID' });
  });

  it('sugere para a próxima fatura a conta usada no último pagamento do cartão', async () => {
    const before = await new ListOpenCreditInvoices(db.repos).execute(nucleusId);
    expect(before.map((invoice) => invoice.suggestedPaymentResourceId)).toEqual([null]);
    await settle();
    await buy(1_000, '2026-12-10', '2027-01-10');
    const next = (await new ListOpenCreditInvoices(db.repos).execute(nucleusId)).find((invoice) => invoice.dueDate === '2027-01-10');
    expect(next?.suggestedPaymentResourceId).toBe(accountId);
  });

  it('o contrato IPC recusa valor não inteiro e classificação desconhecida', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const base = { nucleusId: id, cardResourceId: id, invoiceDueDate: DUE, paymentResourceId: id, date: '2026-12-08', paidAmountCents: INVOICE_TOTAL, clientOperationId: id };
    expect(SettleCreditInvoiceSchema.safeParse(base).success).toBe(true);
    expect(SettleCreditInvoiceSchema.safeParse({ ...base, paidAmountCents: 50.5 }).success).toBe(false);
    expect(SettleCreditInvoiceSchema.safeParse({ ...base, paidAmountCents: 0 }).success).toBe(false);
    expect(SettleCreditInvoiceSchema.safeParse({ ...base, differenceKind: 'GIFT' }).success).toBe(false);
  });
});
