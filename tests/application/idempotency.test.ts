import { afterEach, describe, expect, it } from 'vitest';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateTransfer } from '../../src/application/use-cases/movement/CreateTransfer';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Idempotência via client_operation_id — ADR D-011', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('reenviar o mesmo client_operation_id NUNCA duplica o efeito financeiro (entrada)', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 0 });

    const payload = {
      nucleusId: nucleus.id,
      resourceId: conta.id,
      categoryId: null,
      amountCents: 10000,
      description: 'Depósito',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'same-operation-id',
    };

    const first = await new CreateIncome(db.uow).execute(payload);
    const second = await new CreateIncome(db.uow).execute(payload); // duplo clique / retry

    expect(first.wasAlreadyCreated).toBe(false);
    expect(second.wasAlreadyCreated).toBe(true);
    expect(second.movementId).toBe(first.movementId);

    const movements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(movements).toHaveLength(1); // nunca duas linhas

    const legsForBalance = await db.repos.movements.listLegsForBalance(nucleus.id);
    const saldo = calculateResourceBalance(conta.id, conta.initialBalanceCents, legsForBalance);
    expect(saldo.toCents()).toBe(10000); // R$ 100, nunca R$ 200
  });

  it('o mesmo comportamento vale para saída e transferência', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const a = await seedResource(db, nucleus.id, person.id, { name: 'A', initialBalanceCents: 100000 });
    const b = await seedResource(db, nucleus.id, person.id, { name: 'B', initialBalanceCents: 0 });

    const expensePayload = {
      nucleusId: nucleus.id,
      resourceId: a.id,
      categoryId: null,
      amountCents: 5000,
      description: 'Compra',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'expense-op',
    };
    await new CreateExpense(db.uow).execute(expensePayload);
    await new CreateExpense(db.uow).execute(expensePayload);

    const transferPayload = {
      nucleusId: nucleus.id,
      fromResourceId: a.id,
      toResourceId: b.id,
      amountCents: 20000,
      description: 'Transferência',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'transfer-op',
    };
    await new CreateTransfer(db.uow).execute(transferPayload);
    await new CreateTransfer(db.uow).execute(transferPayload);

    const movements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(movements.filter((m) => m.type === 'EXPENSE')).toHaveLength(1);
    expect(movements.filter((m) => m.type === 'TRANSFER')).toHaveLength(1);

    const legsForBalance = await db.repos.movements.listLegsForBalance(nucleus.id);
    const saldoA = calculateResourceBalance(a.id, a.initialBalanceCents, legsForBalance);
    const saldoB = calculateResourceBalance(b.id, b.initialBalanceCents, legsForBalance);
    expect(saldoA.toCents()).toBe(100000 - 5000 - 20000);
    expect(saldoB.toCents()).toBe(20000);
  });
});
