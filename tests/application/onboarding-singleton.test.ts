import { afterEach, describe, expect, it } from 'vitest';
import { CompleteOnboarding } from '../../src/application/use-cases/onboarding/CompleteOnboarding';
import { LOCAL_IDENTITY_SINGLETON_ID } from '../../src/domain/entities/LocalIdentity';
import { createTestDb, TestDb } from '../testDb';

describe('local_identity é um singleton — ADR D-026', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('uma segunda tentativa de onboarding é rejeitada e NÃO cria uma segunda identidade/núcleo silenciosamente', async () => {
    db = await createTestDb();

    const first = await new CompleteOnboarding(db.uow).execute({
      personDisplayName: 'Ana',
      nucleusName: 'Minhas finanças',
      firstResourceName: 'Conta principal',
      firstResourceInitialBalanceCents: 100000,
    });

    // Segunda tentativa — simula um duplo carregamento de tela, um retry, ou uso indevido
    // do IPC. Não deve ter sucesso, e não deve deixar nada gravado.
    await expect(
      new CompleteOnboarding(db.uow).execute({
        personDisplayName: 'Outra Pessoa',
        nucleusName: 'Outro núcleo',
        firstResourceName: 'Outra conta',
        firstResourceInitialBalanceCents: 999999,
      }),
    ).rejects.toThrow();

    // Nada da segunda tentativa deve ter sido persistido — nem parcial, nem completo.
    const persons = await db.kysely.selectFrom('persons').selectAll().execute();
    const identities = await db.kysely.selectFrom('local_identity').selectAll().execute();
    const nuclei = await db.kysely.selectFrom('financial_nuclei').selectAll().execute();
    const memberships = await db.kysely.selectFrom('memberships').selectAll().execute();
    const resources = await db.kysely.selectFrom('resources').selectAll().execute();

    expect(persons).toHaveLength(1);
    expect(identities).toHaveLength(1);
    expect(nuclei).toHaveLength(1);
    expect(memberships).toHaveLength(1);
    expect(resources).toHaveLength(1);

    // E continua sendo exatamente o que a primeira tentativa criou, não uma mistura.
    expect(persons[0]!.id).toBe(first.person.id);
    expect(persons[0]!.display_name).toBe('Ana');
    expect(nuclei[0]!.name).toBe('Minhas finanças');
  });

  it('garantia de banco: uma segunda linha em local_identity colide com a PRIMARY KEY, mesmo sem a checagem de aplicação', async () => {
    db = await createTestDb();
    const now = new Date().toISOString();

    db.raw.prepare('INSERT INTO persons (id, display_name, created_at) VALUES (?, ?, ?)').run('p1', 'Ana', now);
    db.raw
      .prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)')
      .run(LOCAL_IDENTITY_SINGLETON_ID, 'p1', now);

    db.raw.prepare('INSERT INTO persons (id, display_name, created_at) VALUES (?, ?, ?)').run('p2', 'Outra Pessoa', now);

    expect(() =>
      db.raw
        .prepare('INSERT INTO local_identity (id, person_id, installed_at) VALUES (?, ?, ?)')
        .run(LOCAL_IDENTITY_SINGLETON_ID, 'p2', now),
    ).toThrow(); // constraint de PRIMARY KEY do SQLite, independente de qualquer lógica de aplicação
  });
});
