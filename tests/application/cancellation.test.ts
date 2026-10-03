import { afterEach, describe, expect, it } from 'vitest';
import { CancelMovement } from '../../src/application/use-cases/movement/CancelMovement';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('CancelMovement — seção 19/40: nunca apaga, só deixa de contar no saldo', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('movimento cancelado some do saldo mas permanece visível no histórico', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 0 });

    await new CreateIncome(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      categoryId: null,
      amountCents: 10000,
      description: 'Salário',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'income-op',
    });
    const expense = await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      categoryId: null,
      amountCents: 3000,
      description: 'Compra errada',
      date: '2026-01-02',
      createdByPersonId: person.id,
      clientOperationId: 'expense-op',
    });

    let legs = await db.repos.movements.listLegsForBalance(nucleus.id);
    expect(calculateResourceBalance(conta.id, 0, legs).toCents()).toBe(7000);

    await new CancelMovement(db.uow).execute({
      movementId: expense.movementId,
      reason: 'Lançado por engano',
      actorPersonId: person.id,
    });

    // Saldo volta a refletir só a entrada — a saída cancelada não conta mais.
    legs = await db.repos.movements.listLegsForBalance(nucleus.id);
    expect(calculateResourceBalance(conta.id, 0, legs).toCents()).toBe(10000);

    // Mas a movimentação original AINDA existe, com status CANCELLED — nunca é apagada.
    const stillThere = await db.repos.movements.findById(expense.movementId);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe('CANCELLED');
    expect(stillThere?.description).toBe('Compra errada');
    expect(stillThere?.cancelledReason).toBe('Lançado por engano');

    const allMovements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(allMovements).toHaveLength(2); // entrada + saída cancelada, nenhuma linha removida
  });

  it('não permite cancelar duas vezes o mesmo movimento', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 10000 });
    const expense = await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      categoryId: null,
      amountCents: 1000,
      description: 'X',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'op-1',
    });

    await new CancelMovement(db.uow).execute({ movementId: expense.movementId, reason: 'motivo', actorPersonId: person.id });

    await expect(
      new CancelMovement(db.uow).execute({ movementId: expense.movementId, reason: 'de novo', actorPersonId: person.id }),
    ).rejects.toThrow();
  });
});
