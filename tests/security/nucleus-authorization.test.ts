import { afterEach, describe, expect, it } from 'vitest';
import { buildAuthenticatedHandler } from '../../electron/main/ipc/handlerFactory';
import { LOCAL_IDENTITY_SINGLETON_ID } from '../../src/domain/entities/LocalIdentity';
import { ListByNucleusSchema } from '../../src/shared/ipc-contract';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Segurança — autorização de núcleo consistente em qualquer canal com nucleusId (ADR D-025)', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('rejeita um payload com nucleusId válido (UUID real) mas que não pertence à identidade local', async () => {
    db = await createTestDb();
    // Duas instalações lógicas dentro do mesmo teste: só uma tem local_identity — a real.
    const home = await seedPersonAndNucleus(db);
    const stranger = await seedPersonAndNucleus(db); // núcleo de "outra pessoa"
    await seedResource(db, home.nucleus.id, home.person.id, { initialBalanceCents: 0 });
    await seedResource(db, stranger.nucleus.id, stranger.person.id, { initialBalanceCents: 999999 });

    // Simula a identidade local desta instalação sendo a de "home".
    db.raw
      .prepare('DELETE FROM local_identity')
      .run();
    db.raw
      .prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)')
      .run(LOCAL_IDENTITY_SINGLETON_ID, home.person.id, new Date().toISOString());

    const handler = buildAuthenticatedHandler(
      { repos: db.repos, uow: db.uow },
      'resource:list',
      ListByNucleusSchema,
      async (payload) => db.repos.resources.listByNucleus(payload.nucleusId),
    );

    // Payload sintaticamente válido (UUID de verdade), mas de um núcleo alheio.
    const result = await handler({ nucleusId: stranger.nucleus.id });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('permite o mesmo canal quando o nucleusId é o da própria identidade local', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 12345 });

    db.raw.prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)').run(LOCAL_IDENTITY_SINGLETON_ID, person.id, new Date().toISOString());

    const handler = buildAuthenticatedHandler(
      { repos: db.repos, uow: db.uow },
      'resource:list',
      ListByNucleusSchema,
      async (payload) => db.repos.resources.listByNucleus(payload.nucleusId),
    );

    const result = await handler({ nucleusId: nucleus.id });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
    }
  });
});
