import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Segurança — isolamento entre núcleos', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('rejeita lançar movimentação em um recurso de outro núcleo', async () => {
    db = await createTestDb();
    const nucleusA = await seedPersonAndNucleus(db);
    const nucleusB = await seedPersonAndNucleus(db);
    const resourceOfA = await seedResource(db, nucleusA.nucleus.id, nucleusA.person.id, { initialBalanceCents: 100000 });

    // Tenta usar o nucleusId de B com um resourceId que pertence a A — deve ser rejeitado.
    await expect(
      new CreateExpense(db.uow).execute({
        nucleusId: nucleusB.nucleus.id,
        resourceId: resourceOfA.id,
        categoryId: null,
        amountCents: 1000,
        description: 'Tentativa de acesso indevido',
        date: '2026-01-01',
        createdByPersonId: nucleusB.person.id,
        clientOperationId: 'cross-nucleus-op',
      }),
    ).rejects.toThrow();
  });

  it('listagem de movimentações de um núcleo nunca retorna movimentações de outro', async () => {
    db = await createTestDb();
    const nucleusA = await seedPersonAndNucleus(db);
    const nucleusB = await seedPersonAndNucleus(db);
    const resourceA = await seedResource(db, nucleusA.nucleus.id, nucleusA.person.id, { initialBalanceCents: 0 });
    const resourceB = await seedResource(db, nucleusB.nucleus.id, nucleusB.person.id, { initialBalanceCents: 0 });

    await new CreateExpense(db.uow).execute({
      nucleusId: nucleusA.nucleus.id,
      resourceId: resourceA.id,
      categoryId: null,
      amountCents: 1000,
      description: 'Gasto de A',
      date: '2026-01-01',
      createdByPersonId: nucleusA.person.id,
      clientOperationId: 'op-a',
    });
    await new CreateExpense(db.uow).execute({
      nucleusId: nucleusB.nucleus.id,
      resourceId: resourceB.id,
      categoryId: null,
      amountCents: 2000,
      description: 'Gasto de B',
      date: '2026-01-01',
      createdByPersonId: nucleusB.person.id,
      clientOperationId: 'op-b',
    });

    const movementsOfA = await db.repos.movements.list({ nucleusId: nucleusA.nucleus.id });
    expect(movementsOfA).toHaveLength(1);
    expect(movementsOfA[0]!.description).toBe('Gasto de A');
  });
});
