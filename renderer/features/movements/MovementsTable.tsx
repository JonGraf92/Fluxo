import React from 'react';
import type { CategoryDto, MemberDto, MovementDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { formatCentsToBRL } from '../../services/money';

interface MovementsTableProps {
  movements: MovementDto[];
  resources: ResourceDto[];
  categories: CategoryDto[];
  members: MemberDto[];
  onCancel?: (movement: MovementDto) => void;
}

const TYPE_LABEL: Record<MovementDto['type'], string> = {
  INCOME: 'Entrada',
  EXPENSE: 'Saída',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
};

const TYPE_PILL_CLASS: Record<MovementDto['type'], string> = {
  INCOME: 'pill pill-income',
  EXPENSE: 'pill pill-expense',
  TRANSFER: 'pill pill-transfer',
  ADJUSTMENT: 'pill pill-adjustment',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function MovementsTable({ movements, resources, categories, members, onCancel }: MovementsTableProps) {
  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? '—';
  const personName = (id: string) => members.find((person) => person.id === id)?.displayName ?? '—';
  const categoryName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? '—' : '—');

  if (movements.length === 0) {
    return <p style={{ color: 'var(--color-ink-muted)' }}>Nenhuma movimentação encontrada.</p>;
  }

  return (
    <table className="movement-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>Tipo</th>
          <th>Categoria</th>
          <th>Responsável</th>
          <th>Recurso</th>
          <th className="col-amount">Valor</th>
          {onCancel ? <th /> : null}
        </tr>
      </thead>
      <tbody>
        {movements.map((movement) => {
          const isCancelled = movement.status === 'CANCELLED';
          return movement.legs.map((leg, idx) => (
            <tr key={leg.id} className={isCancelled ? 'movement-status-cancelled' : ''}>
              {idx === 0 ? (
                <>
                  <td rowSpan={movement.legs.length}>{formatDate(movement.date)}</td>
                  <td rowSpan={movement.legs.length}>
                    {movement.description}
                    {isCancelled ? ' (cancelado)' : ''}
                  </td>
                  <td rowSpan={movement.legs.length}>
                    <span className={TYPE_PILL_CLASS[movement.type]}>{TYPE_LABEL[movement.type]}</span>
                  </td>
                  <td rowSpan={movement.legs.length}>{categoryName(movement.categoryId)}</td>
                  <td rowSpan={movement.legs.length}>{personName(movement.responsiblePersonId)}</td>
                </>
              ) : null}
              <td>{resourceName(leg.resourceId)}</td>
              <td className={['col-amount', 'tabular', leg.amountCents >= 0 ? 'amount-positive' : 'amount-negative'].join(' ')}>
                {formatCentsToBRL(leg.amountCents)}
              </td>
              {idx === 0 && onCancel ? (
                <td rowSpan={movement.legs.length}>
                  {!isCancelled && (
                    <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => onCancel(movement)}>
                      Cancelar
                    </button>
                  )}
                </td>
              ) : null}
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}
