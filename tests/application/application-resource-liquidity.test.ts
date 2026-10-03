import { afterEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateAdjustment } from '../../src/application/use-cases/movement/CreateAdjustment';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateTransfer } from '../../src/application/use-cases/movement/CreateTransfer';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { UpdateResource } from '../../src/application/use-cases/resource/UpdateResource';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

const date = '2026-09-27';

describe('Aplicações — prazo de liquidez e movimentações específicas', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('exige um prazo inteiro de liquidez, persiste-o e permite corrigi-lo', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const create = (liquidityDays?: number) => new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'CDB de teste',
      type: 'APPLICATION',
      liquidityDays,
      initialBalanceCents: 250000,
      ownerPersonId: person.id,
    });

    await expect(create()).rejects.toMatchObject({ code: 'RESOURCE_LIQUIDITY_DAYS_REQUIRED' });
    await expect(create(-1)).rejects.toMatchObject({ code: 'RESOURCE_LIQUIDITY_DAYS_REQUIRED' });
    await expect(create(1.5)).rejects.toMatchObject({ code: 'RESOURCE_LIQUIDITY_DAYS_REQUIRED' });

    const { resource } = await create(0);
    expect((await db.repos.resources.findById(resource.id))?.liquidityDays).toBe(0);

    await new UpdateResource(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: resource.id,
      name: resource.name,
      liquidityDays: 30,
      actorPersonId: person.id,
    });
    expect((await db.repos.resources.findById(resource.id))?.liquidityDays).toBe(30);

    // ADR D-020: o prazo de liquidez e editavel, o SALDO INICIAL nao. Este teste afirmava
    // o contrario (250000 -> 275000) e por isso "protegia" a violacao: qualquer correcao
    // no codigo aparecia como regressao. O saldo tem de permanecer intacto.
    expect((await db.repos.resources.findById(resource.id))?.initialBalanceCents).toBe(250000);

    // E a auditoria do UPDATE nao deve mais carregar initialBalanceCents — o campo nao e
    // mutavel, entao nao faz sentido registra-lo como se tivesse mudado.
    const audit = db.raw.prepare("SELECT before_json, after_json FROM audit_logs WHERE entity_type = 'Resource' AND entity_id = ? ORDER BY occurred_at DESC LIMIT 1").get(resource.id) as { before_json: string; after_json: string };
    expect(JSON.parse(audit.before_json).initialBalanceCents).toBeUndefined();
    expect(JSON.parse(audit.after_json).initialBalanceCents).toBeUndefined();

    const columns = db.raw.prepare('PRAGMA table_info(resources)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain('liquidity_days');
  });

  it('recusa qualquer tentativa de alterar o saldo inicial de um recurso ja criado (ADR D-020)', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const { resource } = await new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'Conta com saldo travado',
      type: 'MONEY_ACCOUNT',
      initialBalanceCents: 100000,
      ownerPersonId: person.id,
    });

    // O parametro nao existe mais na assinatura do caso de uso; um chamador JavaScript
    // (ou um payload adulterado) que ainda o envie e simplesmente ignorado, e o valor
    // no banco permanece o original.
    await new UpdateResource(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: resource.id,
      name: 'Conta renomeada',
      liquidityDays: null,
      statementClosingDay: null,
      actorPersonId: person.id,
      // @ts-expect-error — campo removido de proposito; garante que nao volte a ser aceito
      initialBalanceCents: 999999999,
    });

    const after = await db.repos.resources.findById(resource.id);
    expect(after?.name).toBe('Conta renomeada');
    expect(after?.initialBalanceCents).toBe(100000);

    // Correcao legitima de saldo passa por AJUSTE e deixa rastro visivel no historico.
    await new CreateAdjustment(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: resource.id,
      newBalanceCents: 130000,
      reason: 'Correcao de saldo apos conferencia de extrato',
      date,
      createdByPersonId: person.id,
      clientOperationId: 'ajuste-saldo-inicial',
    });

    const legs = await db.repos.movements.listLegsForBalance(nucleus.id);
    const balance = calculateResourceBalance(resource.id, after!.initialBalanceCents, legs);
    expect(balance.toCents()).toBe(130000);
    expect(after!.initialBalanceCents).toBe(100000);
  });

  it('aceita todas as categorias de entrada e mantém o saldo das aplicações separado do dinheiro disponível', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });
    const { resource: application } = await new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'Tesouro de teste',
      type: 'APPLICATION',
      liquidityDays: 90,
      initialBalanceCents: 500000,
      ownerPersonId: person.id,
    });
    const incomeCategories = categories.filter((category) => category.kind === 'INCOME');
    expect(incomeCategories.length).toBeGreaterThan(0);

    for (const [index, category] of incomeCategories.entries()) {
      const amountCents = 1000 + index;
      const { movementId } = await new CreateIncome(db.uow).execute({
        nucleusId: nucleus.id,
        resourceId: application.id,
        categoryId: category.id,
        amountCents,
        description: `Rendimento de teste: ${category.name}`,
        date,
        createdByPersonId: person.id,
        clientOperationId: `application-income-${index}`,
      });
      const movement = await db.repos.movements.findById(movementId);
      const legs = await db.repos.movements.listLegsByMovementIds([movementId]);
      expect(movement?.categoryId).toBe(category.id);
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({ resourceId: application.id, amountCents });
    }

    const incomeTotal = incomeCategories.reduce((total, _category, index) => total + 1000 + index, 0);
    const summary = await new GetDashboardSummary(db.repos).execute({
      nucleusId: nucleus.id,
      periodDateFrom: date,
      periodDateTo: date,
    });
    expect(summary.moneyTotalCents).toBe(100000);
    expect(summary.applicationTotalCents).toBe(500000 + incomeTotal);
    expect(summary.resources.find((entry) => entry.resource.id === application.id)?.balanceCents).toBe(500000 + incomeTotal);
  });

  it('permite transferências nos dois sentidos e mantém o patrimônio entre conta e aplicação', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 50000 });
    const { resource: application } = await new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'Fundo de teste',
      type: 'APPLICATION',
      liquidityDays: 1,
      initialBalanceCents: 100000,
      ownerPersonId: person.id,
    });

    await new CreateTransfer(db.uow).execute({
      nucleusId: nucleus.id, fromResourceId: account.id, toResourceId: application.id,
      amountCents: 10000, description: 'Aplicação', date, createdByPersonId: person.id,
      clientOperationId: 'account-to-application',
    });
    await new CreateTransfer(db.uow).execute({
      nucleusId: nucleus.id, fromResourceId: application.id, toResourceId: account.id,
      amountCents: 4000, description: 'Resgate', date, createdByPersonId: person.id,
      clientOperationId: 'application-to-account',
    });

    const summary = await new GetDashboardSummary(db.repos).execute({
      nucleusId: nucleus.id,
      periodDateFrom: date,
      periodDateTo: date,
    });
    expect(summary.moneyTotalCents).toBe(44000);
    expect(summary.applicationTotalCents).toBe(106000);
    expect(summary.moneyTotalCents + summary.applicationTotalCents).toBe(150000);
    await expect(new CreateTransfer(db.uow).execute({
      nucleusId: nucleus.id, fromResourceId: application.id, toResourceId: account.id,
      amountCents: 200000, description: 'Resgate maior que o saldo', date, createdByPersonId: person.id,
      clientOperationId: 'application-overdraw-blocked',
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('permite ajustar o saldo de uma aplicação e impede tratá-la como origem direta de compra', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const { resource: application } = await new CreateResource(db.uow).execute({
      nucleusId: nucleus.id,
      name: 'Aplicação ajustável',
      type: 'APPLICATION',
      liquidityDays: 365,
      initialBalanceCents: 75000,
      ownerPersonId: person.id,
    });

    await new CreateAdjustment(db.uow).execute({
      nucleusId: nucleus.id, resourceId: application.id, newBalanceCents: 80000,
      reason: 'Atualização manual do saldo informado pela instituição', date,
      createdByPersonId: person.id, clientOperationId: 'application-adjustment',
    });

    for (const paymentMethod of ['DEBIT', 'PIX', 'BENEFIT', 'CREDIT'] as const) {
      await expect(new CreateExpense(db.uow).execute({
        nucleusId: nucleus.id,
        resourceId: application.id,
        categoryId: null,
        amountCents: 1000,
        description: 'Compra incompatível com aplicação',
        date,
        createdByPersonId: person.id,
        paymentMethod,
        invoiceDueDate: paymentMethod === 'CREDIT' ? '2026-10-10' : null,
        clientOperationId: `application-expense-${paymentMethod.toLowerCase()}`,
      })).rejects.toMatchObject({ code: 'PAYMENT_RESOURCE_MISMATCH' });
    }

    const summary = await new GetDashboardSummary(db.repos).execute({
      nucleusId: nucleus.id,
      periodDateFrom: date,
      periodDateTo: date,
    });
    expect(summary.applicationTotalCents).toBe(80000);
    expect(await db.repos.movements.list({ nucleusId: nucleus.id })).toHaveLength(1);
  });
});
