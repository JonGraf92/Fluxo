import { BrowserWindow, shell } from 'electron';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Checklist de segurança do Electron (docs/security/checklist.md):
 * nodeIntegration desligado, contextIsolation ligado, sandbox ligado, sem `remote`,
 * preload controlado, navegação externa bloqueada.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F6F5F1',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.removeMenu();

  // Bloqueia navegação para fora do app e abertura de novas janelas — nenhuma URL
  // externa deve ser carregada dentro do Fluxo (seção 36).
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  if (isDev) {
    void win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname em produção = dist-electron/electron/main (rootDir do build do electron é
    // a raiz do projeto, para incluir também src/ na mesma compilação — ver electron/tsconfig.json).
    void win.loadFile(path.join(__dirname, '../../../dist/index.html'));
  }

  return win;
}
