import { afterEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('GetDashboardSummary — ADR D-023: nunca soma dinheiro com benefício', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('mantém moneyTotalCents e benefitTotalCents sempre separados (cenário 57)', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { name: 'Conta', type: 'MONEY_ACCOUNT', initialBalanceCents: 200000 });
    const vr = await seedResource(db, nucleus.id, person.id, { name: 'VR', type: 'BENEFIT', benefitSubtype: 'VR', initialBalanceCents: 80000 });

    await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: vr.id,
      categoryId: null,
      amountCents: 20000,
      description: 'Almoço',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'vr-expense',
    });

    const summary = await new GetDashboardSummary(db.repos).execute({
      nucleusId: nucleus.id,
      periodDateFrom: '2026-01-01',
      periodDateTo: '2026-01-31',
    });

    expect(summary.moneyTotalCents).toBe(200000); // conta intacta
    expect(summary.benefitTotalCents).toBe(60000); // 800 - 200 do almoço
    // Nunca deve existir um campo somando os dois — o DTO não tem "totalGeral".
    expect((summary as unknown as Record<string, unknown>).totalCents).toBeUndefined();

    const contaEntry = summary.resources.find((r) => r.resource.id === conta.id);
    const vrEntry = summary.resources.find((r) => r.resource.id === vr.id);
    expect(contaEntry?.balanceCents).toBe(200000);
    expect(vrEntry?.balanceCents).toBe(60000);
  });
});
