import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../src/domain/entities/Category';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

const dueDate = '2026-10-10';

describe('Lancamentos categorizados — matriz ponta a ponta em SQLite isolado', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('grava entrada em cada categoria de entrada, preservando categoria, descricao e recurso escolhido', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const money = await seedResource(db, nucleus.id, person.id, { name: 'Conta de teste' });
    const benefit = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'VR teste', type: 'BENEFIT', benefitSubtype: 'VR', initialBalanceCents: 0, ownerPersonId: person.id });
    const incomeCategories = categories.filter((category) => category.kind === 'INCOME');
    expect(incomeCategories.length).toBeGreaterThan(0);

    for (const [index, category] of incomeCategories.entries()) {
      const description = 'Entrada teste ' + category.name;
      const resource = category.name.toLowerCase().includes('benef') ? benefit.resource : money;
      const created = await new CreateIncome(db.uow).execute({
        nucleusId: nucleus.id, resourceId: resource.id, categoryId: category.id,
        amountCents: 1000 + index, description: '  ' + description + '  ', date: '2026-09-27',
        createdByPersonId: person.id, clientOperationId: 'income-category-' + index,
      });
      const result = await db.repos.movements.findById(created.movementId);
      const legs = await db.repos.movements.listLegsByMovementIds([created.movementId]);
      expect(result?.categoryId).toBe(category.id);
      expect(result?.description).toBe(description);
      expect(legs).toHaveLength(1);
      expect(legs[0]?.resourceId).toBe(resource.id);
      expect(legs[0]?.amountCents).toBe(1000 + index);
    }
  });

  it('grava saida em cada categoria de saida e confere forma de pagamento, descricao e sinal contábil', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta teste', initialBalanceCents: 500000 });
    const cash = await seedResource(db, nucleus.id, person.id, { name: 'Dinheiro teste', type: 'CASH', initialBalanceCents: 500000 });
    const benefit = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'VR teste', type: 'BENEFIT', benefitSubtype: 'VR', initialBalanceCents: 500000, ownerPersonId: person.id });
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao teste', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const expenseCategories = categories.filter((category) => category.kind === 'EXPENSE');
    expect(expenseCategories).toHaveLength(DEFAULT_EXPENSE_CATEGORIES.length);
    const methods = ['DEBIT', 'PIX', 'BENEFIT', 'CREDIT'] as const;
    const ids: string[] = [];

    for (const [index, category] of expenseCategories.entries()) {
      const method = methods[index % methods.length];
      const resource = method === 'BENEFIT' ? benefit.resource : method === 'CREDIT' ? card.resource : method === 'PIX' ? cash : account;
      const description = 'Saida teste ' + category.name;
      const created = await new CreateExpense(db.uow).execute({
        nucleusId: nucleus.id, resourceId: resource.id, categoryId: category.id,
        amountCents: 1200 + index, description: '  ' + description + '  ', date: '2026-09-27',
        createdByPersonId: person.id, paymentMethod: method,
        invoiceDueDate: method === 'CREDIT' ? dueDate : null,
        clientOperationId: 'expense-category-' + index,
      });
      ids.push(created.movementId);
      const result = await db.repos.movements.findById(created.movementId);
      const legs = await db.repos.movements.listLegsByMovementIds([created.movementId]);
      expect(result?.categoryId).toBe(category.id);
      expect(result?.description).toBe(description);
      expect(result?.paymentMethod).toBe(method);
      expect(result?.invoiceDueDate).toBe(method === 'CREDIT' ? dueDate : null);
      expect(legs).toHaveLength(1);
      expect(legs[0]?.resourceId).toBe(resource.id);
      expect(legs[0]?.amountCents).toBe(method === 'CREDIT' ? 1200 + index : -(1200 + index));
    }
    // Derivado da constante real em vez de um literal fixo: a matriz cobre todas as
    // categorias de despesa padrao, entao o numero acompanha a lista automaticamente.
    expect(ids).toHaveLength(DEFAULT_EXPENSE_CATEGORIES.length);
  });

  it('rejeita categoria de tipo errado e descricoes vazias sem gravar movimentos', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id);
    const incomeCategory = categories.find((category) => category.kind === 'INCOME')!;
    const expenseCategory = categories.find((category) => category.kind === 'EXPENSE')!;
    await expect(new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: account.id, categoryId: incomeCategory.id, amountCents: 500, description: 'x', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'wrong-kind' })).rejects.toMatchObject({ code: 'CATEGORY_KIND_MISMATCH' });
    await expect(new CreateIncome(db.uow).execute({ nucleusId: nucleus.id, resourceId: account.id, categoryId: expenseCategory.id, amountCents: 500, description: 'x', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'wrong-kind-income' })).rejects.toMatchObject({ code: 'CATEGORY_KIND_MISMATCH' });
    await expect(new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: account.id, categoryId: null, amountCents: 500, description: '  ', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'blank-expense' })).rejects.toMatchObject({ code: 'MOVEMENT_DESCRIPTION_REQUIRED' });
    await expect(new CreateIncome(db.uow).execute({ nucleusId: nucleus.id, resourceId: account.id, categoryId: null, amountCents: 500, description: '  ', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'blank-income' })).rejects.toMatchObject({ code: 'MOVEMENT_DESCRIPTION_REQUIRED' });
    expect(await db.repos.movements.list({ nucleusId: nucleus.id })).toHaveLength(0);
  });
});
