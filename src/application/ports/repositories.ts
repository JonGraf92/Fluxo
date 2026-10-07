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
  /**
   * Atualiza apenas os campos EDITAVEIS de um recurso. `initial_balance_cents` NAO esta
   * aqui de proposito: o saldo inicial e gravado uma unica vez em `create` e nunca mais
   * alterado (ADR D-020). A ausencia do parametro e o que torna a violacao impossivel —
   * nao basta documentar a regra. Correcao posterior de saldo = CreateAdjustment (D-019).
   */
  updateProperties(resourceId: string, name: string, liquidityDays: number | null, statementClosingDay: number | null, updatedAt: Date): Promise<void>;
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
  /**
   * Quita a fatura de forma condicional (so de CLOSED para PAID) e devolve o numero de
   * linhas afetadas. A condicao vive no proprio UPDATE, o que elimina a janela TOCTOU entre
   * ler o status e gravar. O chamador DEVE conferir: 0 linhas = outra operacao quitou a
   * fatura primeiro, e o pagamento nao pode seguir.
   */
  markPaid(invoiceId: string, paidAt: string, paymentResourceId: string, paymentMovementId: string): Promise<number>;
}

export interface FinancingRepository {
  create(plan: FinancingPlan, installments: FinancingInstallment[]): Promise<void>;
  findPlanById(planId: string): Promise<FinancingPlan | null>;
  findInstallmentById(installmentId: string): Promise<FinancingInstallment | null>;
  listInstallments(planId: string): Promise<FinancingInstallment[]>;
  listByNucleus(nucleusId: string): Promise<FinancingPlanWithInstallments[]>;
  /**
   * Quita a parcela de forma condicional (so de PENDING para PAID) e devolve o numero de
   * linhas afetadas. O chamador DEVE conferir: 0 linhas significa que a transicao nao
   * aconteceu e a operacao precisa falhar, nunca seguir como se tivesse dado certo.
   */
  markInstallmentPaid(installmentId: string, paidAmountCents: number, paidAt: string, movementId: string, paymentResourceId: string): Promise<number>;
  setPlanStatus(planId: string, status: FinancingPlan['status']): Promise<void>;
  updateDetails(planId: string, values: Pick<FinancingPlan, 'assetType' | 'description' | 'installmentAmountCents' | 'loan'>): Promise<void>;
  // Sem `deletePlan`: a exclusao de financiamento e soft delete via setPlanStatus(id, 'DELETED').
  // Remover a operacao de DELETE fisico e o que impede o apagamento de historico ja confirmado.
}
