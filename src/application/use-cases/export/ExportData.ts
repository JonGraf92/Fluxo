import fs from 'node:fs/promises';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { exportToCsv } from '../../../infrastructure/export/CsvExporter';
import { ExportSnapshot } from '../../../infrastructure/export/ExportSnapshot';
import { exportToJson } from '../../../infrastructure/export/JsonExporter';
import { RepositoryContext } from '../../ports/RepositoryContext';

export interface ExportDataInput {
  nucleusId: string;
  format: 'csv' | 'json';
  destinationPath: string;
}

/**
 * Exportação completa (seção 38/39) — inclui movimentos cancelados (histórico não é
 * apagado) e todas as legs, suficiente para reconstruir o histórico fora do Fluxo.
 * Nada é enviado para a nuvem automaticamente — apenas grava um arquivo local escolhido
 * pelo usuário.
 */
export class ExportData {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(input: ExportDataInput): Promise<{ filePath: string }> {
    const nucleus = await this.repos.nuclei.findById(input.nucleusId);
    if (!nucleus) {
      throw new NotFoundError('Núcleo financeiro', input.nucleusId);
    }

    const [resources, categories, movements, legs, adjustments] = await Promise.all([
      this.repos.resources.listByNucleus(input.nucleusId, { includeArchived: true }),
      this.repos.categories.listByNucleus(input.nucleusId),
      this.repos.movements.list({ nucleusId: input.nucleusId }),
      this.repos.movements.listLegsByNucleus(input.nucleusId),
      this.repos.movements.listAdjustmentsByNucleus(input.nucleusId),
    ]);

    const snapshot: ExportSnapshot = {
      nucleus,
      resources,
      categories,
      movements,
      legs,
      adjustments,
      exportedAt: new Date(),
    };

    const content = input.format === 'csv' ? exportToCsv(snapshot) : exportToJson(snapshot);

    if (!input.destinationPath) {
      throw new DomainError('EXPORT_DESTINATION_REQUIRED', 'Escolha onde salvar o arquivo exportado.');
    }

    await fs.writeFile(input.destinationPath, content, 'utf-8');
    return { filePath: input.destinationPath };
  }
}
