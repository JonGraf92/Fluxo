import { Adjustment } from '../../domain/entities/Adjustment';
import { Category } from '../../domain/entities/Category';
import { FinancialNucleus } from '../../domain/entities/FinancialNucleus';
import { Movement } from '../../domain/entities/Movement';
import { MovementLeg } from '../../domain/entities/MovementLeg';
import { Resource } from '../../domain/entities/Resource';

/**
 * Recorte completo o suficiente para reconstruir o histórico financeiro fora do Fluxo
 * (seção 38 — a exportação deve ser completa, não um resumo). Inclui movimentos
 * cancelados (histórico não é apagado — Regra 8) e todas as legs.
 */
export interface ExportSnapshot {
  nucleus: FinancialNucleus;
  resources: Resource[];
  categories: Category[];
  movements: Movement[];
  legs: MovementLeg[];
  adjustments: Adjustment[];
  exportedAt: Date;
}
