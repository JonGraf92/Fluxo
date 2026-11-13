import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CancelMovement } from '../../src/application/use-cases/movement/CancelMovement';
import { CloseCreditInvoice } from '../../src/application/use-cases/movement/CloseCreditInvoice';
import { CreateExpense, CreateExpenseInput } from '../../src/application/use-cases/movement/CreateExpense';
import { ListOpenCreditInvoices } from '../../src/application/use-cases/movement/ListOpenCreditInvoices';
import { buildLegs, buildMovement } from '../../src/application/use-cases/movement/shared';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { MAX_CARD_INSTALLMENTS, splitInstallments } from '../../src/domain/services/CardInstallments';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

const TOTAL = 10_000;
const COUNT = 3;

/** Cartão fecha no dia 1 e vence no dia 10: compra em 10/11 entra na fatura de 10/12. */
describe('Compra parcelada no cartão (ADR D-039)', () => {
  let db: TestDb;
  let personId: string;
  let nucleusId: string;
  let cardId: string;
  let accountId: string;
  let op = 0;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    personId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, personId, { initialBalanceCents: 100_000 })).id;
    cardId = (await new CreateResource(db.uow).execute({ nucleusId, name: 'Cartão', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 1, initialBalanceCents: 0, ownerPersonId: personId })).resource.id;
  });

  afterEach(() => db.close());

  const purchase = (overrides: Partial<CreateExpenseInput> = {}) =>
    new CreateExpense(db.uow).execute({
      nucleusId, resourceId: cardId, categoryId: null, amountCents: TOTAL, description: 'Geladeira', date: '2026-11-10',
      invoiceDueDate: '2026-12-10', installments: COUNT, createdByPersonId: personId, clientOperationId: 'compra-' + (op += 1), ...overrides,
    });
  const confirmed = async () => (await db.repos.movements.list({ nucleusId, status: 'CONFIRMED' })).sort((a, b) => a.date.localeCompare(b.date));
  const invoices = async () => (await new ListOpenCreditInvoices(db.repos).execute(nucleusId)).map((invoice) => [invoice.dueDate, invoice.amountCents]);
  const summary = (from: string, to: string) => new GetDashboardSummary(db.repos).execute({ nucleusId, periodDateFrom: from, periodDateTo: to });

  it('divide em parcelas iguais, com a sobra de centavos na primeira', () => {
    expect(splitInstallments(TOTAL, COUNT)).toEqual([3_334, 3_333, 3_333]);
    expect(splitInstallments(TOTAL, 1)).toEqual([TOTAL]);
    for (const [total, count] of [[1, 1], [100, 3], [99_999, 7], [123_456, MAX_CARD_INSTALLMENTS]] as const) {
      const parts = splitInstallments(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      expect(Math.max(...parts.slice(1), 0)).toBeLessThanOrEqual(parts[0]!);
    }
  });

  it('gera uma compra por mês, cada uma na fatura do seu ciclo', async () => {
    await purchase();

    const movements = await confirmed();
    expect(movements.map((m) => [m.date, m.invoiceDueDate, m.description, m.installment?.number])).toEqual([
      ['2026-11-10', '2026-12-10', 'Geladeira (1/3)', 1],
      ['2026-12-10', '2027-01-10', 'Geladeira (2/3)', 2],
      ['2027-01-10', '2027-02-10', 'Geladeira (3/3)', 3],
    ]);
    expect(new Set(movements.map((m) => m.installment?.groupId)).size).toBe(1);
    expect(await invoices()).toEqual([['2026-12-10', 3_334], ['2027-01-10', 3_333], ['2027-02-10', 3_333]]);
    // A dívida do cartão é o total; o gasto de cada mês é só a parcela daquele mês.
    expect((await summary('2026-11-01', '2026-11-30')).creditOutstandingCents).toBe(TOTAL);
    expect((await summary('2026-11-01', '2026-11-30')).periodExpenseCents).toBe(3_334);
    expect((await summary('2026-12-01', '2026-12-31')).periodExpenseCents).toBe(3_333);
  });

  it('não derrapa no fim do mês e pula fatura já consolidada', async () => {
    await purchase({ date: '2026-01-31', invoiceDueDate: '2026-03-10' });
    expect((await confirmed()).map((m) => m.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect((await invoices()).map(([dueDate]) => dueDate)).toEqual(['2026-03-10', '2026-04-10', '2026-05-10']);

    await new CloseCreditInvoice(db.uow).execute({ nucleusId, cardResourceId: cardId, invoiceDueDate: '2026-04-10' });
    await purchase({ date: '2026-01-31', invoiceDueDate: '2026-03-10', description: 'Fogão' });
    const stove = (await confirmed()).filter((m) => m.description.startsWith('Fogão'));
    expect(stove.map((m) => m.invoiceDueDate)).toEqual(['2026-03-10', '2026-05-10', '2026-06-10']);
  });

  it('recusa parcelamento fora do crédito e quantidade inválida, sem gravar nada', async () => {
    await expect(purchase({ resourceId: accountId, invoiceDueDate: null })).rejects.toMatchObject({ code: 'INSTALLMENTS_ONLY_ON_CREDIT' });
    for (const installments of [0, -1, 1.5, MAX_CARD_INSTALLMENTS + 1]) {
      await expect(purchase({ installments })).rejects.toMatchObject({ code: 'INSTALLMENTS_INVALID' });
    }
    await expect(purchase({ amountCents: 2 })).rejects.toMatchObject({ code: 'INSTALLMENTS_INVALID' });
    expect(await confirmed()).toEqual([]);
  });

  it('reenvio da mesma operação não duplica as parcelas', async () => {
    const first = await purchase({ clientOperationId: 'mesma-op' });
    const again = await purchase({ clientOperationId: 'mesma-op' });
    expect(again).toEqual({ movementId: first.movementId, wasAlreadyCreated: true });
    expect(await confirmed()).toHaveLength(COUNT);
  });

  it('cancela só uma parcela ou a compra inteira, sem apagar nada', async () => {
    const { movementId } = await purchase();
    await new CancelMovement(db.uow).execute({ movementId, reason: 'parcela antecipada', actorPersonId: personId });
    expect((await confirmed()).map((m) => m.installment?.number)).toEqual([2, 3]);

    const [second] = await confirmed();
    await new CancelMovement(db.uow).execute({ movementId: second!.id, reason: 'compra devolvida', actorPersonId: personId, wholeInstallmentPurchase: true });
    expect(await confirmed()).toEqual([]);
    expect((await summary('2026-11-01', '2026-11-30')).creditOutstandingCents).toBe(0);
    expect(await db.repos.movements.list({ nucleusId, status: 'CANCELLED' })).toHaveLength(COUNT);
  });

  it('a fronteira de persistência recusa parcela fora do crédito ou com posição incoerente', async () => {
    const base = { nucleusId, type: 'EXPENSE' as const, status: 'CONFIRMED' as const, date: '2026-11-10', description: 'x', categoryId: null, createdByPersonId: personId };
    const debit = buildMovement({ ...base, paymentMethod: 'DEBIT', installment: { groupId: 'g', number: 1, count: 2 }, clientOperationId: 'p1' });
    await expect(db.repos.movements.createWithLegs(debit, buildLegs(debit.id, [{ resourceId: accountId, amountCents: -100 }]))).rejects.toMatchObject({ code: 'INSTALLMENT_INVALID' });
    const beyond = buildMovement({ ...base, paymentMethod: 'CREDIT', invoiceDueDate: '2026-12-10', installment: { groupId: 'g', number: 3, count: 2 }, clientOperationId: 'p2' });
    await expect(db.repos.movements.createWithLegs(beyond, buildLegs(beyond.id, [{ resourceId: cardId, amountCents: 100 }]))).rejects.toMatchObject({ code: 'INSTALLMENT_INVALID' });
  });
});
