import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_MAX_AGE_MS,
  BACKUP_RETENTION,
  BackupError,
  createBackup,
  CreateBackupResult,
  listBackups,
} from './backup';

/**
 * Decide QUANDO fazer backup e guarda a configuração do destino (ADR D-035). Não importa
 * 'electron' de propósito: diálogo e timer ficam no processo principal; a regra fica aqui,
 * testável com um banco de teste.
 *
 * Regras:
 * - ao fechar o app: copia se houve gravação desde a última cópia desta sessão, ou se o
 *   destino ainda não tem nenhuma cópia;
 * - com o app aberto (verificação periódica e na abertura): copia se não há cópia ou se a
 *   mais nova tem mais de 24 horas.
 */

export const BACKUP_SETTINGS_FILE = 'backup-settings.json';
export const DEFAULT_BACKUP_DIR_NAME = 'backups';

export type BackupTrigger = 'manual' | 'close' | 'scheduled';

export interface BackupStatus {
  destinationDir: string;
  /** Destino padrão fica no mesmo disco do banco: não protege contra falha de disco. */
  isDefaultDestination: boolean;
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  backupCount: number;
  retention: number;
  lastError: { code: string; message: string; at: string } | null;
}

export interface BackupManagerOptions {
  db: BetterSqlite3.Database;
  dataDir: string;
  /** Lança se a pasta não puder ser usada como destino (ex.: pasta de dados legada). */
  validateDestination?: (destinationDir: string) => void;
  now?: () => Date;
}

interface StoredSettings {
  destinationDir: string | null;
}

export class BackupManager {
  private readonly db: BetterSqlite3.Database;
  private readonly dataDir: string;
  private readonly validateDestination: (destinationDir: string) => void;
  private readonly now: () => Date;
  private changesAtLastBackup: number;
  private lastError: BackupStatus['lastError'] = null;
  private running: Promise<CreateBackupResult> | null = null;

  constructor(options: BackupManagerOptions) {
    this.db = options.db;
    this.dataDir = options.dataDir;
    this.validateDestination = options.validateDestination ?? (() => undefined);
    this.now = options.now ?? (() => new Date());
    this.changesAtLastBackup = this.totalChanges();
  }

  private totalChanges(): number {
    const row = this.db.prepare('SELECT total_changes() AS changes').get() as { changes: number };
    return row.changes;
  }

  private get settingsPath(): string {
    return path.join(this.dataDir, BACKUP_SETTINGS_FILE);
  }

  private get defaultDestination(): string {
    return path.join(this.dataDir, DEFAULT_BACKUP_DIR_NAME);
  }

  private readSettings(): StoredSettings {
    if (!fs.existsSync(this.settingsPath)) return { destinationDir: null };
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      const destinationDir = (parsed as { destinationDir?: unknown } | null)?.destinationDir;
      if (destinationDir === null || destinationDir === undefined) return { destinationDir: null };
      if (typeof destinationDir !== 'string' || !path.isAbsolute(destinationDir)) {
        throw new Error('destinationDir precisa ser um caminho absoluto');
      }
      return { destinationDir };
    } catch (error) {
      // Configuração ilegível não vira "use o padrão": o usuário escolheu um destino e
      // precisa saber que ele não está valendo.
      throw new BackupError(
        'BACKUP_SETTINGS_INVALID',
        `A configuração de backup em "${this.settingsPath}" está inválida (${error instanceof Error ? error.message : String(error)}). Escolha a pasta de backup de novo nas Configurações.`,
      );
    }
  }

  getDestination(): string {
    return this.readSettings().destinationDir ?? this.defaultDestination;
  }

  /** Grava o destino escolhido pelo usuário. Recusa caminho relativo ou pasta proibida. */
  setDestination(destinationDir: string): void {
    if (!path.isAbsolute(destinationDir)) {
      throw new BackupError(
        'BACKUP_DESTINATION_INVALID',
        `A pasta de backup precisa ser um caminho absoluto: "${destinationDir}".`,
      );
    }
    this.validateDestination(destinationDir);
    fs.mkdirSync(this.dataDir, { recursive: true });
    const stored: StoredSettings = { destinationDir };
    fs.writeFileSync(this.settingsPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    this.lastError = null;
  }

  getStatus(): BackupStatus {
    let destinationDir = this.defaultDestination;
    let isDefaultDestination = true;
    let lastError = this.lastError;
    try {
      const stored = this.readSettings().destinationDir;
      if (stored) {
        destinationDir = stored;
        isDefaultDestination = false;
      }
    } catch (error) {
      if (error instanceof BackupError) {
        lastError = { code: error.code, message: error.message, at: this.now().toISOString() };
      } else {
        throw error;
      }
    }
    let backups: ReturnType<typeof listBackups> = [];
    try {
      backups = listBackups(destinationDir);
    } catch (error) {
      if (!(error instanceof BackupError)) throw error;
      lastError = { code: error.code, message: error.message, at: this.now().toISOString() };
    }
    const newest = backups[backups.length - 1];
    return {
      destinationDir,
      isDefaultDestination,
      lastBackupAt: newest ? newest.createdAt.toISOString() : null,
      lastBackupFile: newest ? newest.filePath : null,
      backupCount: backups.length,
      retention: BACKUP_RETENTION,
      lastError,
    };
  }

  hasChangesSinceLastBackup(): boolean {
    return this.totalChanges() !== this.changesAtLastBackup;
  }

  /** Faz a cópia agora. Chamadas simultâneas compartilham a mesma execução. */
  async runBackup(): Promise<CreateBackupResult> {
    if (this.running) return this.running;
    this.running = this.execute();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async execute(): Promise<CreateBackupResult> {
    try {
      const destinationDir = this.getDestination();
      this.validateDestination(destinationDir);
      const changesBefore = this.totalChanges();
      const result = await createBackup({ source: this.db, destinationDir, now: this.now() });
      this.changesAtLastBackup = changesBefore;
      this.lastError = null;
      return result;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  private newestBackupAt(): Date | null {
    const backups = listBackups(this.getDestination());
    return backups[backups.length - 1]?.createdAt ?? null;
  }

  /** Ao fechar: copia se houve gravação nesta sessão ou se ainda não existe cópia. */
  async runOnClose(): Promise<CreateBackupResult | null> {
    try {
      if (!this.hasChangesSinceLastBackup() && this.newestBackupAt() !== null) return null;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
    return this.runBackup();
  }

  /** Com o app aberto: copia se não há cópia ou se a mais nova passou de 24 horas. */
  async runIfDue(): Promise<CreateBackupResult | null> {
    let newest: Date | null;
    try {
      newest = this.newestBackupAt();
    } catch (error) {
      this.recordError(error);
      throw error;
    }
    if (newest !== null && this.now().getTime() - newest.getTime() < BACKUP_MAX_AGE_MS) return null;
    return this.runBackup();
  }

  private recordError(error: unknown): void {
    const code = error instanceof BackupError ? error.code : 'BACKUP_COPY_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    this.lastError = { code, message, at: this.now().toISOString() };
  }
}
