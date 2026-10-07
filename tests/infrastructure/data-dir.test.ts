import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNotLegacyDataDir,
  DataDirError,
  DataDirErrorCode,
  DEFAULT_DATA_DIR_NAME,
  resolveDataDir,
} from '../../src/infrastructure/dataDir';

const WIN_APPDATA = 'C:\\Users\\teste\\AppData\\Roaming';
const POSIX_APPDATA = '/home/teste/.config';

function resolveWin(envValue: string | undefined) {
  return resolveDataDir({ appData: WIN_APPDATA, envValue, pathMod: path.win32 });
}

function resolvePosix(envValue: string | undefined) {
  return resolveDataDir({ appData: POSIX_APPDATA, envValue, pathMod: path.posix });
}

function expectCode(fn: () => unknown, code: DataDirErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DataDirError);
  expect((caught as DataDirError).code).toBe(code);
  expect((caught as DataDirError).message.length).toBeGreaterThan(0);
}

describe('resolveDataDir — ADR D-034: diretório de dados da v2 isolado do legado', () => {
  describe('padrão', () => {
    it('Windows: <appData>\\fluxo-v2', () => {
      expect(resolveWin(undefined)).toEqual({
        dir: `${WIN_APPDATA}\\${DEFAULT_DATA_DIR_NAME}`,
        legacyDir: `${WIN_APPDATA}\\fluxo`,
        source: 'default',
      });
    });

    it('POSIX: <appData>/fluxo-v2', () => {
      expect(resolvePosix(undefined)).toEqual({
        dir: `${POSIX_APPDATA}/${DEFAULT_DATA_DIR_NAME}`,
        legacyDir: `${POSIX_APPDATA}/fluxo`,
        source: 'default',
      });
    });

    it('recusa appData que não é caminho absoluto', () => {
      expectCode(
        () => resolveDataDir({ appData: 'AppData\\Roaming', envValue: undefined, pathMod: path.win32 }),
        'DATA_DIR_APPDATA_INVALID',
      );
      expectCode(
        () => resolveDataDir({ appData: '', envValue: undefined, pathMod: path.posix }),
        'DATA_DIR_APPDATA_INVALID',
      );
    });
  });

  describe('override por FLUXO_DATA_DIR', () => {
    it('aceita caminho absoluto no Windows', () => {
      const resolved = resolveWin('D:\\projetos\\Fluxo\\fluxo\\.fluxo-dev-data');
      expect(resolved.dir).toBe('D:\\projetos\\Fluxo\\fluxo\\.fluxo-dev-data');
      expect(resolved.source).toBe('env');
    });

    it('aceita caminho absoluto no POSIX', () => {
      const resolved = resolvePosix('/tmp/Fluxo/fluxo/.fluxo-dev-data');
      expect(resolved.dir).toBe('/tmp/Fluxo/fluxo/.fluxo-dev-data');
      expect(resolved.source).toBe('env');
    });

    it('Windows aceita barras normais e devolve o caminho normalizado', () => {
      expect(resolveWin('D:/dados/fluxo-teste/').dir).toBe('D:\\dados\\fluxo-teste');
    });

    it('recusa caminho relativo', () => {
      expectCode(() => resolveWin('.fluxo-dev-data'), 'DATA_DIR_ENV_NOT_ABSOLUTE');
      expectCode(() => resolveWin('..\\dados'), 'DATA_DIR_ENV_NOT_ABSOLUTE');
      expectCode(() => resolvePosix('.fluxo-dev-data'), 'DATA_DIR_ENV_NOT_ABSOLUTE');
      expectCode(() => resolvePosix('dados/v2'), 'DATA_DIR_ENV_NOT_ABSOLUTE');
    });

    it('caminho de Windows não é absoluto no POSIX', () => {
      expectCode(() => resolvePosix('C:\\dados\\v2'), 'DATA_DIR_ENV_NOT_ABSOLUTE');
    });

    it('recusa valor vazio ou só com espaços', () => {
      expectCode(() => resolveWin(''), 'DATA_DIR_ENV_EMPTY');
      expectCode(() => resolveWin('   '), 'DATA_DIR_ENV_EMPTY');
      expectCode(() => resolvePosix(''), 'DATA_DIR_ENV_EMPTY');
    });
  });

  describe('nome "fluxo" recusado em qualquer capitalização', () => {
    for (const name of ['fluxo', 'Fluxo', 'FLUXO']) {
      it(`Windows: D:\\dados\\${name}`, () => {
        expectCode(() => resolveWin(`D:\\dados\\${name}`), 'DATA_DIR_LEGACY_NAME');
        expectCode(() => resolveWin(`D:\\dados\\${name}\\`), 'DATA_DIR_LEGACY_NAME');
      });

      it(`POSIX: /srv/dados/${name}`, () => {
        expectCode(() => resolvePosix(`/srv/dados/${name}`), 'DATA_DIR_LEGACY_NAME');
        expectCode(() => resolvePosix(`/srv/dados/${name}/`), 'DATA_DIR_LEGACY_NAME');
      });
    }

    it('Windows: pontos e espaços finais não disfarçam o nome', () => {
      expectCode(() => resolveWin('D:\\dados\\fluxo.'), 'DATA_DIR_LEGACY_NAME');
      expectCode(() => resolveWin('D:\\dados\\Fluxo '), 'DATA_DIR_LEGACY_NAME');
    });

    it('só o último segmento conta: pasta dentro de um diretório chamado "fluxo" fora do legado é aceita', () => {
      expect(resolveWin('D:\\Fluxo\\fluxo\\.fluxo-dev-data').source).toBe('env');
      expect(resolvePosix('/srv/fluxo/dados-v2').source).toBe('env');
    });
  });

  describe('caminho legado exato recusado mesmo via override', () => {
    it('Windows, em qualquer capitalização e com separador final', () => {
      expectCode(() => resolveWin(`${WIN_APPDATA}\\fluxo`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolveWin(`${WIN_APPDATA}\\Fluxo`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolveWin(`${WIN_APPDATA.toUpperCase()}\\FLUXO\\`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolveWin('c:/users/teste/appdata/roaming/fluxo'), 'DATA_DIR_IS_LEGACY');
    });

    it('Windows: via ".." e via ponto final', () => {
      expectCode(() => resolveWin(`${WIN_APPDATA}\\fluxo-v2\\..\\fluxo`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolveWin(`${WIN_APPDATA}\\fluxo.`), 'DATA_DIR_IS_LEGACY');
    });

    it('POSIX, em qualquer capitalização', () => {
      expectCode(() => resolvePosix(`${POSIX_APPDATA}/fluxo`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolvePosix(`${POSIX_APPDATA}/Fluxo/`), 'DATA_DIR_IS_LEGACY');
      expectCode(() => resolvePosix(`${POSIX_APPDATA}/outra/../FLUXO`), 'DATA_DIR_IS_LEGACY');
    });
  });

  describe('pasta dentro do legado recusada', () => {
    it('Windows', () => {
      expectCode(() => resolveWin(`${WIN_APPDATA}\\fluxo\\v2`), 'DATA_DIR_INSIDE_LEGACY');
      expectCode(() => resolveWin(`${WIN_APPDATA}\\Fluxo\\dados\\novo`), 'DATA_DIR_INSIDE_LEGACY');
      expectCode(() => resolveWin(`${WIN_APPDATA}\\fluxo.\\v2`), 'DATA_DIR_INSIDE_LEGACY');
    });

    it('POSIX', () => {
      expectCode(() => resolvePosix(`${POSIX_APPDATA}/fluxo/v2`), 'DATA_DIR_INSIDE_LEGACY');
      expectCode(() => resolvePosix(`${POSIX_APPDATA}/FLUXO/dados/novo`), 'DATA_DIR_INSIDE_LEGACY');
    });

    it('pasta irmã com prefixo "fluxo" não é confundida com o legado', () => {
      expect(resolveWin(`${WIN_APPDATA}\\fluxo-v2`).dir).toBe(`${WIN_APPDATA}\\fluxo-v2`);
      expect(resolveWin(`${WIN_APPDATA}\\fluxo-teste\\dados`).source).toBe('env');
      expect(resolvePosix(`${POSIX_APPDATA}/fluxo-v2`).dir).toBe(`${POSIX_APPDATA}/fluxo-v2`);
    });
  });

  describe('assertNotLegacyDataDir — reaplicada sobre o caminho real', () => {
    it('aceita o padrão e recusa o legado', () => {
      expect(() =>
        assertNotLegacyDataDir(`${WIN_APPDATA}\\fluxo-v2`, WIN_APPDATA, path.win32),
      ).not.toThrow();
      expectCode(
        () => assertNotLegacyDataDir(`${WIN_APPDATA}\\Fluxo`, WIN_APPDATA, path.win32),
        'DATA_DIR_IS_LEGACY',
      );
      expectCode(
        () => assertNotLegacyDataDir(`${POSIX_APPDATA}/fluxo/x`, POSIX_APPDATA, path.posix),
        'DATA_DIR_INSIDE_LEGACY',
      );
    });

    it('recusa caminho relativo', () => {
      expectCode(
        () => assertNotLegacyDataDir('fluxo-v2', WIN_APPDATA, path.win32),
        'DATA_DIR_ENV_NOT_ABSOLUTE',
      );
    });
  });
});
