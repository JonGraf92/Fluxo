import { afterEach, describe, expect, it } from 'vitest';
import { CancelMovement } from '../../src/application/use-cases/movement/CancelMovement';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('CancelMovement — autorização de núcleo mesmo sem nucleusId no payload (ADR D-025)', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('rejeita cancelamento por uma pessoa que não pertence ao núcleo da movimentação', async () => {
    db = await createTestDb();
    const owner = await seedPersonAndNucleus(db);
    const outsider = await seedPersonAndNucleus(db); // pessoa de OUTRO núcleo
    const resource = await seedResource(db, owner.nucleus.id, owner.person.id, { initialBalanceCents: 100000 });

    const expense = await new CreateExpense(db.uow).execute({
      nucleusId: owner.nucleus.id,
      resourceId: resource.id,
      categoryId: null,
      amountCents: 5000,
      description: 'Gasto legítimo',
      date: '2026-01-01',
      createdByPersonId: owner.person.id,
      clientOperationId: 'op-1',
    });

    await expect(
      new CancelMovement(db.uow).execute({
        movementId: expense.movementId,
        reason: 'Tentativa indevida',
        actorPersonId: outsider.person.id,
      }),
    ).rejects.toThrow();

    // O movimento permanece intocado — nem cancelado, nem alterado.
    const stillConfirmed = await db.repos.movements.findById(expense.movementId);
    expect(stillConfirmed?.status).toBe('CONFIRMED');
  });

  it('permite cancelamento pelo dono legítimo do núcleo', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const resource = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });

    const expense = await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: resource.id,
      categoryId: null,
      amountCents: 5000,
      description: 'Gasto legítimo',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'op-2',
    });

    await new CancelMovement(db.uow).execute({
      movementId: expense.movementId,
      reason: 'Motivo válido',
      actorPersonId: person.id,
    });

    const cancelled = await db.repos.movements.findById(expense.movementId);
    expect(cancelled?.status).toBe('CANCELLED');
  });
});
