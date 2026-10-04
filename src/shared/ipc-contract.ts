import { z } from 'zod';

/**
 * Único lugar onde o formato da fronteira IPC é definido (seção 48: Frontend → API
 * interna/IPC → Application → Domain → Repository → SQLite). O renderer NUNCA acessa o
 * SQLite diretamente — só chama estas funções via `window.fluxo`, expostas pelo preload.
 *
 * Datas cruzam a fronteira como string ISO-8601; valores monetários como inteiro em
 * centavos (nunca float) — mesma regra do domínio, seção 31 / ADR D-004.
 */

export const CHANNELS = {
  appGetState: 'app:getState',
  memberCreate: 'member:create',
  memberList: 'member:list',
  creditInvoicesList: 'creditInvoices:list',
  creditInvoicePay: 'creditInvoices:pay',
  financingCreate: 'financing:create',
  financingList: 'financing:list',
  financingPayInstallment: 'financing:payInstallment',
  financingCancel: 'financing:cancel',
  financingUpdate: 'financing:update',
  financingDelete: 'financing:delete',
  creditInvoiceClose: 'creditInvoices:close',
  onboardingComplete: 'onboarding:complete',
  resourceCreate: 'resource:create',
  resourceList: 'resource:list',
  resourceUpdate: 'resource:update',
  resourceSetArchived: 'resource:setArchived',
  categoryCreate: 'category:create',
  categoryList: 'category:list',
  movementCreateIncome: 'movement:createIncome',
  movementCreateExpense: 'movement:createExpense',
  movementCreateTransfer: 'movement:createTransfer',
  movementCreateAdjustment: 'movement:createAdjustment',
  movementCancel: 'movement:cancel',
  movementList: 'movement:list',
  dashboardGetSummary: 'dashboard:getSummary',
  exportChooseDestination: 'export:chooseDestination',
  exportRun: 'export:run',
} as const;

// ---------- Zod schemas de entrada (validados no handler do main, seção 36) ----------

export const CompleteOnboardingSchema = z
  .object({
    personDisplayName: z.string().min(1).max(120),
    nucleusName: z.string().min(1).max(120),
    firstResourceName: z.string().min(1).max(120),
    firstResourceInitialBalanceCents: z.number().int(),
  })
  .strict();
export type CompleteOnboardingPayload = z.infer<typeof CompleteOnboardingSchema>;

export const ResourceTypeSchema = z.enum(['MONEY_ACCOUNT', 'CASH', 'APPLICATION', 'BENEFIT', 'CREDIT_CARD']);
export const BenefitSubtypeSchema = z.enum(['VR', 'VA']);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').refine((value) => {
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Informe uma data existente.');

/**
 * `ownerPersonId` NÃO existe aqui de propósito (ver ADR D-024/hardening V1.0.1): quem
 * possui o recurso é sempre a pessoa da identidade local desta instalação, derivada no
 * processo main — nunca um valor vindo do renderer. `.strict()` garante que um payload
 * com esse campo (forjado ou vestigial) seja rejeitado, não silenciosamente ignorado.
 */
export const CreateResourceSchema = z
  .object({
    nucleusId: z.string().uuid(),
    name: z.string().min(1).max(120),
    type: ResourceTypeSchema,
    benefitSubtype: BenefitSubtypeSchema.nullable().optional(),
    statementDueDay: z.number().int().min(1).max(31).nullable().optional(),
    statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
    liquidityDays: z.number().int().min(0).max(36500).nullable().optional(),
    initialBalanceCents: z.number().int(),
  })
  .strict();
export type CreateResourcePayload = z.infer<typeof CreateResourceSchema>;

export const ListByNucleusSchema = z.object({ nucleusId: z.string().uuid() }).strict();
export const ListResourcesSchema = z.object({ nucleusId: z.string().uuid(), includeArchived: z.boolean().optional() }).strict();
// `initialBalanceCents` NAO faz parte deste schema de proposito (ADR D-020): o saldo
// inicial e imutavel apos a criacao do recurso. Como o schema e `.strict()`, qualquer
// payload que ainda envie o campo e REJEITADO com INVALID_PAYLOAD — o renderer nao
// consegue reescrever saldo nem por engano nem por adulteracao. Correcao de saldo
// posterior acontece apenas via ajuste (ajustes:create).
export const UpdateResourceSchema = z.object({ nucleusId: z.string().uuid(), resourceId: z.string().uuid(), name: z.string().trim().min(1).max(120), liquidityDays: z.number().int().min(0).max(36500).nullable().optional(), statementClosingDay: z.number().int().min(1).max(31).nullable().optional() }).strict();
export type UpdateResourcePayload = z.infer<typeof UpdateResourceSchema>;
export const SetResourceArchivedSchema = z.object({ nucleusId: z.string().uuid(), resourceId: z.string().uuid(), archived: z.boolean() }).strict();
export type SetResourceArchivedPayload = z.infer<typeof SetResourceArchivedSchema>;
export const CreateMemberSchema = z.object({
  nucleusId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
}).strict();
export type CreateMemberPayload = z.infer<typeof CreateMemberSchema>;

export const ListCreditInvoicesSchema = ListByNucleusSchema;
export const CloseCreditInvoiceSchema = z.object({ nucleusId: z.string().uuid(), cardResourceId: z.string().uuid(), invoiceDueDate: IsoDateSchema }).strict();
export type CloseCreditInvoicePayload = z.infer<typeof CloseCreditInvoiceSchema>;
export const PayCreditInvoiceSchema = z.object({
  nucleusId: z.string().uuid(),
  cardResourceId: z.string().uuid(),
  invoiceDueDate: IsoDateSchema,
  paymentResourceId: z.string().uuid(),
  date: IsoDateSchema,
  clientOperationId: z.string().uuid(),
}).strict();
export type PayCreditInvoicePayload = z.infer<typeof PayCreditInvoiceSchema>;

export const FinancingAssetTypeSchema = z.enum(['HOUSE', 'APARTMENT', 'LAND', 'PROPERTY_CONSORTIUM', 'CAR', 'MOTORCYCLE', 'TRUCK', 'JET_SKI', 'VEHICLE_CONSORTIUM']);
export const CreateFinancingSchema = z.object({
  nucleusId: z.string().uuid(),
  assetType: FinancingAssetTypeSchema,
  description: z.string().trim().min(1).max(120),
  termMonths: z.number().int().min(12).max(420),
  installmentAmountCents: z.number().int().positive(),
  firstDueDate: IsoDateSchema,
  paymentResourceId: z.string().uuid(),
  responsiblePersonId: z.string().uuid(),
  currentMonthInstallmentPaid: z.boolean().optional(),
}).strict();
export type CreateFinancingPayload = z.infer<typeof CreateFinancingSchema>;
export const ListFinancingsSchema = ListByNucleusSchema;
export type ListFinancingsPayload = z.infer<typeof ListFinancingsSchema>;
export const PayFinancingInstallmentSchema = z.object({
  nucleusId: z.string().uuid(),
  installmentId: z.string().uuid(),
  paymentResourceId: z.string().uuid(),
  paymentMethod: z.enum(['DEBIT', 'PIX']),
  paidAmountCents: z.number().int().positive(),
  paidAt: IsoDateSchema,
}).strict();
export type PayFinancingInstallmentPayload = z.infer<typeof PayFinancingInstallmentSchema>;
export const CancelFinancingSchema = z.object({ nucleusId: z.string().uuid(), planId: z.string().uuid() }).strict();
export type CancelFinancingPayload = z.infer<typeof CancelFinancingSchema>;
export const UpdateFinancingSchema = z.object({
  nucleusId: z.string().uuid(), planId: z.string().uuid(), assetType: FinancingAssetTypeSchema,
  description: z.string().trim().min(1).max(120), installmentAmountCents: z.number().int().positive(),
}).strict();
export type UpdateFinancingPayload = z.infer<typeof UpdateFinancingSchema>;
export const DeleteFinancingSchema = z.object({ nucleusId: z.string().uuid(), planId: z.string().uuid() }).strict();
export type DeleteFinancingPayload = z.infer<typeof DeleteFinancingSchema>;

export const CategoryKindSchema = z.enum(['INCOME', 'EXPENSE']);
export const CreateCategorySchema = z
  .object({
    nucleusId: z.string().uuid(),
    name: z.string().min(1).max(80),
    kind: CategoryKindSchema,
  })
  .strict();
export type CreateCategoryPayload = z.infer<typeof CreateCategorySchema>;

/**
 * `createdByPersonId` NÃO faz parte destes schemas de propósito — ver ADR D-024. A
 * pessoa que registra a movimentação é sempre derivada da identidade local no processo
 * main, nunca aceita do renderer.
 */
const MovementCommonSchema = {
  nucleusId: z.string().uuid(),
  responsiblePersonId: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  date: IsoDateSchema,
  clientOperationId: z.string().uuid(),
};

export const CreateIncomeSchema = z.object({ ...MovementCommonSchema, resourceId: z.string().uuid() }).strict();
export type CreateIncomePayload = z.infer<typeof CreateIncomeSchema>;

export const PaymentMethodSchema = z.enum(['DEBIT', 'PIX', 'BENEFIT', 'CREDIT']);
export const CreateExpenseSchema = z.object({
  ...MovementCommonSchema,
  resourceId: z.string().uuid(),
  paymentMethod: PaymentMethodSchema.optional(),
  invoiceDueDate: IsoDateSchema.nullable().optional(),
}).strict();
export type CreateExpensePayload = z.infer<typeof CreateExpenseSchema>;

export const CreateTransferSchema = z
  .object({
    nucleusId: z.string().uuid(),
    fromResourceId: z.string().uuid(),
    toResourceId: z.string().uuid(),
    amountCents: z.number().int().positive(),
    description: z.string().trim().min(1).max(200),
    date: IsoDateSchema,
    clientOperationId: z.string().uuid(),
  })
  .strict();
export type CreateTransferPayload = z.infer<typeof CreateTransferSchema>;

export const CreateAdjustmentSchema = z
  .object({
    nucleusId: z.string().uuid(),
    resourceId: z.string().uuid(),
    newBalanceCents: z.number().int(),
    reason: z.string().min(1).max(300),
    date: IsoDateSchema,
    clientOperationId: z.string().uuid(),
  })
  .strict();
export type CreateAdjustmentPayload = z.infer<typeof CreateAdjustmentSchema>;

/**
 * `actorPersonId` também não existe aqui — o cancelamento é sempre atribuído à pessoa da
 * identidade local (ADR D-024), e `CancelMovement` ainda confere, na camada de aplicação,
 * que essa pessoa pertence ao núcleo da movimentação que está cancelando (ADR D-025).
 */
export const CancelMovementSchema = z
  .object({
    movementId: z.string().uuid(),
    reason: z.string().min(1).max(300),
  })
  .strict();
export type CancelMovementPayload = z.infer<typeof CancelMovementSchema>;

export const ListMovementsSchema = z
  .object({
    nucleusId: z.string().uuid(),
    resourceId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT']).optional(),
    status: z.enum(['DRAFT', 'DETECTED', 'SUGGESTED', 'CONFIRMED', 'CANCELLED', 'REVERSED']).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })
  .strict();
export type ListMovementsPayload = z.infer<typeof ListMovementsSchema>;

export const GetDashboardSummarySchema = z
  .object({
    nucleusId: z.string().uuid(),
    periodDateFrom: IsoDateSchema,
    periodDateTo: IsoDateSchema,
    recentMovementsLimit: z.number().int().positive().max(100).optional(),
  })
  .strict();
export type GetDashboardSummaryPayload = z.infer<typeof GetDashboardSummarySchema>;

// O núcleo entra aqui porque o caminho aprovado no diálogo é guardado por núcleo no
// processo main — o renderer nunca decide onde gravar (ver export.handlers.ts).
export const ExportChooseDestinationSchema = z.object({ nucleusId: z.string().uuid(), format: z.enum(['csv', 'json']) }).strict();
export const ExportRunSchema = z
  .object({
    nucleusId: z.string().uuid(),
    format: z.enum(['csv', 'json']),
    // Mantido no contrato por compatibilidade do renderer, mas IGNORADO na gravação: o
    // destino real é sempre o caminho que o usuário aprovou no diálogo do sistema.
    destinationPath: z.string().min(1),
  })
  .strict();
export type ExportRunPayload = z.infer<typeof ExportRunSchema>;

// ---------- DTOs de saída (planos, serializáveis em JSON) ----------

export interface ResourceDto {
  id: string;
  nucleusId: string;
  name: string;
  type: 'MONEY_ACCOUNT' | 'CASH' | 'APPLICATION' | 'BENEFIT' | 'CREDIT_CARD';
  benefitSubtype: 'VR' | 'VA' | null;
  statementDueDay: number | null;
  statementClosingDay: number | null;
  liquidityDays: number | null;
  initialBalanceCents: number;
  archived: boolean;
}

export interface MemberDto {
  id: string;
  displayName: string;
}

export interface OpenCreditInvoiceDto {
  cardResourceId: string;
  cardName: string;
  dueDate: string;
  amountCents: number;
  status: 'OPEN' | 'CLOSED' | 'PAID';
  paidAt: string | null;
}

export interface FinancingInstallmentDto {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountCents: number;
  paidAmountCents: number | null;
  status: 'PENDING' | 'PAID';
  paidAt: string | null;
  paymentMovementId: string | null;
  paymentResourceId: string;
}

export interface FinancingPlanDto {
  id: string;
  assetType: 'HOUSE' | 'APARTMENT' | 'LAND' | 'PROPERTY_CONSORTIUM' | 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'JET_SKI' | 'VEHICLE_CONSORTIUM';
  description: string;
  termMonths: number;
  installmentAmountCents: number;
  firstDueDate: string;
  paymentResourceId: string;
  responsiblePersonId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DELETED';
  installments: FinancingInstallmentDto[];
}

export interface CategoryDto {
  id: string;
  nucleusId: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE';
  isSystem: boolean;
}

export interface MovementLegDto {
  id: string;
  resourceId: string;
  amountCents: number;
}

export interface MovementDto {
  id: string;
  nucleusId: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  status: string;
  date: string;
  description: string;
  categoryId: string | null;
  responsiblePersonId: string;
  paymentMethod: 'DEBIT' | 'PIX' | 'BENEFIT' | 'CREDIT' | null;
  invoiceDueDate: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  legs: MovementLegDto[];
}

export interface DashboardResourceDto {
  resource: ResourceDto;
  balanceCents: number;
}

export interface DashboardSummaryDto {
  resources: DashboardResourceDto[];
  moneyTotalCents: number;
  applicationTotalCents: number;
  benefitTotalCents: number;
  creditOutstandingCents: number;
  periodIncomeCents: number;
  periodExpenseCents: number;
  recentMovements: MovementDto[];
}

export interface AppStateDto {
  isOnboarded: boolean;
  personId: string | null;
  nucleusId: string | null;
}

export interface OnboardingResultDto {
  personId: string;
  nucleusId: string;
  resourceId: string;
}

/** Erro serializado através do IPC — mantém o `code` do DomainError para a UI reagir. */
export interface FluxoErrorDto {
  code: string;
  message: string;
}
