import { DomainError } from '../errors/DomainError';
import { Money } from '../value-objects/Money';
import { BenefitSubtype, ResourceType } from '../value-objects/enums';

export interface Resource {
  readonly id: string;
  readonly nucleusId: string;
  readonly name: string;
  readonly type: ResourceType;
  readonly benefitSubtype: BenefitSubtype | null;
  readonly statementDueDay: number | null;
  readonly statementClosingDay: number | null;
  /** Prazo manual até a liquidez de uma aplicação, em dias. */
  readonly liquidityDays: number | null;
  /**
   * Posição inicial do recurso na data em que foi cadastrado no Fluxo.
   * IMUTÁVEL após a criação — ver ADR D-020. Qualquer correção posterior é um ADJUSTMENT.
   */
  readonly initialBalanceCents: number;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewResourceInput {
  nucleusId: string;
  name: string;
  type: ResourceType;
  benefitSubtype?: BenefitSubtype | null;
  statementDueDay?: number | null;
  statementClosingDay?: number | null;
  liquidityDays?: number | null;
  initialBalance: Money;
}

/** Valida as invariantes de criação de um recurso. Não existe função de "editar saldo inicial". */
export function validateNewResource(input: NewResourceInput): void {
  if (!input.name.trim()) {
    throw new DomainError('RESOURCE_NAME_REQUIRED', 'O recurso precisa de um nome.');
  }
  if (input.type === 'BENEFIT' && !input.benefitSubtype) {
    throw new DomainError(
      'RESOURCE_BENEFIT_SUBTYPE_REQUIRED',
      'Um recurso de benefício precisa indicar o subtipo (VR ou VA).',
    );
  }
  if (input.type === 'APPLICATION' && (!Number.isInteger(input.liquidityDays) || input.liquidityDays! < 0 || input.liquidityDays! > 36500)) {
    throw new DomainError('RESOURCE_LIQUIDITY_DAYS_REQUIRED', 'Informe o prazo de liquidez da aplicação em dias (de 0 a 36.500).');
  }
  if (input.type !== 'APPLICATION' && input.liquidityDays != null) {
    throw new DomainError('RESOURCE_LIQUIDITY_DAYS_NOT_ALLOWED', 'Somente aplicações podem ter prazo de liquidez.');
  }
  if (input.type === 'CREDIT_CARD' && (!input.statementDueDay || input.statementDueDay < 1 || input.statementDueDay > 31)) {
    throw new DomainError('RESOURCE_CARD_DUE_DAY_REQUIRED', 'Informe o dia de vencimento da fatura (1 a 31).');
  }
  if (input.type === 'CREDIT_CARD' && (!input.statementClosingDay || input.statementClosingDay < 1 || input.statementClosingDay > 31)) {
    throw new DomainError('RESOURCE_CARD_CLOSING_DAY_REQUIRED', 'Informe o dia de fechamento da fatura (1 a 31).');
  }
  if (input.type !== 'CREDIT_CARD' && input.statementDueDay != null) {
    throw new DomainError('RESOURCE_CARD_DUE_DAY_NOT_ALLOWED', 'Somente cartão de crédito pode ter vencimento de fatura.');
  }
  if (input.type !== 'CREDIT_CARD' && input.statementClosingDay != null) {
    throw new DomainError('RESOURCE_CARD_CLOSING_DAY_NOT_ALLOWED', 'Somente cartão de crédito pode ter fechamento de fatura.');
  }
  if (input.type !== 'BENEFIT' && input.benefitSubtype) {
    throw new DomainError(
      'RESOURCE_BENEFIT_SUBTYPE_NOT_ALLOWED',
      'Somente recursos de benefício podem ter subtipo VR/VA.',
    );
  }
}
