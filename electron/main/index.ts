import { app, BrowserWindow } from 'electron';
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

async function bootstrap(): Promise<void> {
  // Dados financeiros ficam exclusivamente no diretório de dados do usuário local
  // (ADR D-001) — nunca em um caminho de rede ou temporário.
  const dataDir = app.getPath('userData');
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

app.whenReady().then(bootstrap).catch((error) => {
  // Nunca falhar silenciosamente no boot (seção 40) — se o banco/migrations falharem,
  // o app não deve abrir fingindo que está tudo certo.
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar o Fluxo:', error);
  app.quit();
});
