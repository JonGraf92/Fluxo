import { dialog } from 'electron';
import { DomainError } from '../../../../src/domain/errors/DomainError';
import { BackupError } from '../../../../src/infrastructure/backup/backup';
import { BackupManager } from '../../../../src/infrastructure/backup/BackupManager';
import { BackupStatusDto, CHANNELS, ListByNucleusSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handleAuthenticated } from '../register';

/** Erro de backup precisa chegar ao usuário com a mensagem real, não como "erro inesperado". */
async function surfacing<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BackupError) throw new DomainError(error.code, error.message);
    throw error;
  }
}

/**
 * Canais do backup automático (ADR D-035). A pasta de destino nunca vem do renderer: é
 * escolhida no diálogo nativo e gravada aqui, mesmo princípio da exportação (ADR D-033).
 */
export function registerBackupHandlers(ctx: IpcContext, backup: BackupManager): void {
  handleAuthenticated<typeof ListByNucleusSchema, BackupStatusDto>(
    ctx,
    CHANNELS.backupGetStatus,
    ListByNucleusSchema,
    async () => surfacing(() => backup.getStatus()),
  );

  handleAuthenticated<typeof ListByNucleusSchema, { canceled: boolean; status: BackupStatusDto }>(
    ctx,
    CHANNELS.backupChooseDestination,
    ListByNucleusSchema,
    async () => {
      const result = await dialog.showOpenDialog({
        title: 'Escolher pasta de backup do Fluxo',
        properties: ['openDirectory', 'createDirectory'],
      });
      const chosen = result.filePaths[0];
      if (result.canceled || !chosen) {
        return { canceled: true, status: await surfacing(() => backup.getStatus()) };
      }
      return surfacing(() => {
        backup.setDestination(chosen);
        return { canceled: false, status: backup.getStatus() };
      });
    },
  );

  handleAuthenticated<typeof ListByNucleusSchema, BackupStatusDto>(
    ctx,
    CHANNELS.backupRunNow,
    ListByNucleusSchema,
    async () =>
      surfacing(async () => {
        await backup.runBackup();
        return backup.getStatus();
      }),
  );
}
