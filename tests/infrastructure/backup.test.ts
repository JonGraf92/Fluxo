import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_MAX_AGE_MS,
  BACKUP_RETENTION,
  BackupError,
  BackupErrorCode,
  backupFileName,
  createBackup,
  listBackups,
  verifyBackupFile,
} from '../../src/infrastructure/backup/backup';
import { BACKUP_SETTINGS_FILE, BackupManager, DEFAULT_BACKUP_DIR_NAME } from '../../src/infrastructure/backup/BackupManager';
import { createFileDb, makeTempDir, removeTempDir } from '../fileDb';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { TestDb } from '../testDb';

const BASE_TIME = new Date(2026, 10, 5, 21, 30, 0);

function minutesLater(minutes: number): Date {
  return new Date(BASE_TIME.getTime() + minutes * 60_000);
}

async function expectBackupError(promise: Promise<unknown>, code: BackupErrorCode): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BackupError);
  expect((caught as BackupError).code).toBe(code);
}

describe('Backup automático — ADR D-035', () => {
  let dataDir: string;
  let destinationDir: string;
  let db: TestDb;

  beforeEach(async () => {
    dataDir = makeTempDir('dados');
    destinationDir = path.join(makeTempDir('backup'), 'copias');
    db = await createFileDb(dataDir);
  });

  afterEach(() => {
    db.close();
    removeTempDir(dataDir);
    removeTempDir(path.dirname(destinationDir));
  });

  describe('createBackup', () => {
    it('gera uma cópia íntegra, com os dados gravados, em arquivo único', async () => {
      const { person, nucleus } = await seedPersonAndNucleus(db);
      await seedResource(db, nucleus.id, person.id, { name: 'Conta fabricada', initialBalanceCents: 12345 });

      const result = await createBackup({ source: db.raw, destinationDir, now: BASE_TIME });

      expect(result.filePath).toBe(path.join(destinationDir, backupFileName(BASE_TIME)));
      expect(fs.readdirSync(destinationDir)).toEqual([backupFileName(BASE_TIME)]);

      const copy = new BetterSqlite3(result.filePath, { readonly: true, fileMustExist: true });
      try {
        const resources = copy.prepare('SELECT name, initial_balance_cents FROM resources').all();
        expect(resources).toEqual([{ name: 'Conta fabricada', initial_balance_cents: 12345 }]);
        expect(copy.prepare('SELECT display_name FROM persons').all()).toEqual([{ display_name: 'Ana' }]);
      } finally {
        copy.close();
      }
    });

    it('inclui o que ainda está só no WAL do banco aberto', async () => {
      const { person, nucleus } = await seedPersonAndNucleus(db);
      await createBackup({ source: db.raw, destinationDir, now: BASE_TIME });
      await seedResource(db, nucleus.id, person.id, { name: 'Gravada depois' });

      const second = await createBackup({ source: db.raw, destinationDir, now: minutesLater(1) });

      const copy = new BetterSqlite3(second.filePath, { readonly: true });
      try {
        expect(copy.prepare('SELECT name FROM resources').all()).toEqual([{ name: 'Gravada depois' }]);
      } finally {
        copy.close();
      }
    });

    it('não sobrescreve uma cópia feita no mesmo segundo', async () => {
      const first = await createBackup({ source: db.raw, destinationDir, now: BASE_TIME });
      const second = await createBackup({ source: db.raw, destinationDir, now: BASE_TIME });

      expect(second.filePath).not.toBe(first.filePath);
      expect(listBackups(destinationDir).map((backup) => backup.filePath)).toEqual([first.filePath, second.filePath]);
    });

    it(`mantém só as últimas ${BACKUP_RETENTION} cópias e preserva arquivos que não são backup`, async () => {
      fs.mkdirSync(destinationDir, { recursive: true });
      const unrelated = path.join(destinationDir, 'anotacoes.txt');
      fs.writeFileSync(unrelated, 'não é backup');

      const extra = 3;
      const created: string[] = [];
      for (let index = 0; index < BACKUP_RETENTION + extra; index += 1) {
        const result = await createBackup({ source: db.raw, destinationDir, now: minutesLater(index) });
        created.push(result.filePath);
      }

      const kept = listBackups(destinationDir).map((backup) => backup.filePath);
      expect(kept).toHaveLength(BACKUP_RETENTION);
      expect(kept).toEqual(created.slice(extra));
      expect(fs.existsSync(unrelated)).toBe(true);
    });

    it('falha de destino lança erro com código e não deixa arquivo parcial', async () => {
      const blocker = path.join(path.dirname(destinationDir), 'arquivo-no-lugar-da-pasta');
      fs.writeFileSync(blocker, 'x');

      await expectBackupError(
        createBackup({ source: db.raw, destinationDir: blocker, now: BASE_TIME }),
        'BACKUP_DESTINATION_UNAVAILABLE',
      );
      await expectBackupError(
        createBackup({ source: db.raw, destinationDir: path.join(blocker, 'sub'), now: BASE_TIME }),
        'BACKUP_DESTINATION_UNAVAILABLE',
      );
      await expectBackupError(
        createBackup({ source: db.raw, destinationDir: 'pasta-relativa', now: BASE_TIME }),
        'BACKUP_DESTINATION_INVALID',
      );
      expect(fs.readdirSync(path.dirname(destinationDir))).toEqual(['arquivo-no-lugar-da-pasta']);
    });
  });

  describe('verifyBackupFile', () => {
    function expectVerificationFailure(filePath: string): void {
      let caught: unknown;
      try {
        verifyBackupFile(filePath);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BackupError);
      expect((caught as BackupError).code).toBe('BACKUP_VERIFICATION_FAILED');
    }

    it('recusa arquivo que não é um banco SQLite', () => {
      const garbage = path.join(dataDir, 'lixo.db');
      fs.writeFileSync(garbage, 'isto não é um banco de dados, é só texto '.repeat(200));
      expectVerificationFailure(garbage);
    });

    it('recusa banco SQLite válido que não é do Fluxo', () => {
      const other = path.join(dataDir, 'outro.db');
      const raw = new BetterSqlite3(other);
      raw.exec('CREATE TABLE qualquer (id INTEGER PRIMARY KEY)');
      raw.close();
      expectVerificationFailure(other);
    });

    it('recusa arquivo inexistente', () => {
      expectVerificationFailure(path.join(dataDir, 'nao-existe.db'));
    });

    it('recusa cópia truncada', async () => {
      const { person, nucleus } = await seedPersonAndNucleus(db);
      await seedResource(db, nucleus.id, person.id);
      const result = await createBackup({ source: db.raw, destinationDir, now: BASE_TIME });
      const size = fs.statSync(result.filePath).size;
      fs.truncateSync(result.filePath, Math.floor(size / 2));

      expectVerificationFailure(result.filePath);
    });
  });

  describe('BackupManager', () => {
    let clock: Date;
    const now = () => clock;

    beforeEach(() => {
      clock = BASE_TIME;
    });

    function newManager(validateDestination?: (dir: string) => void): BackupManager {
      return new BackupManager({ db: db.raw, dataDir, now, validateDestination });
    }

    it('sem configuração, usa a pasta padrão dentro do diretório de dados e avisa que é o padrão', () => {
      const status = newManager().getStatus();
      expect(status.destinationDir).toBe(path.join(dataDir, DEFAULT_BACKUP_DIR_NAME));
      expect(status.isDefaultDestination).toBe(true);
      expect(status.lastBackupAt).toBeNull();
      expect(status.backupCount).toBe(0);
      expect(status.retention).toBe(BACKUP_RETENTION);
      expect(status.lastError).toBeNull();
    });

    it('o destino escolhido persiste entre sessões', async () => {
      newManager().setDestination(destinationDir);

      const reopened = newManager();
      await reopened.runBackup();
      const status = reopened.getStatus();

      expect(status.destinationDir).toBe(destinationDir);
      expect(status.isDefaultDestination).toBe(false);
      expect(status.backupCount).toBe(1);
      expect(status.lastBackupAt).toBe(BASE_TIME.toISOString());
      expect(status.lastBackupFile).toBe(path.join(destinationDir, backupFileName(BASE_TIME)));
    });

    it('recusa destino relativo e destino vetado pelo validador', () => {
      const manager = newManager((dir) => {
        if (dir.includes('proibida')) throw new BackupError('BACKUP_DESTINATION_INVALID', 'pasta proibida');
      });
      expect(() => manager.setDestination('relativa')).toThrow(BackupError);
      expect(() => manager.setDestination(path.join(dataDir, 'proibida'))).toThrow('pasta proibida');
      expect(manager.getStatus().isDefaultDestination).toBe(true);
    });

    it('ao fechar: copia quando ainda não há cópia, pula quando nada mudou, copia de novo após gravação', async () => {
      const { person, nucleus } = await seedPersonAndNucleus(db);
      const manager = newManager();
      manager.setDestination(destinationDir);

      expect(await manager.runOnClose()).not.toBeNull();

      clock = minutesLater(1);
      expect(await manager.runOnClose()).toBeNull();
      expect(listBackups(destinationDir)).toHaveLength(1);

      await seedResource(db, nucleus.id, person.id, { name: 'Nova conta' });
      clock = minutesLater(2);
      expect(await manager.runOnClose()).not.toBeNull();
      expect(listBackups(destinationDir)).toHaveLength(2);
    });

    it('com o app aberto: copia se não há cópia ou se a mais nova passou de 24 horas', async () => {
      const manager = newManager();
      manager.setDestination(destinationDir);

      expect(await manager.runIfDue()).not.toBeNull();

      clock = new Date(BASE_TIME.getTime() + BACKUP_MAX_AGE_MS - 60_000);
      expect(await manager.runIfDue()).toBeNull();

      clock = new Date(BASE_TIME.getTime() + BACKUP_MAX_AGE_MS);
      expect(await manager.runIfDue()).not.toBeNull();
      expect(listBackups(destinationDir)).toHaveLength(2);
    });

    it('falha de destino é lançada e fica visível no estado até um backup dar certo', async () => {
      const blocker = path.join(dataDir, 'arquivo-no-lugar-da-pasta');
      fs.writeFileSync(blocker, 'x');
      const manager = newManager();
      manager.setDestination(blocker);

      await expectBackupError(manager.runBackup(), 'BACKUP_DESTINATION_UNAVAILABLE');
      await expectBackupError(manager.runOnClose(), 'BACKUP_DESTINATION_UNAVAILABLE');

      const failed = manager.getStatus();
      expect(failed.lastError?.code).toBe('BACKUP_DESTINATION_UNAVAILABLE');
      expect(failed.lastError?.message).toContain(blocker);

      manager.setDestination(destinationDir);
      await manager.runBackup();
      expect(manager.getStatus().lastError).toBeNull();
    });

    it('configuração corrompida não vira "use o padrão": o backup falha com erro claro', async () => {
      fs.writeFileSync(path.join(dataDir, BACKUP_SETTINGS_FILE), '{ isto não é json');
      const manager = newManager();

      await expectBackupError(manager.runBackup(), 'BACKUP_SETTINGS_INVALID');
      await expectBackupError(manager.runIfDue(), 'BACKUP_SETTINGS_INVALID');
      expect(manager.getStatus().lastError?.code).toBe('BACKUP_SETTINGS_INVALID');
      expect(fs.existsSync(path.join(dataDir, DEFAULT_BACKUP_DIR_NAME))).toBe(false);
    });

    it('chamadas simultâneas compartilham a mesma cópia', async () => {
      const manager = newManager();
      manager.setDestination(destinationDir);

      const [first, second] = await Promise.all([manager.runBackup(), manager.runBackup()]);

      expect(second.filePath).toBe(first.filePath);
      expect(listBackups(destinationDir)).toHaveLength(1);
    });
  });
});
