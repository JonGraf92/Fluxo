export const PROPERTY_FINANCING_TYPES = ['HOUSE', 'APARTMENT', 'LAND', 'PROPERTY_CONSORTIUM'] as const;
export const VEHICLE_FINANCING_TYPES = ['CAR', 'MOTORCYCLE', 'TRUCK', 'JET_SKI', 'VEHICLE_CONSORTIUM'] as const;
/** Empréstimo: dinheiro tomado, sem bem vinculado (ADR D-036). */
export const LOAN_FINANCING_TYPE = 'LOAN' as const;
export const FINANCING_ASSET_TYPES = [...PROPERTY_FINANCING_TYPES, ...VEHICLE_FINANCING_TYPES, LOAN_FINANCING_TYPE] as const;
export type FinancingAssetType = (typeof FINANCING_ASSET_TYPES)[number];
export type FinancingAssetGroup = 'PROPERTY' | 'VEHICLE' | 'LOAN';

export const VEHICLE_FINANCING_TERMS = [12, 24, 36, 48, 60] as const;
export const PROPERTY_FINANCING_TERMS = Array.from({ length: 16 }, (_, index) => 240 + index * 12);
/** Empréstimo aceita qualquer quantidade de parcelas, de 1 até o maior prazo de financiamento. */
export const LOAN_MAX_TERM_MONTHS = 420;
export const LOAN_FINANCING_TERMS = Array.from({ length: LOAN_MAX_TERM_MONTHS }, (_, index) => index + 1);

export function allowedFinancingTerms(assetType: FinancingAssetType): readonly number[] {
  if (assetType === LOAN_FINANCING_TYPE) return LOAN_FINANCING_TERMS;
  if (assetType === 'PROPERTY_CONSORTIUM' || assetType === 'VEHICLE_CONSORTIUM') {
    return [...VEHICLE_FINANCING_TERMS, ...PROPERTY_FINANCING_TERMS];
  }
  return PROPERTY_FINANCING_TYPES.includes(assetType as (typeof PROPERTY_FINANCING_TYPES)[number])
    ? PROPERTY_FINANCING_TERMS
    : VEHICLE_FINANCING_TERMS;
}

export function financingAssetGroup(assetType: FinancingAssetType): FinancingAssetGroup {
  if (assetType === LOAN_FINANCING_TYPE) return 'LOAN';
  return PROPERTY_FINANCING_TYPES.includes(assetType as (typeof PROPERTY_FINANCING_TYPES)[number]) ? 'PROPERTY' : 'VEHICLE';
}

export const FINANCING_CATEGORY_NAME = 'Financiamentos';
export const LOAN_CATEGORY_NAME = 'Empréstimos';

/** Categoria de sistema em que entram as parcelas pagas de cada tipo de plano. */
export function financingCategoryName(assetType: FinancingAssetType): string {
  return assetType === LOAN_FINANCING_TYPE ? LOAN_CATEGORY_NAME : FINANCING_CATEGORY_NAME;
}

export const LOAN_INTEREST_RATE_PERIODS = ['MONTH', 'YEAR'] as const;
export type LoanInterestRatePeriod = (typeof LOAN_INTEREST_RATE_PERIODS)[number];
/** Teto da taxa informada: 1000,00% no período. Acima disso é erro de digitação. */
export const LOAN_MAX_INTEREST_RATE_BPS = 100_000;

/**
 * Condições do empréstimo. São REGISTRO: não geram lançamento e não entram em nenhum
 * cálculo de saldo. O que movimenta dinheiro é só a baixa de cada parcela.
 */
export interface LoanTerms {
  /** Valor emprestado, em centavos. */
  readonly principalAmountCents: number;
  /** Taxa de juros em centésimos de ponto percentual: 1,99% = 199. Inteiro, nunca float. */
  readonly interestRateBps: number;
  readonly interestRatePeriod: LoanInterestRatePeriod;
}

/** Devolve o código do primeiro problema nas condições, ou `null` se estão válidas. */
export function loanTermsProblem(loan: LoanTerms): 'LOAN_PRINCIPAL_INVALID' | 'LOAN_INTEREST_RATE_INVALID' | 'LOAN_INTEREST_PERIOD_INVALID' | null {
  if (!Number.isSafeInteger(loan.principalAmountCents) || loan.principalAmountCents <= 0) return 'LOAN_PRINCIPAL_INVALID';
  if (!Number.isInteger(loan.interestRateBps) || loan.interestRateBps < 0 || loan.interestRateBps > LOAN_MAX_INTEREST_RATE_BPS) {
    return 'LOAN_INTEREST_RATE_INVALID';
  }
  if (!LOAN_INTEREST_RATE_PERIODS.includes(loan.interestRatePeriod)) return 'LOAN_INTEREST_PERIOD_INVALID';
  return null;
}

export interface LoanCostSummary {
  /** Soma de todas as parcelas pelo valor previsto. */
  readonly totalPayableCents: number;
  /** Total a pagar menos o valor emprestado: juros e encargos embutidos nas parcelas. */
  readonly costCents: number;
  readonly lastDueDate: string;
}

/**
 * Resumo derivado só do que o usuário informou (parcela × quantidade − emprestado). A taxa
 * NÃO entra na conta: bancos embutem IOF e tarifas, então recalcular a parcela pela taxa
 * daria um número diferente do contrato.
 */
export function loanCostSummary(input: { principalAmountCents: number; installmentAmountCents: number; termMonths: number; firstDueDate: string }): LoanCostSummary {
  const totalPayableCents = input.installmentAmountCents * input.termMonths;
  return {
    totalPayableCents,
    costCents: totalPayableCents - input.principalAmountCents,
    lastDueDate: financingDueDate(input.firstDueDate, input.termMonths),
  };
}

export interface FinancingPlan {
  readonly id: string;
  readonly nucleusId: string;
  readonly categoryId: string;
  readonly assetType: FinancingAssetType;
  readonly description: string;
  readonly termMonths: number;
  readonly installmentAmountCents: number;
  readonly firstDueDate: string;
  readonly paymentResourceId: string;
  readonly responsiblePersonId: string;
  readonly createdByPersonId: string;
  /** Preenchido se, e somente se, `assetType` é LOAN. */
  readonly loan: LoanTerms | null;
  /**
   * DELETED e soft delete: o plano permanece no banco para auditoria em vez de ser removido
   * fisicamente. Historico confirmado nunca e apagado (mesmo principio do ADR D-010).
   */
  readonly status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DELETED';
  readonly createdAt: Date;
}

export interface FinancingInstallment {
  readonly id: string;
  readonly planId: string;
  readonly installmentNumber: number;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly paidAmountCents: number | null;
  readonly status: 'PENDING' | 'PAID';
  readonly paidAt: string | null;
  readonly paymentMovementId: string | null;
  readonly paymentResourceId: string;
}

export interface FinancingPlanWithInstallments {
  readonly plan: FinancingPlan;
  readonly installments: readonly FinancingInstallment[];
}

/** Gera parcelas mensais sem derrapar na data (ex.: 31/jan, 28/fev, 31/mar). */
export function financingDueDate(firstDueDate: string, installmentNumber: number): string {
  const [yearPart, monthPart, dayPart] = firstDueDate.split('-').map(Number);
  const year = yearPart ?? 0;
  const month = monthPart ?? 1;
  const day = dayPart ?? 1;
  const monthIndex = month - 1 + installmentNumber - 1;
  const dueYear = year + Math.floor(monthIndex / 12);
  const dueMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
  return `${String(dueYear).padStart(4, '0')}-${String(dueMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Parcela do mês corrente que vence até sete dias antes/depois da data de cadastro. */
export function currentMonthInstallmentNearDate(firstDueDate: string, termMonths: number, entryDate: string, windowDays = 7): number | null {
  const entryMonth = entryDate.slice(0, 7);
  const entryTime = Date.parse(`${entryDate}T00:00:00.000Z`);
  for (let number = 1; number <= termMonths; number += 1) {
    const dueDate = financingDueDate(firstDueDate, number);
    if (dueDate.slice(0, 7) !== entryMonth) continue;
    const dueTime = Date.parse(`${dueDate}T00:00:00.000Z`);
    if (Number.isFinite(entryTime) && Number.isFinite(dueTime) && Math.abs(dueTime - entryTime) <= windowDays * 86400000) return number;
  }
  return null;
}
