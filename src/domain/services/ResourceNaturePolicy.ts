import { Money } from '../value-objects/Money';
import { ResourceType, natureOf } from '../value-objects/enums';

/**
 * Regra obrigatória (seção 11 / ADR D-008 / D-023): dinheiro (MONEY_ACCOUNT + CASH) e
 * benefício (BENEFIT) nunca são somados em um único total. Aplicações também ficam
 * separadas do dinheiro disponível, embora mantenham compatibilidade com transferências
 * entre recursos monetários. Este é o único lugar do domínio autorizado a agregar saldos.
 */
export interface ResourceWithBalance {
  readonly resourceId: string;
  readonly type: ResourceType;
  readonly balance: Money;
}

export interface AggregatedTotals {
  readonly moneyTotal: Money;
  readonly applicationTotal: Money;
  readonly benefitTotal: Money;
  readonly liabilityTotal: Money;
}

export function aggregateByNature(resources: readonly ResourceWithBalance[]): AggregatedTotals {
  let moneyTotal = Money.zero();
  let applicationTotal = Money.zero();
  let benefitTotal = Money.zero();
  let liabilityTotal = Money.zero();

  for (const resource of resources) {
    if (resource.type === 'APPLICATION') {
      applicationTotal = applicationTotal.add(resource.balance);
      continue;
    }
    const nature = natureOf(resource.type);
    if (nature === 'MONEY') moneyTotal = moneyTotal.add(resource.balance);
    else if (nature === 'BENEFIT') benefitTotal = benefitTotal.add(resource.balance);
    else liabilityTotal = liabilityTotal.add(resource.balance);
  }

  return { moneyTotal, applicationTotal, benefitTotal, liabilityTotal };
}

/** Impede explicitamente a operação "dinheiro + benefício" em qualquer chamador. */
export function forbidMixingNatures(a: ResourceType, b: ResourceType): void {
  if (natureOf(a) !== natureOf(b)) {
    throw new Error(
      'Violação de domínio: tentativa de combinar recursos de naturezas diferentes (dinheiro e benefício).',
    );
  }
}
