import { ExportSnapshot } from './ExportSnapshot';

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Exportação CSV — uma linha por MovementLeg (granularidade suficiente para reconstruir
 * o efeito exato de cada movimentação em cada recurso, inclusive transferências e ajustes).
 */
export function exportToCsv(snapshot: ExportSnapshot): string {
  const resourceNameById = new Map(snapshot.resources.map((r) => [r.id, r.name]));
  const categoryNameById = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const movementById = new Map(snapshot.movements.map((m) => [m.id, m]));
  // Ajuste é 1:1 com o Movement que o originou (ver ADR D-019) — daí a chave por movementId.
  const adjustmentByMovementId = new Map(snapshot.adjustments.map((a) => [a.movementId, a]));

  const header = [
    'data',
    'tipo',
    'status',
    'descricao',
    'categoria',
    'recurso',
    'valor',
    'movement_id',
    'motivo_ajuste',
    'cancelado_em',
    'motivo_cancelamento',
  ];

  const rows = snapshot.legs
    .map((leg) => {
      const movement = movementById.get(leg.movementId);
      if (!movement) return null;
      const adjustment = adjustmentByMovementId.get(movement.id);
      return [
        movement.date,
        movement.type,
        movement.status,
        movement.description,
        movement.categoryId ? (categoryNameById.get(movement.categoryId) ?? '') : '',
        resourceNameById.get(leg.resourceId) ?? leg.resourceId,
        centsToDecimalString(leg.amountCents),
        movement.id,
        adjustment?.reason ?? '',
        movement.cancelledAt ? movement.cancelledAt.toISOString() : '',
        movement.cancelledReason ?? '',
      ]
        .map((field) => csvEscape(String(field)))
        .join(';');
    })
    .filter((line): line is string => line !== null);

  return [header.join(';'), ...rows].join('\n');
}
