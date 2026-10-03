/** Tipo de movimentação financeira — seção 13 do Master Build Prompt. Não criar um 5º tipo. */
export const MOVEMENT_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Ciclo de vida da movimentação — seção 15. A V1 só produz DRAFT→CONFIRMED e
 * CONFIRMED→CANCELLED (ver ADR D-010). Os demais estados existem no tipo para não exigir
 * migração de schema quando OCR/IA forem implementados (fora de escopo da V1).
 */
export const MOVEMENT_STATUSES = [
  'DRAFT',
  'DETECTED',
  'SUGGESTED',
  'CONFIRMED',
  'CANCELLED',
  'REVERSED',
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

/** Natureza do recurso — seção 10/11. Dinheiro e benefício nunca são intercambiáveis. */
export const RESOURCE_TYPES = ['MONEY_ACCOUNT', 'CASH', 'APPLICATION', 'BENEFIT', 'CREDIT_CARD'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const BENEFIT_SUBTYPES = ['VR', 'VA'] as const;
export type BenefitSubtype = (typeof BENEFIT_SUBTYPES)[number];

export const PAYMENT_METHODS = ['DEBIT', 'PIX', 'BENEFIT', 'CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Papéis de participação no núcleo — seção 9. V1 só usa OWNER. */
export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'ASSISTED'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const OWNERSHIP_TYPES = ['OWNER', 'CO_OWNER'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const CATEGORY_KINDS = ['INCOME', 'EXPENSE'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const NUCLEUS_TYPES = ['INDIVIDUAL', 'FAMILY', 'SHARED'] as const;
export type NucleusType = (typeof NUCLEUS_TYPES)[number];

/** Natureza agregável de um recurso, usada pelo ResourceNaturePolicy (D-008/D-023). */
export type ResourceNature = 'MONEY' | 'BENEFIT' | 'LIABILITY';

export function natureOf(resourceType: ResourceType): ResourceNature {
  if (resourceType === 'BENEFIT') return 'BENEFIT';
  if (resourceType === 'CREDIT_CARD') return 'LIABILITY';
  return 'MONEY';
}
