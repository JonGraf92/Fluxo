import { afterEach, describe, expect, it } from 'vitest';
import { allowedFinancingTerms, financingDueDate } from '../../src/domain/entities/Financing';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateFinancingPlan } from '../../src/application/use-cases/financing/CreateFinancingPlan';
import { PayFinancingInstallment } from '../../src/application/use-cases/financing/PayFinancingInstallment';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function futureFirstDueDate(): string {
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() + 2);
  return localIso(date);
}

describe('Previsões de financiamento', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('aplica prazos por tipo e calcula corretamente vencimentos mensais', () => {
    expect(allowedFinancingTerms('CAR')).toEqual([12, 24, 36, 48, 60]);
    expect(allowedFinancingTerms('HOUSE')).toEqual(Array.from({ length: 16 }, (_, index) => 240 + index * 12));
    expect(allowedFinancingTerms('PROPERTY_CONSORTIUM')).toContain(420);
    expect(allowedFinancingTerms('VEHICLE_CONSORTIUM')).toContain(60);
    expect(financingDueDate('2026-01-31', 1)).toBe('2026-01-31');
    expect(financingDueDate('2026-01-31', 2)).toBe('2026-02-28');
    expect(financingDueDate('2026-01-31', 3)).toBe('2026-03-31');
  });

  it('mantém parcelas como previsões e baixa somente após confirmação pelo valor efetivamente pago', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta parcela', initialBalanceCents: 10000 });
    const create = new CreateFinancingPlan(db.uow);
    const firstDueDate = futureFirstDueDate();
    const { planId } = await create.execute({ nucleusId: nucleus.id, assetType: 'CAR', description: 'Carro', termMonths: 12, installmentAmountCents: 5000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id });
    const before = await new GetDashboardSummary(db.repos).execute({ nucleusId: nucleus.id, periodDateFrom: '2026-01-01', periodDateTo: '2026-01-31' });
    expect(before.moneyTotalCents).toBe(10000);
    const [record] = await db.repos.financings.listByNucleus(nucleus.id);
    expect(record?.installments).toHaveLength(12);
    expect(record?.installments.every((item) => item.status === 'PENDING')).toBe(true);
    expect(record?.installments[1]?.dueDate).toBe(financingDueDate(firstDueDate, 2));

    await new PayFinancingInstallment(db.uow).execute({ nucleusId: nucleus.id, installmentId: record!.installments[0]!.id, paymentResourceId: account.id, paymentMethod: 'PIX', paidAmountCents: 5500, paidAt: firstDueDate, actorPersonId: person.id });
    const after = await new GetDashboardSummary(db.repos).execute({ nucleusId: nucleus.id, periodDateFrom: '2026-01-01', periodDateTo: '2026-01-31' });
    expect(after.moneyTotalCents).toBe(4500);
    const movement = (await db.repos.movements.list({ nucleusId: nucleus.id })).find((item) => item.type === 'EXPENSE');
    expect(movement?.categoryId).toBe((await db.repos.categories.listByNucleus(nucleus.id)).find((item) => item.name === 'Financiamentos')?.id);
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('ACTIVE');
  });

  it('impede confirmar a parcela quando a conta vinculada não tem saldo suficiente', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 1000 });
    const firstDueDate = futureFirstDueDate();
    const { planId } = await new CreateFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, assetType: 'MOTORCYCLE', description: 'Moto', termMonths: 12, installmentAmountCents: 5000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id });
    const [record] = await db.repos.financings.listByNucleus(nucleus.id);
    await expect(new PayFinancingInstallment(db.uow).execute({ nucleusId: nucleus.id, installmentId: record!.installments[0]!.id, paymentResourceId: account.id, paymentMethod: 'DEBIT', paidAmountCents: 5000, paidAt: firstDueDate, actorPersonId: person.id })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('ACTIVE');
    expect((await db.repos.movements.list({ nucleusId: nucleus.id })).filter((item) => item.type === 'EXPENSE')).toHaveLength(0);
  });

  it('marca parcelas históricas como pagas e pergunta sobre a parcela atual próxima ao vencimento', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 10000 });
    const now = new Date();
    const currentDate = localIso(now);
    const first = new Date(now.getFullYear() - 1, now.getMonth(), Math.min(now.getDate(), 28));
    const firstDueDate = localIso(first);
    const create = new CreateFinancingPlan(db.uow);
    const base = { nucleusId: nucleus.id, assetType: 'CAR' as const, description: 'Carro cadastrado no meio do contrato', termMonths: 24, installmentAmountCents: 1000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id };
    await expect(create.execute(base)).rejects.toMatchObject({ code: 'FINANCING_CURRENT_INSTALLMENT_CONFIRMATION_REQUIRED' });
    const { planId } = await create.execute({ ...base, currentMonthInstallmentPaid: true });
    const record = (await db.repos.financings.listByNucleus(nucleus.id)).find((item) => item.plan.id === planId)!;
    const currentInstallment = record.installments.find((item) => item.dueDate.slice(0, 7) === currentDate.slice(0, 7));
    expect(currentInstallment?.status).toBe('PAID');
    expect(record.installments.filter((item) => item.dueDate < currentDate).every((item) => item.status === 'PAID')).toBe(true);
    expect(record.installments.some((item) => item.status === 'PENDING' && item.dueDate > currentDate)).toBe(true);
    expect((await db.repos.movements.list({ nucleusId: nucleus.id })).filter((item) => item.type === 'EXPENSE')).toHaveLength(0);
    expect((await new GetDashboardSummary(db.repos).execute({ nucleusId: nucleus.id, periodDateFrom: currentDate.slice(0, 8) + '01', periodDateTo: currentDate })).moneyTotalCents).toBe(10000);
    const unpaidPlan = await create.execute({ ...base, description: 'Carro com parcela atual pendente', currentMonthInstallmentPaid: false });
    const unpaidRecord = (await db.repos.financings.listByNucleus(nucleus.id)).find((item) => item.plan.id === unpaidPlan.planId)!;
    expect(unpaidRecord.installments.find((item) => item.dueDate.slice(0, 7) === currentDate.slice(0, 7))?.status).toBe('PENDING');
  });
});
