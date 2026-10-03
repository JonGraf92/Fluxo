import { dialog } from 'electron';
import { ExportData } from '../../../../src/application/use-cases/export/ExportData';
import { CHANNELS, ExportChooseDestinationSchema, ExportRunSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handle, handleAuthenticated } from '../register';

export function registerExportHandlers(ctx: IpcContext): void {
  // Não toca em nenhum dado do núcleo — é só um seletor de arquivo nativo — então fica
  // como canal público, sem exigir identidade configurada.
  handle(CHANNELS.exportChooseDestination, ExportChooseDestinationSchema, async (payload) => {
    const extension = payload.format === 'csv' ? 'csv' : 'json';
    const result = await dialog.showSaveDialog({
      title: 'Exportar dados do Fluxo',
      defaultPath: `fluxo-export.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    return { canceled: result.canceled, filePath: result.filePath ?? null };
  });

  handleAuthenticated(ctx, CHANNELS.exportRun, ExportRunSchema, async (payload) => {
    return new ExportData(ctx.repos).execute(payload);
  });
}
