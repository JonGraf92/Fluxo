import { DomainError } from '../errors/DomainError';
import { MovementStatus } from '../value-objects/enums';

/**
 * Transições válidas na V1 (ADR D-010). DETECTED/SUGGESTED/REVERSED existem no tipo mas
 * nenhum caso de uso da V1 os produz — reservados para quando OCR/IA/estorno existirem.
 */
const ALLOWED_TRANSITIONS: Record<MovementStatus, readonly MovementStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  DETECTED: ['SUGGESTED', 'CANCELLED'],
  SUGGESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'REVERSED'],
  CANCELLED: [],
  REVERSED: [],
};

export function assertValidTransition(from: MovementStatus, to: MovementStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError(
      'INVALID_MOVEMENT_TRANSITION',
      `Não é possível mudar uma movimentação de "${from}" para "${to}".`,
    );
  }
}

/**
 * Regra de confirmação (seção 16): na V1, um lançamento manual salvo pelo usuário é
 * criado já como CONFIRMED (não existe fluxo de rascunho persistido na V1 — o DRAFT é
 * apenas o estado transitório do formulário no frontend, antes do submit).
 */
export function isConfirmed(status: MovementStatus): boolean {
  return status === 'CONFIRMED';
}

export function isCancellable(status: MovementStatus): boolean {
  return status === 'CONFIRMED' || status === 'DRAFT';
}
