import { describe, expect, it } from 'vitest';
import { aggregateByNature } from '../../src/domain/services/ResourceNaturePolicy';
import { Money } from '../../src/domain/value-objects/Money';

describe('ResourceNaturePolicy — Regra 11: dinheiro ≠ benefício (ADR D-008/D-023)', () => {
  it('nunca soma dinheiro com benefício em um único total (cenário 57)', () => {
    const totals = aggregateByNature([
      { resourceId: 'conta', type: 'MONEY_ACCOUNT', balance: Money.fromCents(200000) },
      { resourceId: 'vr', type: 'BENEFIT', balance: Money.fromCents(60000) },
    ]);

    expect(totals.moneyTotal.toCents()).toBe(200000);
    expect(totals.benefitTotal.toCents()).toBe(60000);
    // Nunca deve existir um "total geral" de 260000 em lugar nenhum do domínio.
  });

  it('CASH conta como dinheiro, junto com MONEY_ACCOUNT', () => {
    const totals = aggregateByNature([
      { resourceId: 'conta', type: 'MONEY_ACCOUNT', balance: Money.fromCents(100000) },
      { resourceId: 'carteira', type: 'CASH', balance: Money.fromCents(5000) },
    ]);
    expect(totals.moneyTotal.toCents()).toBe(105000);
    expect(totals.benefitTotal.toCents()).toBe(0);
  });
});
