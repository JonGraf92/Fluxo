import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Backup do banco SQLite (ADR D-035).
 *
 * O banco usa WAL: copiar `fluxo.db` com o app aberto pode gerar uma cópia inconsistente.
 * Aqui a cópia é feita pela API de backup do próprio SQLite, conferida (integridade e
 * chaves estrangeiras) e só então recebe o nome definitivo. Falha em qualquer etapa lança
 * `BackupError` — nunca termina em silêncio com um arquivo que não serve para restaurar.
 */

/** Quantas cópias ficam no destino; as mais antigas são removidas. */
export const BACKUP_RETENTION = 14;
/** Intervalo máximo sem cópia enquanto o app fica aberto. */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const BACKUP_FILE_PREFIX = 'fluxo-backup-';
export const BACKUP_FILE_EXTENSION = '.db';

const BACKUP_FILE_PATTERN = /^fluxo-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.db$/;
const PARTIAL_SUFFIX = '.partial';
/** Tabela que todo banco do Fluxo tem; cópia sem ela não é um backup válido. */
const REQUIRED_TABLE = 'movements';

export type BackupErrorCode =
  | 'BACKUP_DESTINATION_INVALID'
  | 'BACKUP_DESTINATION_UNAVAILABLE'
  | 'BACKUP_COPY_FAILED'
  | 'BACKUP_VERIFICATION_FAILED'
  | 'BACKUP_SETTINGS_INVALID';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

export interface BackupFileInfo {
  filePath: string;
  fileName: string;
  /** Momento da cópia, lido do nome do arquivo (horário local). */
  createdAt: Date;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function backupFileName(now: Date, sequence = 0): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = sequence > 0 ? `-${sequence}` : '';
  return `${BACKUP_FILE_PREFIX}${stamp}${suffix}${BACKUP_FILE_EXTENSION}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Cópias existentes no destino, da mais antiga para a mais nova. Ignora outros arquivos. */
export function listBackups(destinationDir: string): BackupFileInfo[] {
  if (!fs.existsSync(destinationDir)) return [];
  let fileNames: string[];
  try {
    fileNames = fs.readdirSync(destinationDir);
  } catch (error) {
    // Destino que existe mas não pode ser lido (não é pasta, sem permissão, unidade fora
    // do ar) não é "sem cópias": é destino indisponível.
    throw new BackupError(
      'BACKUP_DESTINATION_UNAVAILABLE',
      `Não foi possível ler a pasta de backup "${destinationDir}" (${describe(error)}).`,
    );
  }
  const found: Array<BackupFileInfo & { sequence: number }> = [];
  for (const fileName of fileNames) {
    const match = BACKUP_FILE_PATTERN.exec(fileName);
    if (!match) continue;
    const [, year, month, day, hour, minute, second, sequence] = match;
    found.push({
      filePath: path.join(destinationDir, fileName),
      fileName,
      createdAt: new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
      sequence: sequence ? Number(sequence) : 0,
    });
  }
  found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.sequence - b.sequence);
  return found.map(({ filePath, fileName, createdAt }) => ({ filePath, fileName, createdAt }));
}

/** Remove as cópias mais antigas, mantendo `keep`. Devolve os arquivos removidos. */
export function pruneBackups(destinationDir: string, keep: number = BACKUP_RETENTION): string[] {
  const backups = listBackups(destinationDir);
  const excess = backups.slice(0, Math.max(0, backups.length - keep));
  for (const backup of excess) {
    fs.rmSync(backup.filePath, { force: true });
  }
  return excess.map((backup) => backup.filePath);
}

/**
 * Confere que `filePath` é um banco do Fluxo íntegro. Também tira a cópia do modo WAL,
 * para que o backup seja um arquivo único, sem `-wal`/`-shm` ao lado.
 */
export function verifyBackupFile(filePath: string): void {
  let copy: BetterSqlite3.Database | null = null;
  try {
    copy = new BetterSqlite3(filePath, { fileMustExist: true });
    copy.pragma('journal_mode = DELETE');

    const integrity = copy.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`integrity_check: ${integrity.map((row) => row.integrity_check).join('; ')}`);
    }
    const foreignKeys = copy.pragma('foreign_key_check') as unknown[];
    if (foreignKeys.length > 0) {
      throw new Error(`foreign_key_check encontrou ${foreignKeys.length} violação(ões)`);
    }
    const table = copy
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(REQUIRED_TABLE);
    if (!table) {
      throw new Error(`a tabela "${REQUIRED_TABLE}" não existe na cópia`);
    }
  } catch (error) {
    throw new BackupError(
      'BACKUP_VERIFICATION_FAILED',
      `A cópia de segurança não passou na verificação e foi descartada (${describe(error)}).`,
    );
  } finally {
    copy?.close();
  }
}

function removeQuietly(filePath: string): void {
  for (const candidate of [filePath, `${filePath}-wal`, `${filePath}-shm`, `${filePath}-journal`]) {
    try {
      fs.rmSync(candidate, { force: true });
    } catch {
      // Sobra de arquivo parcial não pode esconder o erro original do backup.
    }
  }
}

export interface CreateBackupInput {
  /** Conexão aberta do banco em uso. */
  source: BetterSqlite3.Database;
  destinationDir: string;
  now: Date;
  retention?: number;
}

export interface CreateBackupResult {
  filePath: string;
  createdAt: Date;
  removed: string[];
}

export async function createBackup(input: CreateBackupInput): Promise<CreateBackupResult> {
  const { source, destinationDir, now } = input;

  if (!path.isAbsolute(destinationDir)) {
    throw new BackupError(
      'BACKUP_DESTINATION_INVALID',
      `A pasta de backup precisa ser um caminho absoluto: "${destinationDir}".`,
    );
  }
  try {
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.accessSync(destinationDir, fs.constants.W_OK);
    if (!fs.statSync(destinationDir).isDirectory()) throw new Error('não é uma pasta');
  } catch (error) {
    throw new BackupError(
      'BACKUP_DESTINATION_UNAVAILABLE',
      `Não foi possível usar a pasta de backup "${destinationDir}" (${describe(error)}).`,
    );
  }

  let sequence = 0;
  let finalPath = path.join(destinationDir, backupFileName(now, sequence));
  while (fs.existsSync(finalPath)) {
    sequence += 1;
    finalPath = path.join(destinationDir, backupFileName(now, sequence));
  }
  const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;
  removeQuietly(partialPath);

  try {
    await source.backup(partialPath);
  } catch (error) {
    removeQuietly(partialPath);
    throw new BackupError('BACKUP_COPY_FAILED', `Não foi possível gravar a cópia de segurança (${describe(error)}).`);
  }

  try {
    verifyBackupFile(partialPath);
    fs.renameSync(partialPath, finalPath);
  } catch (error) {
    removeQuietly(partialPath);
    if (error instanceof BackupError) throw error;
    throw new BackupError('BACKUP_COPY_FAILED', `Não foi possível concluir a cópia de segurança (${describe(error)}).`);
  }

  // A limpeza só acontece depois de a cópia nova existir e ter sido conferida.
  const removed = pruneBackups(destinationDir, input.retention ?? BACKUP_RETENTION);
  return { filePath: finalPath, createdAt: now, removed };
}
