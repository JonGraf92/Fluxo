import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateFinancingPlan } from '../../src/application/use-cases/financing/CreateFinancingPlan';
import { CancelMovement } from '../../src/application/use-cases/movement/CancelMovement';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

/** ADR D-037: período livre, gasto por categoria e benefício fora do resultado em dinheiro. */
describe('Painel — resultado do período e gastos por categoria', () => {
  const period = { periodDateFrom: '2026-11-05', periodDateTo: '2026-12-04' };
  let db: TestDb;
  let personId: string;
  let nucleusId: string;
  let accountId: string;
  let benefitId: string;
  let cardId: string;
  let food: string;
  let transport: string;
  let salary: string;
  let op = 0;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    personId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, personId, { initialBalanceCents: 500_000 })).id;
    benefitId = (await seedResource(db, nucleusId, personId, { name: 'VR', type: 'BENEFIT', benefitSubtype: 'VR', initialBalanceCents: 0 })).id;
    cardId = (await new CreateResource(db.uow).execute({ nucleusId, name: 'Cartão', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 1, initialBalanceCents: 0, ownerPersonId: personId })).resource.id;
    const byName = (name: string) => categories.find((category) => category.name === name)!.id;
    food = byName('Alimentação');
    transport = byName('Transporte');
    salary = byName('Salário');
  });

  afterEach(() => db.close());

  const base = () => ({ nucleusId, createdByPersonId: personId, clientOperationId: 'op-' + (op += 1) });
  const income = (resourceId: string, amountCents: number, date: string, categoryId: string | null = salary) =>
    new CreateIncome(db.uow).execute({ ...base(), resourceId, categoryId, amountCents, description: 'Entrada', date });
  const expense = (resourceId: string, amountCents: number, date: string, categoryId: string | null, invoiceDueDate?: string) =>
    new CreateExpense(db.uow).execute({ ...base(), resourceId, categoryId, amountCents, description: 'Saída', date, invoiceDueDate });
  const summary = () => new GetDashboardSummary(db.repos).execute({ nucleusId, ...period });

  it('separa dinheiro de benefício e respeita o intervalo de datas, inclusive as bordas', async () => {
    await income(accountId, 300_000, '2026-11-05');
    await income(benefitId, 60_000, '2026-11-06', null);
    await income(accountId, 999, '2026-11-04'); // véspera do período
    await expense(accountId, 20_000, '2026-12-04', food); // último dia
    await expense(accountId, 777, '2026-12-05', food); // dia seguinte
    await expense(benefitId, 15_000, '2026-11-10', food);
    await expense(cardId, 8_000, '2026-11-12', transport, '2026-12-10');

    const result = await summary();

    expect(result.periodIncomeCents).toBe(300_000);
    expect(result.periodBenefitIncomeCents).toBe(60_000);
    expect(result.periodExpenseCents).toBe(28_000); // conta + cartão, na data da compra
    expect(result.periodBenefitExpenseCents).toBe(15_000);
  });

  it('agrupa saídas por categoria, da maior para a menor, com benefício em coluna própria', async () => {
    await expense(accountId, 20_000, '2026-11-10', food);
    await expense(benefitId, 15_000, '2026-11-10', food);
    await expense(cardId, 8_000, '2026-11-12', transport, '2026-12-10');
    await expense(accountId, 500, '2026-11-13', null);
    const cancelled = await expense(accountId, 90_000, '2026-11-14', transport);
    await new CancelMovement(db.uow).execute({ movementId: cancelled.movementId, reason: 'lançado errado', actorPersonId: personId });

    const result = await summary();

    expect(result.expenseByCategory).toEqual([
      { categoryId: food, amountCents: 20_000, benefitAmountCents: 15_000 },
      { categoryId: transport, amountCents: 8_000, benefitAmountCents: 0 },
      { categoryId: null, amountCents: 500, benefitAmountCents: 0 },
    ]);
    const sum = result.expenseByCategory.reduce((total, item) => total + item.amountCents, 0);
    expect(sum).toBe(result.periodExpenseCents);
  });

  it('soma só as parcelas previstas de financiamentos ativos', async () => {
    expect((await summary()).financingOutstandingCents).toBe(0);
    const future = new Date();
    future.setMonth(future.getMonth() + 2, 15);
    const firstDueDate = future.getFullYear() + '-' + String(future.getMonth() + 1).padStart(2, '0') + '-15';
    const termMonths = 12;
    const installmentAmountCents = 45_000;
    await new CreateFinancingPlan(db.uow).execute({ nucleusId, assetType: 'CAR', description: 'Carro', termMonths, installmentAmountCents, firstDueDate, paymentResourceId: accountId, responsiblePersonId: personId, createdByPersonId: personId });

    expect((await summary()).financingOutstandingCents).toBe(termMonths * installmentAmountCents);
  });

  it('lista de recentes não traz lançamento com data depois do fim do período', async () => {
    await expense(accountId, 1_000, '2026-12-04', food);
    await expense(accountId, 2_000, '2027-01-15', food);

    const recent = (await summary()).recentMovements.map((entry) => entry.movement.date);

    expect(recent).toEqual(['2026-12-04']);
  });
});
