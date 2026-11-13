import React from 'react';
import type { FuelDetailsDto } from '../../../src/shared/ipc-contract';
import { formatLiterPrice } from '../../../src/shared/liter-price-parsing';
import { formatCentsToBRL } from '../../services/money';

export const FUEL_TYPE_LABELS: Record<NonNullable<FuelDetailsDto['fuelType']>, string> = {
  GASOLINE: 'Gasolina',
  ETHANOL: 'Etanol',
  DIESEL: 'Diesel',
  CNG: 'GNV',
};

export function formatLiters(quantityMl: number): string {
  return (quantityMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
}

/** Linha de leitura do abastecimento. Impostos ficam recolhidos e nunca são somados ao valor. */
export function FuelSummary({ fuel }: { fuel: FuelDetailsDto }) {
  const parts = [
    fuel.fuelType ? FUEL_TYPE_LABELS[fuel.fuelType] : null,
    fuel.quantityMl !== null ? formatLiters(fuel.quantityMl) : null,
    fuel.pricePerLiterMillis !== null ? `R$ ${formatLiterPrice(fuel.pricePerLiterMillis)}/L` : null,
    fuel.odometerKm !== null ? `${fuel.odometerKm.toLocaleString('pt-BR')} km` : null,
    fuel.stationName,
  ].filter(Boolean);
  const hasTaxes = fuel.taxTotalCents !== null || fuel.taxes.length > 0;
  return (
    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
      {parts.join(' · ')}
      {fuel.provenance === 'OCR' ? ' · lido da foto, confira' : ''}
      {hasTaxes && (
        <details>
          <summary style={{ cursor: 'pointer' }}>Impostos na nota{fuel.taxTotalCents !== null ? `: ${formatCentsToBRL(fuel.taxTotalCents)}` : ''}</summary>
          {fuel.taxes.map((tax) => (
            <div key={tax.taxCode} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>{tax.taxCode}</span>
              <span className="tabular">{formatCentsToBRL(tax.amountCents)}</span>
            </div>
          ))}
          <p style={{ margin: '4px 0 0' }}>Valores informados na nota fiscal, já incluídos no valor pago. O Fluxo não apura tributos nem substitui contador.</p>
        </details>
      )}
    </div>
  );
}
