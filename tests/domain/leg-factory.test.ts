import { describe, expect, it } from 'vitest';
import { planAdjustmentLeg, planExpenseLeg, planIncomeLeg } from '../../src/domain/services/LegFactory';
import { Money } from '../../src/domain/value-objects/Money';
import { DomainError } from '../../src/domain/errors/DomainError';

describe('LegFactory — toda movimentação vira MovementLeg (ADR D-018)', () => {
  it('entrada gera leg positiva', () => {
    expect(planIncomeLeg('R1', Money.fromCents(1000))).toEqual({ resourceId: 'R1', amountCents: 1000 });
  });

  it('saída gera leg negativa', () => {
    expect(planExpenseLeg('R1', Money.fromCents(1000))).toEqual({ resourceId: 'R1', amountCents: -1000 });
  });

  it('ajuste gera leg com o delta informado, nunca zero', () => {
    expect(planAdjustmentLeg('R1', 5000)).toEqual({ resourceId: 'R1', amountCents: 5000 });
    expect(planAdjustmentLeg('R1', -3000)).toEqual({ resourceId: 'R1', amountCents: -3000 });
    expect(() => planAdjustmentLeg('R1', 0)).toThrow(DomainError);
  });
});
