import { afterEach, describe, expect, it } from 'vitest';
import { CloseCreditInvoice } from '../../src/application/use-cases/movement/CloseCreditInvoice';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { ListOpenCreditInvoices } from '../../src/application/use-cases/movement/ListOpenCreditInvoices';
import { PayCreditInvoice } from '../../src/application/use-cases/movement/PayCreditInvoice';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('Ciclo da fatura — compras, consolidacao e pagamento', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('mantem a compra na fatura, fecha e paga sem duplicar a despesa no mes', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta de pagamento', initialBalanceCents: 10000 });
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao teste', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const expenseCategory = categories.find((category) => category.kind === 'EXPENSE')!;
    const date = '2026-09-27';
    const dueDate = '2026-10-10';
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: expenseCategory.id, amountCents: 2500, description: 'Compra no credito', date, createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: dueDate, clientOperationId: 'invoice-purchase' });

    const list = new ListOpenCreditInvoices(db.repos);
    let [invoice] = await list.execute(nucleus.id);
    expect(invoice).toMatchObject({ cardResourceId: card.resource.id, dueDate, amountCents: 2500, status: 'OPEN' });

    const closeInput = { nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate };
    await new CloseCreditInvoice(db.uow).execute(closeInput);
    [invoice] = await list.execute(nucleus.id);
    expect(invoice?.status).toBe('CLOSED');
    await expect(new CloseCreditInvoice(db.uow).execute(closeInput)).rejects.toMatchObject({ code: 'INVOICE_ALREADY_CLOSED' });

    const payment = await new PayCreditInvoice(db.uow).execute({ ...closeInput, paymentResourceId: account.id, date: '2026-10-10', createdByPersonId: person.id, clientOperationId: 'invoice-payment' });
    expect(payment.amountCents).toBe(2500);
    [invoice] = await list.execute(nucleus.id);
    expect(invoice).toMatchObject({ status: 'PAID', paidAt: '2026-10-10', amountCents: 2500 });

    const summary = await new GetDashboardSummary(db.repos).execute({ nucleusId: nucleus.id, periodDateFrom: '2026-09-01', periodDateTo: '2026-10-31' });
    expect(summary.moneyTotalCents).toBe(7500);
    expect(summary.creditOutstandingCents).toBe(0);
    expect(summary.periodExpenseCents).toBe(2500);
    const movements = await db.repos.movements.list({ nucleusId: nucleus.id });
    expect(movements.filter((movement) => movement.type === 'EXPENSE')).toHaveLength(1);
    expect(movements.filter((movement) => movement.type === 'TRANSFER')).toHaveLength(1);
    await expect(new PayCreditInvoice(db.uow).execute({ ...closeInput, paymentResourceId: account.id, date: '2026-10-10', createdByPersonId: person.id, clientOperationId: 'invoice-payment-again' })).rejects.toMatchObject({ code: 'INVOICE_MUST_BE_CLOSED' });
  });

  it('bloqueia o pagamento da fatura quando a conta escolhida nao tem saldo suficiente', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta com saldo baixo', initialBalanceCents: 1000 });
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao teste', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;
    const dueDate = '2026-10-10';
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 2500, description: 'Compra teste', date: '2026-09-27', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: dueDate, clientOperationId: 'low-balance-invoice-purchase' });
    await new CloseCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate });
    await expect(new PayCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate, paymentResourceId: account.id, date: dueDate, createdByPersonId: person.id, clientOperationId: 'low-balance-invoice-pay' })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    const invoices = await new ListOpenCreditInvoices(db.repos).execute(nucleus.id);
    expect(invoices.find((invoice) => invoice.cardResourceId === card.resource.id)?.status).toBe('CLOSED');
    expect((await new GetDashboardSummary(db.repos).execute({ nucleusId: nucleus.id, periodDateFrom: '2026-09-01', periodDateTo: '2026-10-31' })).moneyTotalCents).toBe(1000);
  });

  it('nao debita o caixa duas vezes quando a fatura e paga duas vezes (TOCTOU)', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta unica', initialBalanceCents: 10000 });
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao TOCTOU', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;
    const dueDate = '2026-10-10';
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 2500, description: 'Compra', date: '2026-09-27', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: dueDate, clientOperationId: 'toctou-purchase' });
    await new CloseCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate });

    const base = { nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate, paymentResourceId: account.id, date: dueDate, createdByPersonId: person.id };
    const pay = new PayCreditInvoice(db.uow);
    // Dois clientOperationId DISTINTOS: a idempotencia nao protege este caso, porque sao
    // operacoes diferentes do ponto de vista do app (ex.: dois toques, duas abas).
    const [first, second] = await Promise.allSettled([
      pay.execute({ ...base, clientOperationId: 'toctou-pay-a' }),
      pay.execute({ ...base, clientOperationId: 'toctou-pay-b' }),
    ]);

    // Uma tem de vencer e a outra tem de ser recusada — nunca as duas.
    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    // E o caixa nao pode ter sido debitado duas vezes: 10000 - 2500 = 7500.
    const balance = await db.repos.movements.listLegsForBalance(nucleus.id);
    const accountBalance = calculateResourceBalance(account.id, 10000, balance).toCents();
    expect(accountBalance).toBe(7500);
    expect((await db.repos.movements.list({ nucleusId: nucleus.id })).filter((movement) => movement.type === 'TRANSFER')).toHaveLength(1);
  });

  it('reconhece pagamento anterior por referencia estrutural, nao pelo texto da descricao', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { name: 'Conta', initialBalanceCents: 10000 });
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao texto', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;
    const dueDate = '2026-10-10';
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 2500, description: 'Compra', date: '2026-09-27', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: dueDate, clientOperationId: 'struct-purchase' });
    await new CloseCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate });

    const payment = await new PayCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate, paymentResourceId: account.id, date: dueDate, createdByPersonId: person.id, clientOperationId: 'struct-pay' });
    const movement = await db.repos.movements.findById(payment.movementId);
    expect(movement?.cardInvoiceResourceId).toBe(card.resource.id);

    // Simula o que quebrava a heuristica antiga: a descricao deixa de comecar com
    // 'Pagamento de fatura:'. Com a referencia estrutural, o pagamento continua sendo
    // reconhecido. `amountCents` aqui e o total de COMPRAS da fatura (nao o saldo devedor),
    // entao a prova e que um novo pagamento NAO e aceito: sem a referencia estrutural, a
    // fatura pareceria ainda ter saldo devedor e seria cobrada de novo.
    db.raw.prepare('UPDATE movements SET description = ? WHERE id = ?').run('Pagamento traduzido/renomeado', payment.movementId);

    await expect(new PayCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate, paymentResourceId: account.id, date: dueDate, createdByPersonId: person.id, clientOperationId: 'struct-pay-2' })).rejects.toMatchObject({ code: 'INVOICE_MUST_BE_CLOSED' });

    // E o saldo devedor calculado por PayCreditInvoice cai a zero, exercitando exatamente a
    // linha que antes dependia do texto. Para isso, reabre-se a fatura para CLOSED e tenta-se
    // pagar de novo: deve falhar por nao haver saldo pendente (INVOICE_ALREADY_PAID), o que
    // so acontece se o pagamento anterior foi reconhecido pela referencia estrutural.
    db.raw.prepare("UPDATE credit_invoices SET status = 'CLOSED', paid_at = NULL WHERE card_resource_id = ? AND due_date = ?").run(card.resource.id, dueDate);
    await expect(new PayCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: dueDate, paymentResourceId: account.id, date: dueDate, createdByPersonId: person.id, clientOperationId: 'struct-pay-3' })).rejects.toMatchObject({ code: 'INVOICE_ALREADY_PAID' });

    expect(calculateResourceBalance(account.id, 10000, await db.repos.movements.listLegsForBalance(nucleus.id)).toCents()).toBe(7500);
  });

  it('usa o corte da fatura e encaminha compras para o próximo ciclo se a fatura atual já foi fechada', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const card = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao corte', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;
    const expense = new CreateExpense(db.uow);
    await expense.execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 1000, description: 'Antes do corte', date: '2026-09-05', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: '2026-09-10', clientOperationId: 'before-cutoff' });
    await new CloseCreditInvoice(db.uow).execute({ nucleusId: nucleus.id, cardResourceId: card.resource.id, invoiceDueDate: '2026-09-10' });
    const { movementId } = await expense.execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 2000, description: 'Fatura fechada, novo ciclo', date: '2026-09-04', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: '2026-09-10', clientOperationId: 'after-early-close' });
    expect((await db.repos.movements.findById(movementId))?.invoiceDueDate).toBe('2026-10-10');
    await expect(expense.execute({ nucleusId: nucleus.id, resourceId: card.resource.id, categoryId: category.id, amountCents: 300, description: 'Data depois do corte', date: '2026-09-06', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: '2026-09-10', clientOperationId: 'wrong-cutoff-date' })).rejects.toMatchObject({ code: 'INVOICE_BEFORE_CUTOFF' });
  });
});
