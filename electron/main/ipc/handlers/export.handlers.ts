import { dialog } from 'electron';
import { ExportData } from '../../../../src/application/use-cases/export/ExportData';
import { CHANNELS, ExportChooseDestinationSchema, ExportRunSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handle, handleAuthenticated } from '../register';
import { DomainError } from '../../../../src/domain/errors/DomainError';

/**
 * Caminho que o USUÁRIO escolheu no diálogo nativo, por núcleo.
 *
 * Por que isto existe: `exportRun` recebia `destinationPath` do payload do renderer e
 * gravava direto (`ExportData.ts:53`). O `showSaveDialog` existia, mas o resultado dele não
 * era vinculante — um renderer comprometido (ou apenas um bug) podia gravar em QUALQUER
 * caminho do disco, sobrescrevendo arquivos do usuário.
 *
 * O renderer não é fonte confiável para decidir onde escrever. Agora o `main` guarda o
 * caminho que o próprio usuário aprovou no diálogo do sistema e só aceita gravar ali.
 * É o mesmo princípio de D-024/D-025: o que vem do renderer nunca é autoridade.
 */
const approvedDestinations = new Map<string, string>();

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
    if (!result.canceled && result.filePath) {
      approvedDestinations.set(payload.nucleusId, result.filePath);
      return { canceled: false, filePath: result.filePath };
    }
    return { canceled: true, filePath: null };
  });

  handleAuthenticated(ctx, CHANNELS.exportRun, ExportRunSchema, async (payload) => {
    const approved = approvedDestinations.get(payload.nucleusId);
    if (!approved) {
      throw new DomainError(
        'EXPORT_DESTINATION_NOT_APPROVED',
        'Escolha o local do arquivo na janela de salvar antes de exportar.',
      );
    }
    // O caminho gravado é SEMPRE o aprovado no diálogo; `destinationPath` do payload é
    // ignorado de propósito. Comparar e recusar seria suficiente, mas ignorar elimina a
    // possibilidade de qualquer variação (normalização, link simbólico) escapar.
    return new ExportData(ctx.repos).execute({ ...payload, destinationPath: approved });
  });
}
