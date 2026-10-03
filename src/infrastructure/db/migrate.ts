import { Kysely, Migration, Migrator } from 'kysely';
import { Database } from './types';
import { InCodeMigrationProvider } from './migrations';

/**
 * Executa todas as migrations pendentes, em ordem, no boot da aplicação.
 * A tabela `schema_migrations` (criada automaticamente pelo Migrator do Kysely) garante
 * que cada migration roda uma única vez.
 */
export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db: db as unknown as Parameters<Migration['up']>[0],
    provider: new InCodeMigrationProvider(),
    migrationTableName: 'schema_migrations',
  });

  const { error, results } = await migrator.migrateToLatest();

  const failed = results?.filter((r) => r.status === 'Error') ?? [];
  if (error || failed.length > 0) {
    const names = failed.map((r) => r.migrationName).join(', ');
    throw new Error(`Falha ao rodar migrations: ${names || String(error)}`);
  }
}
