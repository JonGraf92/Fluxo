export const PROPERTY_FINANCING_TYPES = ['HOUSE', 'APARTMENT', 'LAND', 'PROPERTY_CONSORTIUM'] as const;
export const VEHICLE_FINANCING_TYPES = ['CAR', 'MOTORCYCLE', 'TRUCK', 'JET_SKI', 'VEHICLE_CONSORTIUM'] as const;
export const FINANCING_ASSET_TYPES = [...PROPERTY_FINANCING_TYPES, ...VEHICLE_FINANCING_TYPES] as const;
export type FinancingAssetType = (typeof FINANCING_ASSET_TYPES)[number];
export type FinancingAssetGroup = 'PROPERTY' | 'VEHICLE';

export const VEHICLE_FINANCING_TERMS = [12, 24, 36, 48, 60] as const;
export const PROPERTY_FINANCING_TERMS = Array.from({ length: 16 }, (_, index) => 240 + index * 12);

export function allowedFinancingTerms(assetType: FinancingAssetType): readonly number[] {
  if (assetType === 'PROPERTY_CONSORTIUM' || assetType === 'VEHICLE_CONSORTIUM') {
    return [...VEHICLE_FINANCING_TERMS, ...PROPERTY_FINANCING_TERMS];
  }
  return PROPERTY_FINANCING_TYPES.includes(assetType as (typeof PROPERTY_FINANCING_TYPES)[number])
    ? PROPERTY_FINANCING_TERMS
    : VEHICLE_FINANCING_TERMS;
}

export function financingAssetGroup(assetType: FinancingAssetType): FinancingAssetGroup {
  return PROPERTY_FINANCING_TYPES.includes(assetType as (typeof PROPERTY_FINANCING_TYPES)[number]) ? 'PROPERTY' : 'VEHICLE';
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
  readonly status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
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
