import BetterSqlite3 from 'better-sqlite3';
import { Kysely, Migration, Migrator, SqliteDialect } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/infrastructure/db/migrate';
import { InCodeMigrationProvider } from '../../src/infrastructure/db/migrations';
import { Database } from '../../src/infrastructure/db/types';

describe('Migration 0013 — categoria Combustível por chave (ADR D-038)', () => {
  let raw: BetterSqlite3.Database;
  afterEach(() => raw?.close());

  it('cria a categoria nos núcleos existentes e adota a que o usuário já tinha, sem duplicar', async () => {
    raw = new BetterSqlite3(':memory:');
    raw.pragma('foreign_keys = ON');
    const kysely = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
    const migrator = new Migrator({ db: kysely as unknown as Parameters<Migration['up']>[0], provider: new InCodeMigrationProvider(), migrationTableName: 'schema_migrations' });
    expect((await migrator.migrateTo('0012_loans')).error).toBeUndefined();
    const now = new Date().toISOString();
    const addNucleus = raw.prepare('INSERT INTO financial_nuclei (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    addNucleus.run('n1', 'Sem a categoria', 'INDIVIDUAL', now, now);
    addNucleus.run('n2', 'Já tinha', 'INDIVIDUAL', now, now);
    raw.prepare('INSERT INTO categories (id, nucleus_id, name, kind, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('c-usuario', 'n2', 'Combustível', 'EXPENSE', 0, now);

    await runMigrations(kysely);

    const fuel = (nucleusId: string) => raw.prepare("SELECT id, name, is_system FROM categories WHERE nucleus_id = ? AND system_key = 'FUEL'").all(nucleusId);
    expect(fuel('n1')).toEqual([{ id: expect.any(String), name: 'Combustível', is_system: 1 }]);
    expect(fuel('n2')).toEqual([{ id: 'c-usuario', name: 'Combustível', is_system: 0 }]);
    // Só uma categoria por chave em cada núcleo.
    expect(() => raw.prepare('INSERT INTO categories (id, nucleus_id, name, kind, is_system, system_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('c-dup', 'n1', 'Outra', 'EXPENSE', 0, 'FUEL', now)).toThrow();
  });
});
