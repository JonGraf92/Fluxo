import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNotLegacyDataDir,
  DataDirError,
  LEGACY_DATA_DIR_NAME,
  resolveDataDir,
} from '../../src/infrastructure/dataDir';
import { BackupError } from '../../src/infrastructure/backup/backup';
import { BackupManager } from '../../src/infrastructure/backup/BackupManager';
import { closeDatabase, openDatabase } from '../../src/infrastructure/db/connection';
import { runMigrations } from '../../src/infrastructure/db/migrate';
import { createRepositoryContext } from '../../src/infrastructure/repositories/createRepositoryContext';
import { SqliteUnitOfWork } from '../../src/infrastructure/unit-of-work/SqliteUnitOfWork';
import { registerBackupHandlers } from './ipc/handlers/backup.handlers';
import { registerIpcHandlers } from './ipc/register';
import { createMainWindow } from './window';

/** Com o app aberto, a cada hora confere se a cópia mais nova passou de 24 horas. */
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function describeBackupError(error: unknown): string {
  if (error instanceof BackupError) return `${error.message}\n\nCódigo: ${error.code}`;
  return error instanceof Error ? error.message : String(error);
}

let mainWindow: BrowserWindow | null = null;

function openMainWindow(): BrowserWindow {
  const win = createMainWindow();
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

/**
 * Caminho real de `target`, seguindo junctions/symlinks do trecho que já existe em disco.
 * O trecho ainda inexistente é reanexado como está.
 */
function realPathOfExistingPrefix(target: string): string {
  const pending: string[] = [];
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return target;
    pending.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync.native(current), ...pending);
}

/**
 * Resolve o diretório de dados da v2 e o fixa como `userData` (ADR D-034). Lança se o
 * destino for a pasta da versão antiga — inclusive quando se chega nela por um
 * junction/symlink, que a função pura não enxerga.
 */
function prepareDataDir(): string {
  const appData = app.getPath('appData');
  const resolved = resolveDataDir({
    appData,
    envValue: process.env.FLUXO_DATA_DIR,
    pathMod: path,
  });

  const realDir = realPathOfExistingPrefix(resolved.dir);
  assertNotLegacyDataDir(realDir, appData, path);
  assertNotLegacyDataDir(realDir, fs.realpathSync.native(appData), path);

  app.setPath('userData', resolved.dir);

  // Só existência do arquivo — o banco legado nunca é aberto nem lido pela v2.
  if (fs.existsSync(path.join(appData, LEGACY_DATA_DIR_NAME, 'fluxo.db'))) {
    // eslint-disable-next-line no-console
    console.warn(
      `Há dados da versão antiga do Fluxo em "${resolved.legacyDir}". Eles não serão tocados; a v2 usa "${resolved.dir}".`,
    );
  }

  return resolved.dir;
}

async function bootstrap(dataDir: string): Promise<void> {
  // Dados financeiros ficam exclusivamente no diretório de dados local da v2
  // (ADR D-001, D-034) — nunca na pasta da versão antiga, em rede ou temporário.
  const fluxoDb = openDatabase(dataDir);
  await runMigrations(fluxoDb.kysely);

  const repos = createRepositoryContext(fluxoDb.kysely);
  const uow = new SqliteUnitOfWork(fluxoDb.kysely);

  const appData = app.getPath('appData');
  const backup = new BackupManager({
    db: fluxoDb.raw,
    dataDir,
    // O backup nunca grava na pasta de dados da versão antiga (ADR D-034). Um destino que
    // só se chama "Fluxo" em outro lugar (ex.: pasta no Google Drive) é permitido.
    validateDestination: (destinationDir) => {
      try {
        assertNotLegacyDataDir(realPathOfExistingPrefix(destinationDir), appData, path);
      } catch (error) {
        if (!(error instanceof DataDirError)) throw error;
        if (error.code === 'DATA_DIR_LEGACY_NAME') return;
        throw new BackupError(
          'BACKUP_DESTINATION_INVALID',
          'A pasta de backup não pode ser a pasta de dados da versão antiga do Fluxo nem ficar dentro dela.',
        );
      }
    },
  });

  registerIpcHandlers({ repos, uow });
  registerBackupHandlers({ repos, uow }, backup);

  openMainWindow();

  // Falha de backup nunca é silenciosa (ADR D-035): aparece em diálogo e fica registrada
  // no estado exibido em Configurações.
  const reportBackupFailure = (error: unknown): void => {
    // eslint-disable-next-line no-console
    console.error('Backup automático falhou:', error);
    void dialog.showMessageBox({
      type: 'error',
      title: 'Backup do Fluxo falhou',
      message: 'A cópia de segurança automática não foi feita.',
      detail: `${describeBackupError(error)}\n\nConfira a pasta de backup em Configurações.`,
    });
  };
  const runScheduledBackup = (): void => {
    backup.runIfDue().catch(reportBackupFailure);
  };
  runScheduledBackup();
  const backupTimer = setInterval(runScheduledBackup, BACKUP_CHECK_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });

  let closing = false;
  app.on('window-all-closed', () => {
    if (closing) return;
    closing = true;
    clearInterval(backupTimer);
    // O backup roda ANTES de fechar o banco: a API de backup precisa da conexão aberta.
    backup
      .runOnClose()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Backup ao fechar falhou:', error);
        dialog.showErrorBox(
          'Backup do Fluxo falhou',
          `A cópia de segurança ao fechar não foi feita.\n\n${describeBackupError(error)}\n\nSeus dados continuam salvos neste computador. Abra o Fluxo e confira a pasta de backup em Configurações.`,
        );
      })
      .finally(() => {
        closeDatabase(fluxoDb);
        if (process.platform !== 'darwin') {
          app.quit();
        }
      });
  });
}

// userData precisa ser sobrescrito antes do evento `ready` e antes de abrir qualquer
// banco. Se a resolução recusar, o app encerra sem chegar ao bootstrap (falha fechado).
let dataDir: string | null = null;
try {
  dataDir = prepareDataDir();
} catch (error) {
  const detail =
    error instanceof DataDirError
      ? `${error.message}\n\nCódigo: ${error.code}`
      : `Não foi possível verificar o diretório de dados.\n\n${String(error)}`;
  // eslint-disable-next-line no-console
  console.error('Fluxo não iniciado — diretório de dados recusado:', error);
  dialog.showErrorBox('Fluxo não pode iniciar', detail);
  app.exit(1);
}

if (dataDir !== null) {
  const resolvedDataDir = dataDir;
  app
    .whenReady()
    .then(() => bootstrap(resolvedDataDir))
    .catch((error) => {
      // Nunca falhar silenciosamente no boot (seção 40) — se o banco/migrations falharem,
      // o app não deve abrir fingindo que está tudo certo.
      // eslint-disable-next-line no-console
      console.error('Falha ao iniciar o Fluxo:', error);
      app.quit();
    });
}
