import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateFinancingPlan, CreateFinancingPlanInput } from '../../src/application/use-cases/financing/CreateFinancingPlan';
import { PayFinancingInstallment } from '../../src/application/use-cases/financing/PayFinancingInstallment';
import { UpdateFinancingPlan } from '../../src/application/use-cases/financing/UpdateFinancingPlan';
import {
  allowedFinancingTerms,
  financingCategoryName,
  financingDueDate,
  FinancingPlan,
  LOAN_CATEGORY_NAME,
  LOAN_MAX_INTEREST_RATE_BPS,
  LOAN_MAX_TERM_MONTHS,
  loanCostSummary,
  LoanTerms,
} from '../../src/domain/entities/Financing';
import { CreateFinancingSchema } from '../../src/shared/ipc-contract';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

const ACCOUNT_BALANCE_CENTS = 1_000_000;
const LOAN: LoanTerms = { principalAmountCents: 500_000, interestRateBps: 199, interestRatePeriod: 'MONTH' };
const INSTALLMENT_CENTS = 80_000;
/** Fora das listas de prazo de veículo e de imóvel, de propósito. */
const LOAN_TERM = 7;

function futureFirstDueDate(): string {
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() + 2);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('Empréstimo como tipo de financiamento — ADR D-036', () => {
  let db: TestDb;
  let personId: string;
  let nucleusId: string;
  let accountId: string;
  let firstDueDate: string;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    personId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, personId, { initialBalanceCents: ACCOUNT_BALANCE_CENTS })).id;
    firstDueDate = futureFirstDueDate();
  });

  afterEach(() => db.close());

  function loanInput(overrides: Partial<CreateFinancingPlanInput> = {}): CreateFinancingPlanInput {
    return {
      nucleusId, assetType: 'LOAN', description: 'Empréstimo pessoal', termMonths: LOAN_TERM,
      installmentAmountCents: INSTALLMENT_CENTS, firstDueDate, paymentResourceId: accountId,
      responsiblePersonId: personId, createdByPersonId: personId, loan: LOAN, ...overrides,
    };
  }

  async function moneyTotal(): Promise<number> {
    const summary = await new GetDashboardSummary(db.repos).execute({ nucleusId, periodDateFrom: '2000-01-01', periodDateTo: '2099-12-31' });
    return summary.moneyTotalCents;
  }

  async function categoryId(name: string): Promise<string | undefined> {
    return (await db.repos.categories.listByNucleus(nucleusId)).find((item) => item.name === name && item.kind === 'EXPENSE')?.id;
  }

  it('aceita qualquer quantidade de parcelas de 1 ao teto e usa a categoria própria', () => {
    expect(allowedFinancingTerms('LOAN')).toHaveLength(LOAN_MAX_TERM_MONTHS);
    expect(allowedFinancingTerms('LOAN')[0]).toBe(1);
    expect(allowedFinancingTerms('LOAN')).toContain(LOAN_TERM);
    expect(allowedFinancingTerms('LOAN')).toContain(LOAN_MAX_TERM_MONTHS);
    expect(financingCategoryName('LOAN')).toBe(LOAN_CATEGORY_NAME);
    expect(financingCategoryName('CAR')).toBe('Financiamentos');
  });

  it('cadastra o empréstimo com as condições, gera as parcelas e não altera nenhum saldo', async () => {
    const { planId } = await new CreateFinancingPlan(db.uow).execute(loanInput());

    const plan = await db.repos.financings.findPlanById(planId);
    expect(plan?.assetType).toBe('LOAN');
    expect(plan?.loan).toEqual(LOAN);
    expect(plan?.categoryId).toBe(await categoryId(LOAN_CATEGORY_NAME));

    const installments = await db.repos.financings.listInstallments(planId);
    expect(installments).toHaveLength(LOAN_TERM);
    expect(installments.every((item) => item.status === 'PENDING' && item.amountCents === INSTALLMENT_CENTS)).toBe(true);
    expect(installments[LOAN_TERM - 1]?.dueDate).toBe(financingDueDate(firstDueDate, LOAN_TERM));

    // O valor emprestado é registro: não vira entrada, não vira movimento.
    expect(await db.repos.movements.list({ nucleusId })).toEqual([]);
    expect(await moneyTotal()).toBe(ACCOUNT_BALANCE_CENTS);
  });

  it('a baixa da parcela lança saída na categoria Empréstimos e só ela mexe no saldo', async () => {
    const { planId } = await new CreateFinancingPlan(db.uow).execute(loanInput());
    const [first] = await db.repos.financings.listInstallments(planId);

    await new PayFinancingInstallment(db.uow).execute({
      nucleusId, installmentId: first!.id, paymentResourceId: accountId, paymentMethod: 'PIX',
      paidAmountCents: INSTALLMENT_CENTS, paidAt: firstDueDate, actorPersonId: personId,
    });

    const movements = await db.repos.movements.list({ nucleusId });
    expect(movements.map((movement) => movement.type)).toEqual(['EXPENSE']);
    expect(movements[0]?.categoryId).toBe(await categoryId(LOAN_CATEGORY_NAME));
    expect(movements[0]?.categoryId).not.toBe(await categoryId('Financiamentos'));
    expect(await moneyTotal()).toBe(ACCOUNT_BALANCE_CENTS - INSTALLMENT_CENTS);
  });

  it('resumo do custo vem da parcela e da quantidade, não da taxa', () => {
    expect(loanCostSummary({ principalAmountCents: LOAN.principalAmountCents, installmentAmountCents: INSTALLMENT_CENTS, termMonths: LOAN_TERM, firstDueDate: '2026-01-31' })).toEqual({
      totalPayableCents: INSTALLMENT_CENTS * LOAN_TERM,
      costCents: INSTALLMENT_CENTS * LOAN_TERM - LOAN.principalAmountCents,
      lastDueDate: '2026-07-31',
    });
    expect(loanCostSummary({ principalAmountCents: 100_000, installmentAmountCents: 33_333, termMonths: 3, firstDueDate: '2026-01-31' }).lastDueDate).toBe('2026-03-31');
  });

  describe('falha fechado', () => {
    const invalidLoans: Array<[string, unknown, string]> = [
      ['sem condições', undefined, 'LOAN_TERMS_REQUIRED'],
      ['condições nulas', null, 'LOAN_TERMS_REQUIRED'],
      ['valor emprestado zero', { ...LOAN, principalAmountCents: 0 }, 'LOAN_PRINCIPAL_INVALID'],
      ['valor emprestado negativo', { ...LOAN, principalAmountCents: -1 }, 'LOAN_PRINCIPAL_INVALID'],
      ['valor emprestado fracionário', { ...LOAN, principalAmountCents: 1000.5 }, 'LOAN_PRINCIPAL_INVALID'],
      ['taxa negativa', { ...LOAN, interestRateBps: -1 }, 'LOAN_INTEREST_RATE_INVALID'],
      ['taxa fracionária', { ...LOAN, interestRateBps: 1.5 }, 'LOAN_INTEREST_RATE_INVALID'],
      ['taxa acima do teto', { ...LOAN, interestRateBps: LOAN_MAX_INTEREST_RATE_BPS + 1 }, 'LOAN_INTEREST_RATE_INVALID'],
      ['período desconhecido', { ...LOAN, interestRatePeriod: 'DAY' }, 'LOAN_INTEREST_PERIOD_INVALID'],
    ];

    for (const [label, loan, code] of invalidLoans) {
      it(`recusa empréstimo com ${label}`, async () => {
        await expect(new CreateFinancingPlan(db.uow).execute(loanInput({ loan: loan as LoanTerms | null | undefined }))).rejects.toMatchObject({ code });
        expect(await db.repos.financings.listByNucleus(nucleusId)).toEqual([]);
      });
    }

    it('aceita taxa zero e taxa no teto', async () => {
      await new CreateFinancingPlan(db.uow).execute(loanInput({ description: 'Sem juros', loan: { ...LOAN, interestRateBps: 0 } }));
      await new CreateFinancingPlan(db.uow).execute(loanInput({ description: 'No teto', loan: { ...LOAN, interestRateBps: LOAN_MAX_INTEREST_RATE_BPS, interestRatePeriod: 'YEAR' } }));
      const plans = await db.repos.financings.listByNucleus(nucleusId);
      expect(plans.map((item) => item.plan.loan?.interestRateBps).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, LOAN_MAX_INTEREST_RATE_BPS]);
    });

    it('recusa quantidade de parcelas fora de 1 ao teto', async () => {
      for (const termMonths of [0, -1, 1.5, LOAN_MAX_TERM_MONTHS + 1]) {
        await expect(new CreateFinancingPlan(db.uow).execute(loanInput({ termMonths }))).rejects.toMatchObject({ code: 'FINANCING_TERM_NOT_ALLOWED' });
      }
      await new CreateFinancingPlan(db.uow).execute(loanInput({ termMonths: 1 }));
    });

    it('financiamento continua preso à lista de prazos e não aceita condições de empréstimo', async () => {
      const car = loanInput({ assetType: 'CAR', termMonths: 12, loan: undefined });
      await expect(new CreateFinancingPlan(db.uow).execute({ ...car, termMonths: LOAN_TERM })).rejects.toMatchObject({ code: 'FINANCING_TERM_NOT_ALLOWED' });
      await expect(new CreateFinancingPlan(db.uow).execute({ ...car, loan: LOAN })).rejects.toMatchObject({ code: 'LOAN_TERMS_NOT_ALLOWED' });

      const { planId } = await new CreateFinancingPlan(db.uow).execute(car);
      const plan = await db.repos.financings.findPlanById(planId);
      expect(plan?.loan).toBeNull();
      expect(plan?.categoryId).toBe(await categoryId('Financiamentos'));
    });

    it('a fronteira de persistência recusa empréstimo sem condições mesmo sem passar pelo caso de uso', async () => {
      const { planId } = await new CreateFinancingPlan(db.uow).execute(loanInput());
      const valid = (await db.repos.financings.findPlanById(planId)) as FinancingPlan;

      await expect(db.repos.financings.create({ ...valid, id: 'plano-sem-condicoes', loan: null }, [])).rejects.toMatchObject({ code: 'LOAN_TERMS_REQUIRED' });
      await expect(db.repos.financings.create({ ...valid, id: 'carro-com-condicoes', assetType: 'CAR' }, [])).rejects.toMatchObject({ code: 'LOAN_TERMS_NOT_ALLOWED' });
      await expect(db.repos.financings.updateDetails(planId, { assetType: 'LOAN', description: 'x', installmentAmountCents: 1, loan: null })).rejects.toMatchObject({ code: 'LOAN_TERMS_REQUIRED' });
      expect((await db.repos.financings.findPlanById(planId))?.loan).toEqual(LOAN);
    });

    it('linha de empréstimo gravada sem condições não é lida como plano válido', async () => {
      const { planId } = await new CreateFinancingPlan(db.uow).execute(loanInput());
      db.raw.prepare('UPDATE financing_plans SET interest_rate_bps = NULL WHERE id = ?').run(planId);

      await expect(db.repos.financings.findPlanById(planId)).rejects.toMatchObject({ code: 'LOAN_TERMS_REQUIRED' });
    });
  });

  describe('edição', () => {
    it('atualiza valor emprestado, taxa e parcela das previsões futuras', async () => {
      const { planId } = await new CreateFinancingPlan(db.uow).execute(loanInput());
      const updated: LoanTerms = { principalAmountCents: 550_000, interestRateBps: 2400, interestRatePeriod: 'YEAR' };

      await new UpdateFinancingPlan(db.uow).execute({ nucleusId, planId, assetType: 'LOAN', description: '  Empréstimo renegociado  ', installmentAmountCents: 85_000, loan: updated, actorPersonId: personId });

      const plan = await db.repos.financings.findPlanById(planId);
      expect(plan?.loan).toEqual(updated);
      expect(plan?.description).toBe('Empréstimo renegociado');
      expect((await db.repos.financings.listInstallments(planId)).every((item) => item.amountCents === 85_000)).toBe(true);
    });

    it('não transforma empréstimo em financiamento nem o contrário', async () => {
      const loan = await new CreateFinancingPlan(db.uow).execute(loanInput());
      const car = await new CreateFinancingPlan(db.uow).execute(loanInput({ assetType: 'CAR', termMonths: 12, loan: undefined, description: 'Carro' }));
      const update = new UpdateFinancingPlan(db.uow);

      await expect(update.execute({ nucleusId, planId: loan.planId, assetType: 'CAR', description: 'x', installmentAmountCents: INSTALLMENT_CENTS, actorPersonId: personId })).rejects.toMatchObject({ code: 'FINANCING_TYPE_CHANGE_NOT_ALLOWED' });
      await expect(update.execute({ nucleusId, planId: car.planId, assetType: 'LOAN', description: 'x', installmentAmountCents: INSTALLMENT_CENTS, loan: LOAN, actorPersonId: personId })).rejects.toMatchObject({ code: 'FINANCING_TYPE_CHANGE_NOT_ALLOWED' });

      expect((await db.repos.financings.findPlanById(loan.planId))?.assetType).toBe('LOAN');
      expect((await db.repos.financings.findPlanById(car.planId))?.assetType).toBe('CAR');
    });

    it('recusa edição de empréstimo sem condições e de financiamento com condições', async () => {
      const loan = await new CreateFinancingPlan(db.uow).execute(loanInput());
      const car = await new CreateFinancingPlan(db.uow).execute(loanInput({ assetType: 'CAR', termMonths: 12, loan: undefined, description: 'Carro' }));
      const update = new UpdateFinancingPlan(db.uow);

      await expect(update.execute({ nucleusId, planId: loan.planId, assetType: 'LOAN', description: 'x', installmentAmountCents: INSTALLMENT_CENTS, actorPersonId: personId })).rejects.toMatchObject({ code: 'LOAN_TERMS_REQUIRED' });
      await expect(update.execute({ nucleusId, planId: car.planId, assetType: 'MOTORCYCLE', description: 'x', installmentAmountCents: INSTALLMENT_CENTS, loan: LOAN, actorPersonId: personId })).rejects.toMatchObject({ code: 'LOAN_TERMS_NOT_ALLOWED' });
      expect((await db.repos.financings.findPlanById(loan.planId))?.description).toBe('Empréstimo pessoal');
    });
  });

  describe('contrato IPC', () => {
    const base = {
      nucleusId: '11111111-1111-4111-8111-111111111111', assetType: 'LOAN', description: 'Empréstimo', termMonths: LOAN_TERM,
      installmentAmountCents: INSTALLMENT_CENTS, firstDueDate: '2026-11-15',
      paymentResourceId: '22222222-2222-4222-8222-222222222222', responsiblePersonId: '33333333-3333-4333-8333-333333333333',
    };

    it('aceita empréstimo com condições inteiras', () => {
      expect(CreateFinancingSchema.safeParse({ ...base, loan: LOAN }).success).toBe(true);
    });

    it('recusa valores não inteiros, taxa fora da faixa e campo extra nas condições', () => {
      expect(CreateFinancingSchema.safeParse({ ...base, loan: { ...LOAN, principalAmountCents: 10.5 } }).success).toBe(false);
      expect(CreateFinancingSchema.safeParse({ ...base, loan: { ...LOAN, interestRateBps: 1.99 } }).success).toBe(false);
      expect(CreateFinancingSchema.safeParse({ ...base, loan: { ...LOAN, interestRateBps: LOAN_MAX_INTEREST_RATE_BPS + 1 } }).success).toBe(false);
      expect(CreateFinancingSchema.safeParse({ ...base, loan: { ...LOAN, interestRatePeriod: 'DAY' } }).success).toBe(false);
      expect(CreateFinancingSchema.safeParse({ ...base, loan: { ...LOAN, creditedResourceId: 'x' } }).success).toBe(false);
      expect(CreateFinancingSchema.safeParse({ ...base, termMonths: 0 }).success).toBe(false);
    });
  });
});
