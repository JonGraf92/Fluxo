import type { PlatformPath } from 'node:path';

/**
 * Resolução do diretório de dados da v2 (ADR D-034).
 *
 * A pasta `<appData>/fluxo` (ou `Fluxo` — no Windows é a mesma) pertence à versão antiga
 * e tem dados financeiros reais. Como o boot roda migrations sozinho, a v2 nunca pode
 * abrir um banco ali. Este módulo é puro (sem Electron, sem `fs`) e falha fechado: na
 * dúvida, recusa.
 */

export const DATA_DIR_ENV_VAR = 'FLUXO_DATA_DIR';
export const DEFAULT_DATA_DIR_NAME = 'fluxo-v2';
export const LEGACY_DATA_DIR_NAME = 'fluxo';

export type DataDirErrorCode =
  | 'DATA_DIR_APPDATA_INVALID'
  | 'DATA_DIR_ENV_EMPTY'
  | 'DATA_DIR_ENV_NOT_ABSOLUTE'
  | 'DATA_DIR_IS_LEGACY'
  | 'DATA_DIR_INSIDE_LEGACY'
  | 'DATA_DIR_LEGACY_NAME';

export class DataDirError extends Error {
  readonly code: DataDirErrorCode;

  constructor(code: DataDirErrorCode, message: string) {
    super(message);
    this.name = 'DataDirError';
    this.code = code;
  }
}

export interface ResolveDataDirInput {
  /** Diretório de dados de aplicação do usuário (`app.getPath('appData')`). */
  appData: string;
  /** Valor bruto de `FLUXO_DATA_DIR`; `undefined` quando a variável não existe. */
  envValue: string | undefined;
  /** `path.win32` ou `path.posix` — permite testar Windows em qualquer sistema. */
  pathMod: PlatformPath;
}

export interface ResolvedDataDir {
  dir: string;
  legacyDir: string;
  source: 'default' | 'env';
}

/**
 * Chave de comparação: caminho resolvido, sem separador final e em minúsculas. A
 * comparação ignora capitalização em qualquer sistema (mais restritivo de propósito).
 * No Windows, pontos e espaços no fim de um segmento são descartados pelo sistema
 * (`fluxo.` e `fluxo ` abrem `fluxo`), então saem da chave também.
 */
function comparisonKey(target: string, pathMod: PlatformPath): string {
  const resolved = pathMod.resolve(target);
  const segments = resolved.split(pathMod.sep);
  const cleaned =
    pathMod.sep === '\\' ? segments.map((segment) => segment.replace(/[. ]+$/, '')) : segments;
  return cleaned.join(pathMod.sep).toLowerCase();
}

/**
 * Lança `DataDirError` se `dir` for a pasta legada, estiver dentro dela ou se chamar
 * "fluxo" (qualquer capitalização). Exportada para o processo principal reaplicar a
 * verificação sobre o caminho real (junctions/symlinks), que este módulo não enxerga.
 */
export function assertNotLegacyDataDir(dir: string, appData: string, pathMod: PlatformPath): void {
  if (!pathMod.isAbsolute(appData)) {
    throw new DataDirError(
      'DATA_DIR_APPDATA_INVALID',
      `Diretório de dados de aplicação inválido (não é caminho absoluto): "${appData}".`,
    );
  }
  if (!pathMod.isAbsolute(dir)) {
    throw new DataDirError(
      'DATA_DIR_ENV_NOT_ABSOLUTE',
      `O diretório de dados precisa ser um caminho absoluto: "${dir}".`,
    );
  }

  const legacyDir = pathMod.join(appData, LEGACY_DATA_DIR_NAME);
  const dirKey = comparisonKey(dir, pathMod);
  const legacyKey = comparisonKey(legacyDir, pathMod);

  if (dirKey === legacyKey) {
    throw new DataDirError(
      'DATA_DIR_IS_LEGACY',
      `"${dir}" é a pasta de dados da versão antiga do Fluxo. A v2 nunca abre essa pasta.`,
    );
  }
  if (dirKey.startsWith(legacyKey + pathMod.sep)) {
    throw new DataDirError(
      'DATA_DIR_INSIDE_LEGACY',
      `"${dir}" fica dentro da pasta de dados da versão antiga do Fluxo ("${legacyDir}"). A v2 nunca grava ali.`,
    );
  }
  if (pathMod.basename(dirKey) === LEGACY_DATA_DIR_NAME) {
    throw new DataDirError(
      'DATA_DIR_LEGACY_NAME',
      `"${dir}" tem o nome da pasta de dados da versão antiga ("${LEGACY_DATA_DIR_NAME}"). Use outro nome de pasta.`,
    );
  }
}

export function resolveDataDir(input: ResolveDataDirInput): ResolvedDataDir {
  const { appData, envValue, pathMod } = input;

  if (!pathMod.isAbsolute(appData)) {
    throw new DataDirError(
      'DATA_DIR_APPDATA_INVALID',
      `Diretório de dados de aplicação inválido (não é caminho absoluto): "${appData}".`,
    );
  }

  const legacyDir = pathMod.join(appData, LEGACY_DATA_DIR_NAME);
  let dir: string;
  let source: ResolvedDataDir['source'];

  if (envValue === undefined) {
    dir = pathMod.join(appData, DEFAULT_DATA_DIR_NAME);
    source = 'default';
  } else {
    if (envValue.trim() === '') {
      throw new DataDirError(
        'DATA_DIR_ENV_EMPTY',
        `${DATA_DIR_ENV_VAR} está definida, mas vazia. Remova a variável ou informe um caminho absoluto.`,
      );
    }
    if (!pathMod.isAbsolute(envValue)) {
      throw new DataDirError(
        'DATA_DIR_ENV_NOT_ABSOLUTE',
        `${DATA_DIR_ENV_VAR} precisa ser um caminho absoluto; recebido: "${envValue}".`,
      );
    }
    dir = pathMod.resolve(envValue);
    source = 'env';
  }

  assertNotLegacyDataDir(dir, appData, pathMod);
  return { dir, legacyDir, source };
}
