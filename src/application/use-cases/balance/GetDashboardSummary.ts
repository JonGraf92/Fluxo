import { Resource } from '../../../domain/entities/Resource';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { aggregateByNature, ResourceWithBalance } from '../../../domain/services/ResourceNaturePolicy';
import { Money } from '../../../domain/value-objects/Money';
import { RepositoryContext } from '../../ports/RepositoryContext';
import { MovementWithLegs } from '../movement/ListMovements';

export interface ResourceBalanceView {
  resource: Resource;
  balanceCents: number;
}

export interface DashboardSummary {
  resources: ResourceBalanceView[];
  /** Saldo líquido em contas e dinheiro físico, sem aplicações e benefícios. */
  moneyTotalCents: number;
  /** Saldo das aplicações, mantido separado do dinheiro imediatamente disponível. */
  applicationTotalCents: number;
  /** Benefícios (VR/VA) — sempre exibido separadamente. */
  benefitTotalCents: number;
  creditOutstandingCents: number;
  periodIncomeCents: number;
  periodExpenseCents: number;
  recentMovements: MovementWithLegs[];
}

export interface GetDashboardSummaryInput {
  nucleusId: string;
  periodDateFrom: string;
  periodDateTo: string;
  recentMovementsLimit?: number;
}

/**
 * Monta o resumo do dashboard já com os totais corretamente separados por natureza —
 * nenhum componente de UI recebe (nem pode calcular) "saldo total" misturando dinheiro e
 * benefício (Regra 11, ADR D-023).
 */
export class GetDashboardSummary {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(input: GetDashboardSummaryInput): Promise<DashboardSummary> {
    const resources = await this.repos.resources.listByNucleus(input.nucleusId);
    const legsForBalance = await this.repos.movements.listLegsForBalance(input.nucleusId);

    const resourceBalances: ResourceBalanceView[] = resources.map((resource) => ({
      resource,
      balanceCents: calculateResourceBalance(resource.id, resource.initialBalanceCents, legsForBalance).toCents(),
    }));

    const withNature: ResourceWithBalance[] = resourceBalances.map((r) => ({
      resourceId: r.resource.id,
      type: r.resource.type,
      balance: Money.fromCents(r.balanceCents),
    }));
    const totals = aggregateByNature(withNature);

    const periodMovements = await this.repos.movements.list({
      nucleusId: input.nucleusId,
      status: 'CONFIRMED',
      dateFrom: input.periodDateFrom,
      dateTo: input.periodDateTo,
    });
    const periodLegs = await this.repos.movements.listLegsByMovementIds(periodMovements.map((m) => m.id));
    const movementById = new Map(periodMovements.map((m) => [m.id, m]));

    let periodIncome = Money.zero();
    let periodExpense = Money.zero();
    for (const leg of periodLegs) {
      const movement = movementById.get(leg.movementId);
      if (!movement) continue;
      if (movement.type === 'INCOME') periodIncome = periodIncome.add(Money.fromCents(leg.amountCents));
      if (movement.type === 'EXPENSE') periodExpense = periodExpense.add(Money.fromCents(Math.abs(leg.amountCents)));
    }

    const recentAll = await this.repos.movements.list({ nucleusId: input.nucleusId });
    const limit = input.recentMovementsLimit ?? 10;
    const recent = recentAll.slice(0, limit);
    const recentLegs = await this.repos.movements.listLegsByMovementIds(recent.map((m) => m.id));
    const legsByMovement = new Map<string, typeof recentLegs>();
    for (const leg of recentLegs) {
      const list = legsByMovement.get(leg.movementId) ?? [];
      list.push(leg);
      legsByMovement.set(leg.movementId, list);
    }

    return {
      resources: resourceBalances,
      moneyTotalCents: totals.moneyTotal.toCents(),
      applicationTotalCents: totals.applicationTotal.toCents(),
      benefitTotalCents: totals.benefitTotal.toCents(),
      creditOutstandingCents: totals.liabilityTotal.toCents(),
      periodIncomeCents: periodIncome.toCents(),
      periodExpenseCents: Math.abs(periodExpense.toCents()),
      recentMovements: recent.map((movement) => ({
        movement,
        legs: legsByMovement.get(movement.id) ?? [],
      })),
    };
  }
}
