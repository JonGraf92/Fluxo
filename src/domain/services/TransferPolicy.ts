import { DomainError } from '../errors/DomainError';
import { Money, requirePositiveMagnitude } from '../value-objects/Money';
import { ResourceType, natureOf } from '../value-objects/enums';

/**
 * Transferência ≠ despesa (Regra 4 / seção 20). Este é o único lugar do domínio
 * autorizado a construir as duas pontas de uma transferência. O resultado NUNCA tem
 * category_id e o Movement resultante é sempre type=TRANSFER — nunca INCOME/EXPENSE.
 */

export interface TransferLegPlan {
  readonly resourceId: string;
  readonly amountCents: number;
}

export interface TransferInput {
  readonly fromResourceId: string;
  readonly fromResourceType: ResourceType;
  readonly toResourceId: string;
  readonly toResourceType: ResourceType;
  readonly amount: Money;
}

export interface TransferPlan {
  readonly originLeg: TransferLegPlan;
  readonly destinationLeg: TransferLegPlan;
}

/**
 * Monta as duas legs de uma transferência, já validadas. Não persiste nada — quem chama
 * (o caso de uso, dentro de um UnitOfWork) é responsável por gravar as duas legs em uma
 * única transação atômica (ADR D-012), nunca uma sem a outra.
 */
export function planTransfer(input: TransferInput): TransferPlan {
  if (input.fromResourceId === input.toResourceId) {
    throw new DomainError(
      'TRANSFER_SAME_RESOURCE',
      'Não é possível transferir de um recurso para ele mesmo.',
    );
  }

  requirePositiveMagnitude(input.amount, 'valor da transferência');

  if (input.fromResourceType === 'CREDIT_CARD' || input.toResourceType === 'CREDIT_CARD') {
    throw new DomainError('TRANSFER_CREDIT_CARD_NOT_ALLOWED', 'Faturas de cartão devem ser pagas pela ação de pagamento de fatura.');
  }

  if (natureOf(input.fromResourceType) !== natureOf(input.toResourceType)) {
    throw new DomainError(
      'TRANSFER_NATURE_MISMATCH',
      'Não é possível transferir entre dinheiro e benefício — as naturezas são incompatíveis.',
    );
  }

  const amountCents = input.amount.toCents();

  const plan: TransferPlan = {
    originLeg: { resourceId: input.fromResourceId, amountCents: -amountCents },
    destinationLeg: { resourceId: input.toResourceId, amountCents: amountCents },
  };

  // Invariante de patrimônio: a soma das duas legs de uma transferência é sempre zero.
  // Isso garante matematicamente que o patrimônio total do núcleo não se altera.
  const netEffect = plan.originLeg.amountCents + plan.destinationLeg.amountCents;
  if (netEffect !== 0) {
    // Inalcançável na prática (valores são simétricos por construção), mas é a garantia
    // formal de que uma transferência nunca distorce o patrimônio total (seção 56/58).
    throw new DomainError(
      'TRANSFER_INTEGRITY_VIOLATION',
      'Falha de integridade: as duas pontas da transferência não se cancelam.',
    );
  }

  return plan;
}
