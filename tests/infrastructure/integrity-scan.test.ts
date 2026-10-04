import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../src/application/use-cases/movement/CreateIncome';
import { CreateTransfer } from '../src/application/use-cases/movement/CreateTransfer';
import { CreateResource } from '../src/application/use-cases/resource/CreateResource';
import { scanIntegrity } from '../src/infrastructure/db/integrityScan';
import { createTestDb, TestDb } from './testDb';
import { seedPersonAndNucleus, seedResource } from './seed';

/**
 * Varredura de integridade do ledger sobre os dados REAIS de um banco.
 *
 * Complementa o LedgerInvariants: aquele impede a ENTRADA de um lancamento inconsistente;
 * este detecta inconsistencias ja existentes (por exemplo em bancos criados antes das
 * correcoes da Fase 1, ou apos uma migracao).
 */
describe('Varredura de integridade do ledger', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('nao aponta nada em um banco com operacoes legitimas', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { name: 'Conta', initialBalanceCents: 100000 });
    const poupanca = await seedResource(db, nucleus.id, person.id, { name: 'Poupanca', initialBalanceCents: 0 });
    const cartao = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;

    await new CreateIncome(db.uow).execute({ nucleusId: nucleus.id, resourceId: conta.id, categoryId: null, amountCents: 500000, description: 'Salario', date: '2026-09-05', createdByPersonId: person.id, clientOperationId: 'scan-income' });
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: conta.id, categoryId: category.id, amountCents: 12000, description: 'Mercado', date: '2026-09-06', createdByPersonId: person.id, paymentMethod: 'DEBIT', clientOperationId: 'scan-expense' });
    // Compra no cartao: leg POSITIVA (passivo aumenta).
    await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: cartao.resource.id, categoryId: category.id, amountCents: 2500, description: 'Compra credito', date: '2026-09-07', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: '2026-10-10', clientOperationId: 'scan-credit' });
    await new CreateTransfer(db.uow).execute({ nucleusId: nucleus.id, fromResourceId: conta.id, toResourceId: poupanca.id, amountCents: 30000, description: 'Reserva', date: '2026-09-08', createdByPersonId: person.id, clientOperationId: 'scan-transfer' });

    expect(await scanIntegrity(db.kysely)).toEqual([]);
  });

  it('detecta movimento gravado sem partidas', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    db.raw.prepare(
      `INSERT INTO movements (id, nucleus_id, type, status, date, description, category_id, created_by_person_id, responsible_person_id, payment_method, invoice_due_date, card_invoice_resource_id, client_operation_id, created_at, updated_at, cancelled_at, cancelled_reason)
       VALUES ('m-orfao', ?, 'EXPENSE', 'CONFIRMED', '2026-09-10', 'Sem partidas', NULL, ?, NULL, NULL, NULL, NULL, 'op-orfa', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z', NULL, NULL)`,
    ).run(nucleus.id, person.id);

    const findings = await scanIntegrity(db.kysely);
    expect(findings.some((f) => f.codigo === 'MOVIMENTO_SEM_PARTIDAS' && f.severity === 'CRITICO')).toBe(true);
  });

  it('detecta transferencia entre ativos que nao zera', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const a = await seedResource(db, nucleus.id, person.id, { name: 'A', initialBalanceCents: 10000 });
    const b = await seedResource(db, nucleus.id, person.id, { name: 'B', initialBalanceCents: 0 });
    // Grava direto no banco, furando o invariante — simula uma inconsistencia pre-existente.
    db.raw.prepare(
      `INSERT INTO movements (id, nucleus_id, type, status, date, description, category_id, created_by_person_id, responsible_person_id, payment_method, invoice_due_date, card_invoice_resource_id, client_operation_id, created_at, updated_at, cancelled_at, cancelled_reason)
       VALUES ('m-torta', ?, 'TRANSFER', 'CONFIRMED', '2026-09-10', 'Transferencia torta', NULL, ?, NULL, NULL, NULL, NULL, 'op-torta', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z', NULL, NULL)`,
    ).run(nucleus.id, person.id);
    const insertLeg = db.raw.prepare('INSERT INTO movement_legs (id, movement_id, resource_id, amount_cents, sequence) VALUES (?, ?, ?, ?, ?)');
    insertLeg.run('leg-1', 'm-torta', a.id, -5000, 0);
    insertLeg.run('leg-2', 'm-torta', b.id, 4000, 1);

    const findings = await scanIntegrity(db.kysely);
    expect(findings.some((f) => f.codigo === 'TRANSFERENCIA_NAO_ZERA' && f.severity === 'CRITICO')).toBe(true);
  });

  it('detecta saida creditando recurso de dinheiro (sinal invertido)', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { name: 'Conta', initialBalanceCents: 10000 });
    db.raw.prepare(
      `INSERT INTO movements (id, nucleus_id, type, status, date, description, category_id, created_by_person_id, responsible_person_id, payment_method, invoice_due_date, card_invoice_resource_id, client_operation_id, created_at, updated_at, cancelled_at, cancelled_reason)
       VALUES ('m-invertida', ?, 'EXPENSE', 'CONFIRMED', '2026-09-10', 'Saida invertida', NULL, ?, NULL, 'DEBIT', NULL, NULL, 'op-invertida', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z', NULL, NULL)`,
    ).run(nucleus.id, person.id);
    db.raw.prepare('INSERT INTO movement_legs (id, movement_id, resource_id, amount_cents, sequence) VALUES (?, ?, ?, ?, ?)').run('leg-inv', 'm-invertida', conta.id, 1000, 0);

    const findings = await scanIntegrity(db.kysely);
    expect(findings.some((f) => f.codigo === 'SAIDA_CREDITANDO_RECURSO')).toBe(true);
  });
});
