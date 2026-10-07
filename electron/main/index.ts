import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNotLegacyDataDir,
  DataDirError,
  LEGACY_DATA_DIR_NAME,
  resolveDataDir,
} from '../../src/infrastructure/dataDir';
import { closeDatabase, openDatabase } from '../../src/infrastructure/db/connection';
import { runMigrations } from '../../src/infrastructure/db/migrate';
import { createRepositoryContext } from '../../src/infrastructure/repositories/createRepositoryContext';
import { SqliteUnitOfWork } from '../../src/infrastructure/unit-of-work/SqliteUnitOfWork';
import { registerIpcHandlers } from './ipc/register';
import { createMainWindow } from './window';

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

  registerIpcHandlers({ repos, uow });

  openMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    closeDatabase(fluxoDb);
    if (process.platform !== 'darwin') {
      app.quit();
    }
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
