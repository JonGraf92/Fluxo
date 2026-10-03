import { MovementStatus, MovementType, PaymentMethod } from '../value-objects/enums';

/**
 * Movement nunca guarda um valor monetário próprio — o efeito financeiro vive
 * inteiramente em MovementLeg (ver ADR D-018). Movement guarda o "o quê" e "quando";
 * MovementLeg guarda "quanto" e "em qual recurso".
 */
export interface Movement {
  readonly id: string;
  readonly nucleusId: string;
  readonly type: MovementType;
  readonly status: MovementStatus;
  readonly date: string; // YYYY-MM-DD — data financeira do movimento (seção 32)
  readonly description: string;
  readonly categoryId: string | null;
  readonly createdByPersonId: string;
  /** Pessoa a quem o lançamento é atribuído, diferente de quem o digitou. */
  readonly responsiblePersonId: string;
  readonly paymentMethod: PaymentMethod | null;
  readonly invoiceDueDate: string | null;
  readonly clientOperationId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly cancelledAt: Date | null;
  readonly cancelledReason: string | null;
}
