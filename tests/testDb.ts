import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from '../src/infrastructure/db/types';
import { runMigrations } from '../src/infrastructure/db/migrate';
import { createRepositoryContext } from '../src/infrastructure/repositories/createRepositoryContext';
import { SqliteUnitOfWork } from '../src/infrastructure/unit-of-work/SqliteUnitOfWork';

export interface TestDb {
  raw: BetterSqlite3.Database;
  kysely: Kysely<Database>;
  repos: ReturnType<typeof createRepositoryContext>;
  uow: SqliteUnitOfWork;
  close: () => void;
}

/** Banco SQLite totalmente em memória, com as mesmas migrations do app real. */
export async function createTestDb(): Promise<TestDb> {
  const raw = new BetterSqlite3(':memory:');
  raw.pragma('foreign_keys = ON');
  const kysely = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
  await runMigrations(kysely);

  return {
    raw,
    kysely,
    repos: createRepositoryContext(kysely),
    uow: new SqliteUnitOfWork(kysely),
    close: () => raw.close(),
  };
}
