import { afterEach, describe, expect, it } from 'vitest';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus } from '../seed';

describe('CreateResource — ADR D-017: propriedade exige Membership no mesmo núcleo', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('rejeita criar recurso cujo "dono" não pertence ao núcleo', async () => {
    db = await createTestDb();
    const nucleusA = await seedPersonAndNucleus(db);
    const nucleusB = await seedPersonAndNucleus(db);

    await expect(
      new CreateResource(db.uow).execute({
        nucleusId: nucleusA.nucleus.id,
        name: 'Conta cruzada',
        type: 'MONEY_ACCOUNT',
        initialBalanceCents: 0,
        ownerPersonId: nucleusB.person.id, // pessoa de outro núcleo
      }),
    ).rejects.toThrow();
  });

  it('permite quando a pessoa é membro (OWNER) do núcleo do recurso', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);

    const result = await new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'Conta válida',
      type: 'MONEY_ACCOUNT',
      initialBalanceCents: 0,
      ownerPersonId: person.id,
    });

    expect(result.ownership.personId).toBe(person.id);
    expect(result.resource.nucleusId).toBe(nucleus.id);
  });
});
