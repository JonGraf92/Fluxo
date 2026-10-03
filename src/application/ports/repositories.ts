import { Adjustment } from '../../domain/entities/Adjustment';
import { AuditLog } from '../../domain/entities/AuditLog';
import { Category } from '../../domain/entities/Category';
import { FinancialNucleus } from '../../domain/entities/FinancialNucleus';
import { FinancingInstallment, FinancingPlan, FinancingPlanWithInstallments } from '../../domain/entities/Financing';
import { LocalIdentity } from '../../domain/entities/LocalIdentity';
import { Membership } from '../../domain/entities/Membership';
import { Movement } from '../../domain/entities/Movement';
import { MovementLeg } from '../../domain/entities/MovementLeg';
import { Person } from '../../domain/entities/Person';
import { Resource } from '../../domain/entities/Resource';
import { ResourceOwnership } from '../../domain/entities/ResourceOwnership';
import { MovementStatus } from '../../domain/value-objects/enums';
import { LegForBalance } from '../../domain/services/BalanceCalculator';

export interface PersonRepository {
  create(person: Person): Promise<void>;
  findById(id: string): Promise<Person | null>;
  listByNucleus(nucleusId: string): Promise<Person[]>;
}

export interface LocalIdentityRepository {
  get(): Promise<LocalIdentity | null>;
  create(identity: LocalIdentity): Promise<void>;
}

export interface NucleusRepository {
  create(nucleus: FinancialNucleus): Promise<void>;
  findById(id: string): Promise<FinancialNucleus | null>;
  listAll(): Promise<FinancialNucleus[]>;
}

export interface MembershipRepository {
  create(membership: Membership): Promise<void>;
  findOwner(nucleusId: string): Promise<Membership | null>;
  findByPersonAndNucleus(personId: string, nucleusId: string): Promise<Membership | null>;
  listByNucleus(nucleusId: string): Promise<Membership[]>;
}

export interface ResourceRepository {
  create(resource: Resource): Promise<void>;
  findById(id: string): Promise<Resource | null>;
  listByNucleus(nucleusId: string, options?: { includeArchived?: boolean }): Promise<Resource[]>;
  updateNameAndArchived(resourceId: string, name: string, archived: boolean, updatedAt: Date): Promise<void>;
  updateProperties(resourceId: string, name: string, initialBalanceCents: number, liquidityDays: number | null, statementClosingDay: number | null, updatedAt: Date): Promise<void>;
}

export interface ResourceOwnershipRepository {
  create(ownership: ResourceOwnership): Promise<void>;
  listByResource(resourceId: string): Promise<ResourceOwnership[]>;
}

export interface CategoryRepository {
  create(category: Category): Promise<void>;
  createMany(categories: Category[]): Promise<void>;
  listByNucleus(nucleusId: string): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
}

export interface MovementFilter {
  nucleusId: string;
  resourceId?: string;
  personId?: string;
  categoryId?: string;
  type?: Movement['type'];
  status?: MovementStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface MovementRepository {
  createWithLegs(movement: Movement, legs: MovementLeg[]): Promise<void>;
  findByClientOperationId(nucleusId: string, clientOperationId: string): Promise<Movement | null>;
  findById(id: string): Promise<Movement | null>;
  list(filter: MovementFilter): Promise<Movement[]>;
  listLegsByMovementIds(movementIds: string[]): Promise<MovementLeg[]>;
  listLegsByNucleus(nucleusId: string): Promise<MovementLeg[]>;
  /** Recorte direto para BalanceCalculator: leg + status do movimento, sem mapear entidade completa. */
  listLegsForBalance(nucleusId: string): Promise<LegForBalance[]>;
  updateStatus(
    movementId: string,
    status: MovementStatus,
    cancelledAt: Date | null,
    cancelledReason: string | null,
  ): Promise<void>;
  createAdjustmentRecord(adjustment: Adjustment): Promise<void>;
  /** Exportação (seção 38/39) precisa do histórico real de ajustes, não uma lista vazia. */
  listAdjustmentsByNucleus(nucleusId: string): Promise<Adjustment[]>;
}

export interface AuditLogRepository {
  record(entry: AuditLog): Promise<void>;
  listByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
}


export interface CreditInvoiceRecord {
  id: string;
  nucleusId: string;
  cardResourceId: string;
  dueDate: string;
  status: 'OPEN' | 'CLOSED' | 'PAID';
  closedAt: string | null;
  paidAt: string | null;
  paymentResourceId: string | null;
  paymentMovementId: string | null;
}

export interface CreditInvoiceRepository {
  findByCardAndDueDate(cardResourceId: string, dueDate: string): Promise<CreditInvoiceRecord | null>;
  listByNucleus(nucleusId: string): Promise<CreditInvoiceRecord[]>;
  create(record: CreditInvoiceRecord): Promise<void>;
  update(record: CreditInvoiceRecord): Promise<void>;
}

export interface FinancingRepository {
  create(plan: FinancingPlan, installments: FinancingInstallment[]): Promise<void>;
  findPlanById(planId: string): Promise<FinancingPlan | null>;
  findInstallmentById(installmentId: string): Promise<FinancingInstallment | null>;
  listInstallments(planId: string): Promise<FinancingInstallment[]>;
  listByNucleus(nucleusId: string): Promise<FinancingPlanWithInstallments[]>;
  markInstallmentPaid(installmentId: string, paidAmountCents: number, paidAt: string, movementId: string, paymentResourceId: string): Promise<void>;
  setPlanStatus(planId: string, status: FinancingPlan['status']): Promise<void>;
  updateDetails(planId: string, values: Pick<FinancingPlan, 'assetType' | 'description' | 'installmentAmountCents'>): Promise<void>;
  deletePlan(planId: string): Promise<void>;
}
