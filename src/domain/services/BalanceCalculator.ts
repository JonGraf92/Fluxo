import { Money } from '../value-objects/Money';
import { MovementStatus } from '../value-objects/enums';

/** Recorte mínimo necessário para calcular saldo — evita acoplar o domínio ao schema do banco. */
export interface LegForBalance {
  readonly resourceId: string;
  readonly amountCents: number;
  readonly movementStatus: MovementStatus;
}

/**
 * Única fonte de verdade para saldo de um recurso — ver ADR D-009/D-018.
 * saldo = initialBalance + Σ legs de movimentos CONFIRMED daquele recurso.
 * Movimentos cancelados/draft/etc. nunca entram na soma.
 */
export function calculateResourceBalance(
  resourceId: string,
  initialBalanceCents: number,
  legs: readonly LegForBalance[],
): Money {
  const confirmedForResource = legs.filter(
    (leg) => leg.resourceId === resourceId && leg.movementStatus === 'CONFIRMED',
  );
  const sumOfLegs = confirmedForResource.reduce((sum, leg) => sum + leg.amountCents, 0);
  return Money.fromCents(initialBalanceCents + sumOfLegs);
}

export interface ResourceBalanceInput {
  readonly resourceId: string;
  readonly initialBalanceCents: number;
}

/** Calcula o saldo de vários recursos de uma vez, a partir do conjunto completo de legs do núcleo. */
export function calculateBalancesForResources(
  resources: readonly ResourceBalanceInput[],
  legs: readonly LegForBalance[],
): Map<string, Money> {
  const result = new Map<string, Money>();
  for (const resource of resources) {
    result.set(
      resource.resourceId,
      calculateResourceBalance(resource.resourceId, resource.initialBalanceCents, legs),
    );
  }
  return result;
}
