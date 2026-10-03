import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../../src/shared/ipc-contract';
import type {
  AppStateDto,
  CancelMovementPayload,
  CategoryDto,
  CompleteOnboardingPayload,
  CloseCreditInvoicePayload,
  CreateAdjustmentPayload,
  CreateCategoryPayload,
  CreateExpensePayload,
  CreateIncomePayload,
  CreateResourcePayload,
  CreateTransferPayload,
  DashboardSummaryDto,
  ExportRunPayload,
  CreateFinancingPayload,
  FinancingPlanDto,
  PayFinancingInstallmentPayload,
  FluxoErrorDto,
  GetDashboardSummaryPayload,
  ListMovementsPayload,
  MovementDto,
  MemberDto,
  CreateMemberPayload,
  OnboardingResultDto,
  OpenCreditInvoiceDto,
  ResourceDto,
  SetResourceArchivedPayload,
  UpdateResourcePayload,
} from '../../src/shared/ipc-contract';

/** Erro tipado no lado do renderer, preservando o `code` vindo do domínio (seção 40). */
export class FluxoIpcError extends Error {
  readonly code: string;
  constructor(dto: FluxoErrorDto) {
    super(dto.message);
    this.name = 'FluxoIpcError';
    this.code = dto.code;
  }
}

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: FluxoErrorDto };

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>;
  if (!result.ok) {
    throw new FluxoIpcError(result.error);
  }
  return result.data;
}

const api = {
  app: {
    getState: () => invoke<AppStateDto>(CHANNELS.appGetState),
  },
  onboarding: {
    complete: (payload: CompleteOnboardingPayload) => invoke<OnboardingResultDto>(CHANNELS.onboardingComplete, payload),
  },
  resources: {
    create: (payload: CreateResourcePayload) => invoke<ResourceDto>(CHANNELS.resourceCreate, payload),
    list: (nucleusId: string, includeArchived = false) => invoke<ResourceDto[]>(CHANNELS.resourceList, { nucleusId, includeArchived }),
    update: (payload: UpdateResourcePayload) => invoke<{ updated: boolean }>(CHANNELS.resourceUpdate, payload),
    setArchived: (payload: SetResourceArchivedPayload) => invoke<{ archived: boolean }>(CHANNELS.resourceSetArchived, payload),
  },
  creditInvoices: {
    listOpen: (nucleusId: string) => invoke<OpenCreditInvoiceDto[]>(CHANNELS.creditInvoicesList, { nucleusId }),
    close: (payload: CloseCreditInvoicePayload) => invoke<{ closed: boolean }>(CHANNELS.creditInvoiceClose, payload),
    pay: (payload: import('../../src/shared/ipc-contract').PayCreditInvoicePayload) => invoke<{ movementId: string; wasAlreadyCreated: boolean; amountCents: number }>(CHANNELS.creditInvoicePay, payload),
  },
  financings: {
    create: (payload: CreateFinancingPayload) => invoke<{ planId: string }>(CHANNELS.financingCreate, payload),
    list: (nucleusId: string) => invoke<FinancingPlanDto[]>(CHANNELS.financingList, { nucleusId }),
    payInstallment: (payload: PayFinancingInstallmentPayload) => invoke<{ movementId: string; paidAmountCents: number }>(CHANNELS.financingPayInstallment, payload),
    cancel: (payload: import('../../src/shared/ipc-contract').CancelFinancingPayload) => invoke<{ cancelled: boolean }>(CHANNELS.financingCancel, payload),
    update: (payload: import('../../src/shared/ipc-contract').UpdateFinancingPayload) => invoke<{ updated: boolean }>(CHANNELS.financingUpdate, payload),
    delete: (payload: import('../../src/shared/ipc-contract').DeleteFinancingPayload) => invoke<{ deleted: boolean }>(CHANNELS.financingDelete, payload),
  },
  members: {
    create: (payload: CreateMemberPayload) => invoke<MemberDto>(CHANNELS.memberCreate, payload),
    list: (nucleusId: string) => invoke<MemberDto[]>(CHANNELS.memberList, { nucleusId }),
  },
  categories: {
    create: (payload: CreateCategoryPayload) => invoke<CategoryDto>(CHANNELS.categoryCreate, payload),
    list: (nucleusId: string) => invoke<CategoryDto[]>(CHANNELS.categoryList, { nucleusId }),
  },
  movements: {
    createIncome: (payload: CreateIncomePayload) =>
      invoke<{ movementId: string; wasAlreadyCreated: boolean }>(CHANNELS.movementCreateIncome, payload),
    createExpense: (payload: CreateExpensePayload) =>
      invoke<{ movementId: string; wasAlreadyCreated: boolean }>(CHANNELS.movementCreateExpense, payload),
    createTransfer: (payload: CreateTransferPayload) =>
      invoke<{ movementId: string; wasAlreadyCreated: boolean }>(CHANNELS.movementCreateTransfer, payload),
    createAdjustment: (payload: CreateAdjustmentPayload) =>
      invoke<{ movementId: string; previousBalanceCents: number; newBalanceCents: number; wasAlreadyCreated: boolean }>(
        CHANNELS.movementCreateAdjustment,
        payload,
      ),
    cancel: (payload: CancelMovementPayload) => invoke<{ cancelled: boolean }>(CHANNELS.movementCancel, payload),
    list: (payload: ListMovementsPayload) => invoke<MovementDto[]>(CHANNELS.movementList, payload),
  },
  dashboard: {
    getSummary: (payload: GetDashboardSummaryPayload) =>
      invoke<DashboardSummaryDto>(CHANNELS.dashboardGetSummary, payload),
  },
  export: {
    chooseDestination: (format: 'csv' | 'json') =>
      invoke<{ canceled: boolean; filePath: string | null }>(CHANNELS.exportChooseDestination, { format }),
    run: (payload: ExportRunPayload) => invoke<{ filePath: string }>(CHANNELS.exportRun, payload),
  },
};

export type FluxoApi = typeof api;

contextBridge.exposeInMainWorld('fluxo', api);
