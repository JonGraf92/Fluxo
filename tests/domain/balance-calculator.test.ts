import { describe, expect, it } from 'vitest';
import { calculateResourceBalance, LegForBalance } from '../../src/domain/services/BalanceCalculator';

describe('BalanceCalculator — única fonte de verdade para saldo (ADR D-009/D-018)', () => {
  it('saldo = inicial + legs confirmadas do recurso', () => {
    const legs: LegForBalance[] = [
      { resourceId: 'R1', amountCents: 400000, movementStatus: 'CONFIRMED' }, // salário
      { resourceId: 'R1', amountCents: -30000, movementStatus: 'CONFIRMED' }, // supermercado
      { resourceId: 'R1', amountCents: -120000, movementStatus: 'CONFIRMED' }, // aluguel
      { resourceId: 'R1', amountCents: -50000, movementStatus: 'CONFIRMED' }, // saída da transferência
      { resourceId: 'R2', amountCents: 50000, movementStatus: 'CONFIRMED' }, // entrada da transferência
    ];
    const contaCorrente = calculateResourceBalance('R1', 200000, legs);
    const poupanca = calculateResourceBalance('R2', 0, legs);

    // Cenário 56 do Master Build Prompt
    expect(contaCorrente.toCents()).toBe(400000);
    expect(poupanca.toCents()).toBe(50000);
  });

  it('ignora legs de movimentos não confirmados (draft/cancelled)', () => {
    const legs: LegForBalance[] = [
      { resourceId: 'R1', amountCents: 10000, movementStatus: 'CONFIRMED' },
      { resourceId: 'R1', amountCents: 99999, movementStatus: 'CANCELLED' },
      { resourceId: 'R1', amountCents: 99999, movementStatus: 'DRAFT' },
    ];
    expect(calculateResourceBalance('R1', 0, legs).toCents()).toBe(10000);
  });

  it('nunca conta legs de outro recurso', () => {
    const legs: LegForBalance[] = [
      { resourceId: 'R1', amountCents: 10000, movementStatus: 'CONFIRMED' },
      { resourceId: 'R2', amountCents: 500000, movementStatus: 'CONFIRMED' },
    ];
    expect(calculateResourceBalance('R1', 0, legs).toCents()).toBe(10000);
  });
});
