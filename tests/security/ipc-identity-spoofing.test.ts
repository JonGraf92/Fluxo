import { afterEach, describe, expect, it } from 'vitest';
import { buildAuthenticatedHandler } from '../../electron/main/ipc/handlerFactory';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateIncomeSchema } from '../../src/shared/ipc-contract';
import { LOCAL_IDENTITY_SINGLETON_ID } from '../../src/domain/entities/LocalIdentity';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

/**
 * Este teste exercita exatamente a mesma função (`buildAuthenticatedHandler`) que
 * `electron/main/ipc/register.ts` usa para conectar `ipcMain.handle` na aplicação real —
 * a única diferença é que aqui chamamos a função retornada diretamente, sem precisar de
 * um runtime Electron (ver ADR D-024).
 */
function makeCreateIncomeHandler(db: TestDb) {
  return buildAuthenticatedHandler(
    { repos: db.repos, uow: db.uow },
    'movement:createIncome',
    CreateIncomeSchema,
    async (payload, auth) => {
      // Mesma linha exata usada em electron/main/ipc/handlers/movement.handlers.ts:
      // createdByPersonId vem SEMPRE de auth.personId, nunca do payload.
      return new CreateIncome(db.uow).execute({
        ...payload,
        categoryId: payload.categoryId ?? null,
        createdByPersonId: auth.personId,
      });
    },
  );
}

describe('Segurança — um renderer malicioso não pode escolher outra personId (ADR D-024)', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('um payload com createdByPersonId forjado é rejeitado inteiramente (schema .strict())', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const resource = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 0 });
    db.raw.prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)').run(LOCAL_IDENTITY_SINGLETON_ID, person.id, new Date().toISOString());
    const handler = makeCreateIncomeHandler(db);

    const attackerForgedId = '99999999-9999-4999-8999-999999999999';

    const maliciousPayload = {
      nucleusId: nucleus.id,
      resourceId: resource.id,
      amountCents: 1000000, // tentativa de lançar um valor grande em nome de outra pessoa
      description: 'Tentativa de spoofing',
      date: '2026-01-01',
      clientOperationId: 'attack-op-1',
      createdByPersonId: attackerForgedId, // campo que o schema NÃO declara mais
    };

    const result = await handler(maliciousPayload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PAYLOAD');
    }

    // Nada foi criado.
    const movements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(movements).toHaveLength(0);
  });

  it('mesmo em uma chamada legítima, a movimentação é SEMPRE atribuída à identidade local real, nunca a um valor do payload', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const resource = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 0 });
    db.raw.prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)').run(LOCAL_IDENTITY_SINGLETON_ID, person.id, new Date().toISOString());
    const handler = makeCreateIncomeHandler(db);

    const legitimatePayload = {
      nucleusId: nucleus.id,
      resourceId: resource.id,
      amountCents: 5000,
      description: 'Depósito legítimo',
      date: '2026-01-01',
      clientOperationId: '10000000-0000-4000-8000-000000000001',
    };

    const result = await handler(legitimatePayload);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const movement = await db.repos.movements.findById(result.data.movementId);
      // A única identidade que pode ter sido usada é a da instalação (local_identity),
      // que é a mesma "person" criada pelo seed — nunca outra.
      expect(movement?.createdByPersonId).toBe(person.id);
    }
  });

  it('rejeita a chamada inteira se não houver identidade local configurada (evita atribuição a "ninguém")', async () => {
    db = await createTestDb();
    // Nucleus/resource criados diretamente no banco, SEM passar pelo onboarding —
    // simula um estado em que local_identity nunca foi criada.
    const now = new Date().toISOString();
    db.raw.prepare('INSERT INTO persons (id, display_name, created_at) VALUES (?, ?, ?)').run('20000000-0000-4000-8000-000000000001', 'Sem identidade', now);
    db.raw
      .prepare('INSERT INTO financial_nuclei (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('20000000-0000-4000-8000-000000000002', 'Núcleo', 'INDIVIDUAL', now, now);
    db.raw
      .prepare('INSERT INTO resources (id, nucleus_id, name, type, benefit_subtype, initial_balance_cents, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Conta', 'MONEY_ACCOUNT', null, 0, 0, now, now);

    const handler = makeCreateIncomeHandler(db);
    const result = await handler({
      nucleusId: '20000000-0000-4000-8000-000000000002',
      resourceId: '20000000-0000-4000-8000-000000000003',
      amountCents: 1000,
      description: 'Tentativa sem identidade',
      date: '2026-01-01',
      clientOperationId: '20000000-0000-4000-8000-000000000004',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
