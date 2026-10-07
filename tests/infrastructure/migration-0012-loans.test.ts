import BetterSqlite3 from 'better-sqlite3';
import { Kysely, Migration, Migrator, SqliteDialect } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { LOAN_CATEGORY_NAME } from '../../src/domain/entities/Financing';
import { runMigrations } from '../../src/infrastructure/db/migrate';
import { InCodeMigrationProvider } from '../../src/infrastructure/db/migrations';
import { Database } from '../../src/infrastructure/db/types';

const PREVIOUS_MIGRATION = '0011_card_invoice_reference';

describe('Migration 0012 — empréstimos (ADR D-036)', () => {
  let raw: BetterSqlite3.Database;
  afterEach(() => raw?.close());

  async function migratedToPrevious(): Promise<Kysely<Database>> {
    raw = new BetterSqlite3(':memory:');
    raw.pragma('foreign_keys = ON');
    const kysely = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
    const migrator = new Migrator({
      db: kysely as unknown as Parameters<Migration['up']>[0],
      provider: new InCodeMigrationProvider(),
      migrationTableName: 'schema_migrations',
    });
    const { error } = await migrator.migrateTo(PREVIOUS_MIGRATION);
    expect(error).toBeUndefined();
    return kysely;
  }

  function loanCategories(nucleusId: string): unknown[] {
    return raw.prepare('SELECT kind, is_system FROM categories WHERE nucleus_id = ? AND name = ?').all(nucleusId, LOAN_CATEGORY_NAME);
  }

  it('núcleo que já existia ganha a categoria de sistema, uma vez só', async () => {
    const kysely = await migratedToPrevious();
    const now = new Date().toISOString();
    raw.prepare('INSERT INTO financial_nuclei (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('n1', 'Núcleo antigo', 'INDIVIDUAL', now, now);
    raw.prepare('INSERT INTO financial_nuclei (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('n2', 'Já tinha a categoria', 'INDIVIDUAL', now, now);
    raw.prepare('INSERT INTO categories (id, nucleus_id, name, kind, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('c-existente', 'n2', LOAN_CATEGORY_NAME, 'EXPENSE', 0, now);
    expect(loanCategories('n1')).toEqual([]);

    await runMigrations(kysely);

    expect(loanCategories('n1')).toEqual([{ kind: 'EXPENSE', is_system: 1 }]);
    // A categoria que o usuário já tinha criado é mantida como está, sem duplicar.
    expect(loanCategories('n2')).toEqual([{ kind: 'EXPENSE', is_system: 0 }]);
  });

  it('acrescenta as três colunas de empréstimo, nulas por padrão', async () => {
    const kysely = await migratedToPrevious();
    const before = (raw.prepare("PRAGMA table_info('financing_plans')").all() as Array<{ name: string }>).map((column) => column.name);
    expect(before).not.toContain('principal_amount_cents');

    await runMigrations(kysely);

    const columns = raw.prepare("PRAGMA table_info('financing_plans')").all() as Array<{ name: string; notnull: number; dflt_value: unknown }>;
    for (const name of ['principal_amount_cents', 'interest_rate_bps', 'interest_rate_period']) {
      const column = columns.find((item) => item.name === name);
      expect(column, name).toBeDefined();
      expect(column?.notnull, name).toBe(0);
      expect(column?.dflt_value, name).toBeNull();
    }
  });
});
