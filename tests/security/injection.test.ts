import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Segurança — parametrização via Kysely (seção 36/44)', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('entrada maliciosa em campo de texto é armazenada literalmente, nunca executada como SQL', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });

    const maliciousDescription = "'; DROP TABLE movements;--";

    const result = await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      categoryId: null,
      amountCents: 1000,
      description: maliciousDescription,
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'injection-op',
    });

    // Se a tabela tivesse sido derrubada, esta consulta lançaria um erro do SQLite.
    const movement = await db.repos.movements.findById(result.movementId);
    expect(movement?.description).toBe(maliciousDescription); // gravado como dado, nunca executado

    const allMovements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(allMovements).toHaveLength(1); // a tabela continua intacta e utilizável
  });
});
