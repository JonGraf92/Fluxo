import { Selectable } from 'kysely';
import { Adjustment } from '../../domain/entities/Adjustment';
import { AuditLog } from '../../domain/entities/AuditLog';
import { Category } from '../../domain/entities/Category';
import { FinancialNucleus } from '../../domain/entities/FinancialNucleus';
import { LocalIdentity } from '../../domain/entities/LocalIdentity';
import { Membership } from '../../domain/entities/Membership';
import { Movement } from '../../domain/entities/Movement';
import { MovementLeg } from '../../domain/entities/MovementLeg';
import { Person } from '../../domain/entities/Person';
import { Resource } from '../../domain/entities/Resource';
import { ResourceOwnership } from '../../domain/entities/ResourceOwnership';
import {
  BenefitSubtype,
  CategoryKind,
  MembershipRole,
  MovementStatus,
  MovementType,
  NucleusType,
  OwnershipType,
  ResourceType,
} from '../../domain/value-objects/enums';
import {
  AdjustmentsTable,
  AuditLogsTable,
  CategoriesTable,
  FinancialNucleiTable,
  LocalIdentityTable,
  MembershipsTable,
  MovementLegsTable,
  MovementsTable,
  PersonsTable,
  ResourceOwnershipTable,
  ResourcesTable,
} from '../db/types';

export const toIso = (date: Date): string => date.toISOString();
export const fromIso = (value: string): Date => new Date(value);
export const toBool = (value: number): boolean => value === 1;
export const toDbBool = (value: boolean): number => (value ? 1 : 0);

export function mapPerson(row: PersonsTable): Person {
  return { id: row.id, displayName: row.display_name, createdAt: fromIso(row.created_at) };
}

export function mapLocalIdentity(row: LocalIdentityTable): LocalIdentity {
  return { id: row.id, personId: row.person_id, installedAt: fromIso(row.installed_at) };
}

export function mapNucleus(row: FinancialNucleiTable): FinancialNucleus {
  return {
    id: row.id,
    name: row.name,
    type: row.type as NucleusType,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export function mapMembership(row: MembershipsTable): Membership {
  return {
    id: row.id,
    personId: row.person_id,
    nucleusId: row.nucleus_id,
    role: row.role as MembershipRole,
    createdAt: fromIso(row.created_at),
  };
}

export function mapResource(row: Selectable<ResourcesTable>): Resource {
  return {
    id: row.id,
    nucleusId: row.nucleus_id,
    name: row.name,
    type: row.type as ResourceType,
    benefitSubtype: (row.benefit_subtype as BenefitSubtype | null) ?? null,
    statementDueDay: row.statement_due_day ?? null,
    statementClosingDay: row.statement_closing_day ?? null,
    liquidityDays: row.liquidity_days ?? null,
    initialBalanceCents: row.initial_balance_cents,
    archived: toBool(Number(row.archived)),
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export function mapResourceOwnership(row: ResourceOwnershipTable): ResourceOwnership {
  return {
    id: row.id,
    resourceId: row.resource_id,
    personId: row.person_id,
    ownershipType: row.ownership_type as OwnershipType,
    createdAt: fromIso(row.created_at),
  };
}

export function mapCategory(row: Selectable<CategoriesTable>): Category {
  return {
    id: row.id,
    nucleusId: row.nucleus_id,
    name: row.name,
    kind: row.kind as CategoryKind,
    isSystem: toBool(Number(row.is_system)),
    createdAt: fromIso(row.created_at),
  };
}

export function mapMovement(row: MovementsTable): Movement {
  return {
    id: row.id,
    nucleusId: row.nucleus_id,
    type: row.type as MovementType,
    status: row.status as MovementStatus,
    date: row.date,
    description: row.description,
    categoryId: row.category_id,
    createdByPersonId: row.created_by_person_id,
    responsiblePersonId: row.responsible_person_id ?? row.created_by_person_id,
    paymentMethod: (row.payment_method as import('../../domain/value-objects/enums').PaymentMethod | null) ?? null,
    invoiceDueDate: row.invoice_due_date ?? null,
    cardInvoiceResourceId: row.card_invoice_resource_id ?? null,
    clientOperationId: row.client_operation_id,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
    cancelledAt: row.cancelled_at ? fromIso(row.cancelled_at) : null,
    cancelledReason: row.cancelled_reason,
  };
}

export function mapMovementLeg(row: MovementLegsTable): MovementLeg {
  return {
    id: row.id,
    movementId: row.movement_id,
    resourceId: row.resource_id,
    amountCents: row.amount_cents,
    sequence: row.sequence,
  };
}

export function mapAdjustment(row: AdjustmentsTable): Adjustment {
  return {
    id: row.id,
    movementId: row.movement_id,
    resourceId: row.resource_id,
    reason: row.reason,
    createdByPersonId: row.created_by_person_id,
    createdAt: fromIso(row.created_at),
  };
}

export function mapAuditLog(row: AuditLogsTable): AuditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorPersonId: row.actor_person_id,
    nucleusId: row.nucleus_id,
    occurredAt: fromIso(row.occurred_at),
    beforeJson: row.before_json,
    afterJson: row.after_json,
  };
}
