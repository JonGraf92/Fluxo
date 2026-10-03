import { ColumnType, Generated } from 'kysely';

// Kysely trabalha com os tipos "crus" das colunas SQLite: TEXT, INTEGER (0/1 para bool).
// Datas são armazenadas como TEXT ISO-8601 (SQLite não tem tipo DATE nativo).

export interface PersonsTable {
  id: string;
  display_name: string;
  created_at: string;
}

export interface LocalIdentityTable {
  id: string;
  person_id: string;
  installed_at: string;
}

export interface FinancialNucleiTable {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipsTable {
  id: string;
  person_id: string;
  nucleus_id: string;
  role: string;
  created_at: string;
}

export interface ResourcesTable {
  id: string;
  nucleus_id: string;
  name: string;
  type: string;
  benefit_subtype: string | null;
  statement_due_day: number | null;
  statement_closing_day: number | null;
  liquidity_days: number | null;
  initial_balance_cents: number;
  archived: ColumnType<number, number | boolean, number | boolean>;
  created_at: string;
  updated_at: string;
}

export interface ResourceOwnershipTable {
  id: string;
  resource_id: string;
  person_id: string;
  ownership_type: string;
  created_at: string;
}

export interface CategoriesTable {
  id: string;
  nucleus_id: string;
  name: string;
  kind: string;
  is_system: ColumnType<number, number | boolean, number | boolean>;
  created_at: string;
}

export interface MovementsTable {
  id: string;
  nucleus_id: string;
  type: string;
  status: string;
  date: string;
  description: string;
  category_id: string | null;
  created_by_person_id: string;
  client_operation_id: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  responsible_person_id: string | null;
  payment_method: string | null;
  invoice_due_date: string | null;
}

export interface MovementLegsTable {
  id: string;
  movement_id: string;
  resource_id: string;
  amount_cents: number;
  sequence: number;
}

export interface AdjustmentsTable {
  id: string;
  movement_id: string;
  resource_id: string;
  reason: string;
  created_by_person_id: string;
  created_at: string;
}

export interface AuditLogsTable {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_person_id: string | null;
  nucleus_id: string | null;
  occurred_at: string;
  before_json: string | null;
  after_json: string | null;
}

export interface SchemaMigrationsTable {
  id: Generated<number>;
  name: string;
  applied_at: string;
}

export interface CreditInvoicesTable {
  id: string;
  nucleus_id: string;
  card_resource_id: string;
  due_date: string;
  status: string;
  closed_at: string | null;
  paid_at: string | null;
  payment_resource_id: string | null;
  payment_movement_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancingPlansTable {
  id: string;
  nucleus_id: string;
  category_id: string;
  asset_type: string;
  description: string;
  term_months: number;
  installment_amount_cents: number;
  first_due_date: string;
  payment_resource_id: string;
  responsible_person_id: string;
  created_by_person_id: string;
  status: string;
  created_at: string;
}

export interface FinancingInstallmentsTable {
  id: string;
  plan_id: string;
  installment_number: number;
  due_date: string;
  amount_cents: number;
  paid_amount_cents: number | null;
  status: string;
  paid_at: string | null;
  payment_movement_id: string | null;
  payment_resource_id: string;
}

export interface Database {
  persons: PersonsTable;
  local_identity: LocalIdentityTable;
  financial_nuclei: FinancialNucleiTable;
  memberships: MembershipsTable;
  resources: ResourcesTable;
  resource_ownership: ResourceOwnershipTable;
  categories: CategoriesTable;
  movements: MovementsTable;
  movement_legs: MovementLegsTable;
  adjustments: AdjustmentsTable;
  audit_logs: AuditLogsTable;
  schema_migrations: SchemaMigrationsTable;
  credit_invoices: CreditInvoicesTable;
  financing_plans: FinancingPlansTable;
  financing_installments: FinancingInstallmentsTable;
}
