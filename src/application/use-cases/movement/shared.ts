import { v4 as uuid } from 'uuid';
import { AuditLog } from '../../../domain/entities/AuditLog';
import { Movement } from '../../../domain/entities/Movement';
import { MovementLeg } from '../../../domain/entities/MovementLeg';
import { MovementStatus, MovementType, PaymentMethod } from '../../../domain/value-objects/enums';

export function newId(): string {
  return uuid();
}

export interface BuildMovementInput {
  nucleusId: string;
  type: MovementType;
  status: MovementStatus;
  date: string;
  description: string;
  categoryId: string | null;
  createdByPersonId: string;
  responsiblePersonId?: string;
  paymentMethod?: PaymentMethod | null;
  invoiceDueDate?: string | null;
  /** Preenchido apenas em pagamento de fatura; e a identificacao estrutural do cartao. */
  cardInvoiceResourceId?: string | null;
  clientOperationId: string;
}

/**
 * Constrói o Movement em memória. Regra de confirmação (seção 16): um lançamento
 * manual salvo pelo usuário já nasce CONFIRMED na V1 — não existe rascunho persistido.
 */
export function buildMovement(input: BuildMovementInput): Movement {
  const now = new Date();
  return {
    id: newId(),
    nucleusId: input.nucleusId,
    type: input.type,
    status: input.status,
    date: input.date,
    description: input.description,
    categoryId: input.categoryId,
    createdByPersonId: input.createdByPersonId,
    responsiblePersonId: input.responsiblePersonId ?? input.createdByPersonId,
    paymentMethod: input.paymentMethod ?? null,
    invoiceDueDate: input.invoiceDueDate ?? null,
    cardInvoiceResourceId: input.cardInvoiceResourceId ?? null,
    clientOperationId: input.clientOperationId,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    cancelledReason: null,
  };
}

export function buildLegs(
  movementId: string,
  plans: readonly { resourceId: string; amountCents: number }[],
): MovementLeg[] {
  return plans.map((plan, index) => ({
    id: newId(),
    movementId,
    resourceId: plan.resourceId,
    amountCents: plan.amountCents,
    sequence: index,
  }));
}

export function buildAuditLog(params: {
  entityType: string;
  entityId: string;
  action: string;
  actorPersonId: string | null;
  nucleusId: string | null;
  before?: unknown;
  after?: unknown;
}): AuditLog {
  return {
    id: newId(),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    actorPersonId: params.actorPersonId,
    nucleusId: params.nucleusId,
    occurredAt: new Date(),
    beforeJson: params.before !== undefined ? JSON.stringify(params.before) : null,
    afterJson: params.after !== undefined ? JSON.stringify(params.after) : null,
  };
}
