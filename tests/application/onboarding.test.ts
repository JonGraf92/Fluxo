import { afterEach, describe, expect, it } from 'vitest';
import { CompleteOnboarding } from '../../src/application/use-cases/onboarding/CompleteOnboarding';
import { GetAppState } from '../../src/application/use-cases/onboarding/GetAppState';
import { createTestDb, TestDb } from '../testDb';

describe('CompleteOnboarding — fluxo de primeiro uso (seção 29), atômico', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('cria pessoa, identidade local, núcleo, membership OWNER, categorias padrão e o primeiro recurso', async () => {
    db = await createTestDb();

    const result = await new CompleteOnboarding(db.uow).execute({
      personDisplayName: 'Ana',
      nucleusName: 'Minhas finanças',
      firstResourceName: 'Conta principal',
      firstResourceInitialBalanceCents: 200000,
    });

    const state = await new GetAppState(db.repos).execute();
    expect(state.isOnboarded).toBe(true);
    expect(state.personId).toBe(result.person.id);
    expect(state.nucleusId).toBe(result.nucleus.id);

    const owner = await db.repos.memberships.findOwner(result.nucleus.id);
    expect(owner?.personId).toBe(result.person.id); // única fonte de verdade — ADR D-016

    const categories = await db.repos.categories.listByNucleus(result.nucleus.id);
    expect(categories.length).toBeGreaterThan(0);

    const resources = await db.repos.resources.listByNucleus(result.nucleus.id);
    expect(resources).toHaveLength(1);
    expect(resources[0]!.initialBalanceCents).toBe(200000);
  });

  it('GetAppState retorna isOnboarded=false quando nada foi configurado ainda', async () => {
    db = await createTestDb();
    const state = await new GetAppState(db.repos).execute();
    expect(state.isOnboarded).toBe(false);
    expect(state.personId).toBeNull();
    expect(state.nucleusId).toBeNull();
  });
});
