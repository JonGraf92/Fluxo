import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, TestDb } from '../testDb';

describe('SqliteUnitOfWork — atomicidade real (ADR D-012, cenário 59)', () => {
  let db: TestDb;

  afterEach(() => db?.close());

  it('desfaz TUDO se qualquer passo dentro da transação falhar — nunca fica estado parcial', async () => {
    db = await createTestDb();

    await expect(
      db.uow.run(async (repos) => {
        await repos.persons.create({ id: 'p1', displayName: 'Teste', createdAt: new Date() });
        // Uma segunda escrita bem-sucedida...
        await repos.persons.create({ id: 'p2', displayName: 'Teste 2', createdAt: new Date() });
        // ...seguida de uma falha proposital antes do commit.
        throw new Error('Falha proposital no meio da transação');
      }),
    ).rejects.toThrow('Falha proposital');

    const row = await db.kysely.selectFrom('persons').selectAll().execute();
    expect(row).toHaveLength(0); // nem p1 nem p2 foram persistidos — rollback total
  });

  it('confirma tudo quando não há erro', async () => {
    db = await createTestDb();
    await db.uow.run(async (repos) => {
      await repos.persons.create({ id: 'p1', displayName: 'Teste', createdAt: new Date() });
    });
    const rows = await db.kysely.selectFrom('persons').selectAll().execute();
    expect(rows).toHaveLength(1);
  });
});
