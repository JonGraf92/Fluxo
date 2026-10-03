import { DomainError } from '../errors/DomainError';
import { Money, requirePositiveMagnitude } from '../value-objects/Money';

export interface LegPlan {
  readonly resourceId: string;
  readonly amountCents: number;
}

/** ENTRADA — sempre 1 leg positiva (crédito no recurso). Ver ADR D-018. */
export function planIncomeLeg(resourceId: string, amount: Money): LegPlan {
  requirePositiveMagnitude(amount, 'valor da entrada');
  return { resourceId, amountCents: amount.toCents() };
}

/** SAÍDA — sempre 1 leg negativa (débito no recurso). Ver ADR D-018. */
export function planExpenseLeg(resourceId: string, amount: Money): LegPlan {
  requirePositiveMagnitude(amount, 'valor da saída');
  return { resourceId, amountCents: amount.negate().toCents() };
}

/**
 * AJUSTE — 1 leg com o delta (diferença), podendo ser positivo ou negativo, nunca zero.
 * O `Adjustment` (auditoria) é responsabilidade do caso de uso, não desta função —
 * ver ADR D-019: o efeito financeiro vive só aqui, na leg.
 */
export function planAdjustmentLeg(resourceId: string, deltaCents: number): LegPlan {
  if (deltaCents === 0) {
    throw new DomainError('ADJUSTMENT_MUST_HAVE_EFFECT', 'Um ajuste não pode ter efeito financeiro igual a zero.');
  }
  if (!Number.isInteger(deltaCents)) {
    throw new DomainError('ADJUSTMENT_MUST_BE_INTEGER_CENTS', 'O ajuste deve ser um inteiro em centavos.');
  }
  return { resourceId, amountCents: deltaCents };
}
