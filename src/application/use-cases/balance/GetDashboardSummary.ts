import { Resource } from '../../../domain/entities/Resource';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { aggregateByNature, ResourceWithBalance } from '../../../domain/services/ResourceNaturePolicy';
import { Money } from '../../../domain/value-objects/Money';
import { RepositoryContext } from '../../ports/RepositoryContext';
import { attachLegs, MovementWithLegs } from '../movement/ListMovements';

export interface ResourceBalanceView {
  resource: Resource;
  balanceCents: number;
}

/** Dinheiro/cartão e benefício ficam em colunas separadas: nunca somados (ADR D-023). */
export interface CategoryExpense {
  /** null = saída sem categoria. */
  categoryId: string | null;
  amountCents: number;
  benefitAmountCents: number;
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
  /** Entradas e saídas do período em dinheiro e cartão — SEM benefício (ADR D-037). */
  periodIncomeCents: number;
  periodExpenseCents: number;
  /** Entradas e saídas do período em recurso de benefício (VR/VA). */
  periodBenefitIncomeCents: number;
  periodBenefitExpenseCents: number;
  /** Saídas do período por categoria, da maior para a menor. */
  expenseByCategory: CategoryExpense[];
  /** Soma das parcelas ainda previstas de financiamentos e empréstimos ativos. */
  financingOutstandingCents: number;
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
    // Arquivados entram só para saber a natureza de partidas antigas; não aparecem na lista.
    const allResources = await this.repos.resources.listByNucleus(input.nucleusId, { includeArchived: true });
    const resources = allResources.filter((resource) => !resource.archived);
    const typeByResource = new Map(allResources.map((resource) => [resource.id, resource.type]));
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

    let income = 0;
    let expense = 0;
    let benefitIncome = 0;
    let benefitExpense = 0;
    const byCategory = new Map<string | null, CategoryExpense>();
    for (const leg of periodLegs) {
      const movement = movementById.get(leg.movementId);
      if (!movement) continue;
      const amount = Math.abs(leg.amountCents);
      const isBenefit = typeByResource.get(leg.resourceId) === 'BENEFIT';
      if (movement.type === 'INCOME') {
        if (isBenefit) benefitIncome += amount;
        else income += amount;
      }
      if (movement.type === 'EXPENSE') {
        if (isBenefit) benefitExpense += amount;
        else expense += amount;
        const entry = byCategory.get(movement.categoryId) ?? { categoryId: movement.categoryId, amountCents: 0, benefitAmountCents: 0 };
        if (isBenefit) entry.benefitAmountCents += amount;
        else entry.amountCents += amount;
        byCategory.set(movement.categoryId, entry);
      }
    }

    const financings = await this.repos.financings.listByNucleus(input.nucleusId);
    const financingOutstandingCents = financings
      .filter((item) => item.plan.status === 'ACTIVE')
      .flatMap((item) => item.installments)
      .filter((installment) => installment.status === 'PENDING')
      .reduce((sum, installment) => sum + installment.amountCents, 0);

    // Até o fim do período: parcelas de cartão com data futura não ocupam a lista de recentes.
    const recentAll = await this.repos.movements.list({ nucleusId: input.nucleusId, dateTo: input.periodDateTo });
    const recent = recentAll.slice(0, input.recentMovementsLimit ?? 10);

    return {
      resources: resourceBalances,
      moneyTotalCents: totals.moneyTotal.toCents(),
      applicationTotalCents: totals.applicationTotal.toCents(),
      benefitTotalCents: totals.benefitTotal.toCents(),
      creditOutstandingCents: totals.liabilityTotal.toCents(),
      periodIncomeCents: income,
      periodExpenseCents: expense,
      periodBenefitIncomeCents: benefitIncome,
      periodBenefitExpenseCents: benefitExpense,
      expenseByCategory: [...byCategory.values()].sort(
        (a, b) => b.amountCents + b.benefitAmountCents - (a.amountCents + a.benefitAmountCents),
      ),
      financingOutstandingCents,
      recentMovements: await attachLegs(this.repos, recent),
    };
  }
}
