import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { SetResourceArchived } from '../../src/application/use-cases/resource/SetResourceArchived';
import { UpdateResource } from '../../src/application/use-cases/resource/UpdateResource';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Ciclo do recurso — edicao de nome e arquivamento recuperavel', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('edita o nome, arquiva sem apagar o saldo/historico e permite reativar', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta antiga', initialBalanceCents: 5000 });
    const update = new UpdateResource(db.uow);
    await update.execute({ nucleusId: nucleus.id, resourceId: account.id, name: 'Conta renomeada', actorPersonId: person.id });
    expect((await db.repos.resources.findById(account.id))?.name).toBe('Conta renomeada');

    const archive = new SetResourceArchived(db.uow);
    await archive.execute({ nucleusId: nucleus.id, resourceId: account.id, archived: true, actorPersonId: person.id });
    expect(await db.repos.resources.listByNucleus(nucleus.id)).toHaveLength(0);
    expect((await db.repos.resources.listByNucleus(nucleus.id, { includeArchived: true }))[0]?.archived).toBe(true);
    await expect(new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: account.id, categoryId: categories.find((category) => category.kind === 'EXPENSE')!.id, amountCents: 500, description: 'Nao deve gravar', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'archived-expense' })).rejects.toMatchObject({ code: 'RESOURCE_ARCHIVED' });
    expect(await db.repos.movements.list({ nucleusId: nucleus.id })).toHaveLength(0);

    await archive.execute({ nucleusId: nucleus.id, resourceId: account.id, archived: false, actorPersonId: person.id });
    const restored = await db.repos.resources.findById(account.id);
    expect(restored).toMatchObject({ name: 'Conta renomeada', archived: false, initialBalanceCents: 5000 });
    expect((await db.repos.resources.listByNucleus(nucleus.id))).toHaveLength(1);
  });
});
