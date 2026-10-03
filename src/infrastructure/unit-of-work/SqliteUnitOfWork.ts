import { Kysely } from 'kysely';
import { RepositoryContext } from '../../application/ports/RepositoryContext';
import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { Database } from '../db/types';
import { createRepositoryContext } from '../repositories/createRepositoryContext';

/**
 * Implementação real de UnitOfWork (ADR D-012). `db.transaction().execute(cb)` do Kysely
 * abre BEGIN/COMMIT/ROLLBACK reais no SQLite via better-sqlite3. Se `fn` lançar qualquer
 * erro — inclusive um DomainError vindo de dentro do domínio — o Kysely emite ROLLBACK
 * automaticamente e o erro é propagado para quem chamou `run(...)`. Nenhuma escrita
 * parcial é possível: é este método que impede uma "meia transferência" (cenário 59).
 */
export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Kysely<Database>) {}

  async run<T>(fn: (repos: RepositoryContext) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      const repos = createRepositoryContext(trx as unknown as Kysely<Database>);
      return fn(repos);
    });
  }
}
