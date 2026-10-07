import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/infrastructure/db/connection';
import { runMigrations } from '../src/infrastructure/db/migrate';
import { createRepositoryContext } from '../src/infrastructure/repositories/createRepositoryContext';
import { SqliteUnitOfWork } from '../src/infrastructure/unit-of-work/SqliteUnitOfWork';
import { TestDb } from './testDb';

/** Pasta temporária descartável; nunca a pasta de dados de verdade. */
export function makeTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fluxo-test-${label}-`));
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Banco em ARQUIVO, aberto do mesmo jeito que o app abre (WAL), com dados fabricados.
 * Só para testes que precisam de arquivo de verdade, como backup e restauração.
 */
export async function createFileDb(dataDir: string): Promise<TestDb> {
  const fluxoDb = openDatabase(dataDir);
  await runMigrations(fluxoDb.kysely);
  return {
    raw: fluxoDb.raw,
    kysely: fluxoDb.kysely,
    repos: createRepositoryContext(fluxoDb.kysely),
    uow: new SqliteUnitOfWork(fluxoDb.kysely),
    close: () => closeDatabase(fluxoDb),
  };
}
