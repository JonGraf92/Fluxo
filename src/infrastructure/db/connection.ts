import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from './types';

export interface FluxoDb {
  kysely: Kysely<Database>;
  raw: BetterSqlite3.Database;
  filePath: string;
}

/**
 * Abre (ou cria) o banco SQLite local. `dataDir` é sempre o diretório resolvido por
 * `resolveDataDir` (ADR D-034) — nunca a pasta da versão antiga nem um caminho de rede
 * (ADR D-001).
 */
export function openDatabase(dataDir: string, fileName = 'fluxo.db'): FluxoDb {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, fileName);

  const raw = new BetterSqlite3(filePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('synchronous = NORMAL');

  const kysely = new Kysely<Database>({
    dialect: new SqliteDialect({ database: raw }),
  });

  return { kysely, raw, filePath };
}

export function closeDatabase(db: FluxoDb): void {
  db.raw.close();
}
