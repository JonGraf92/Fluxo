import { BrowserWindow, shell } from 'electron';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';

/** Esquemas que podem ser abertos no navegador do sistema. Lista fechada, por decisao. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:']);

/**
 * Decide se uma URL pode ser entregue ao sistema operacional.
 *
 * A versao anterior chamava `shell.openExternal(url)` para QUALQUER url, antes mesmo de
 * negar a janela, sem validar o esquema. Isso transformava o app em vetor de execucao: no
 * Windows, `ms-msdt:` e `search-ms:` sao vetores conhecidos, e `smb://` faz o host vazar o
 * hash NTLM da rede. Como o renderer pode ser comprometido, a decisao nao pode sair daqui.
 */
function isSafeExternalUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
}

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

  // A unica origem que o app pode carregar. Em producao o renderer roda de um arquivo local;
  // o servidor de desenvolvimento so e aceito quando isDev e verdadeiro.
  const productionEntry = path.join(__dirname, '../../../dist/index.html');
  const allowedAppUrl = `file://${productionEntry.replace(/\\/g, '/')}`;

  function isAllowedAppNavigation(url: string): boolean {
    if (isDev && url.startsWith('http://localhost:5173')) return true;
    // Fora do dev, apenas o proprio entrypoint e aceito. Antes, QUALQUER `file://` passava —
    // incluindo o banco SQLite do usuario (`file:///.../fluxo.db`), o que expunha os dados
    // financeiros a uma navegacao iniciada pelo renderer.
    return url === allowedAppUrl || url.startsWith(`${allowedAppUrl}#`);
  }

  // Bloqueia navegacao para fora do app e abertura de novas janelas — nenhuma URL externa
  // deve ser carregada dentro do Fluxo (seção 36). O esquema e validado ANTES de qualquer
  // chamada ao sistema operacional.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      event.preventDefault();
    }
  });

  // Navegacao para fora do app tambem pode ser disparada por redirect/âncora: bloqueia a
  // criacao de janelas e o carregamento de qualquer origem nao prevista.
  win.webContents.on('will-frame-navigate', (event) => {
    if (!isAllowedAppNavigation(event.url)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    void win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname em produção = dist-electron/electron/main (rootDir do build do electron é
    // a raiz do projeto, para incluir também src/ na mesma compilação — ver electron/tsconfig.json).
    void win.loadFile(productionEntry);
  }

  return win;
}
