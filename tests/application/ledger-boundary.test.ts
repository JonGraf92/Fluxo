import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateTransfer } from '../../src/application/use-cases/movement/CreateTransfer';
import { buildLegs, buildMovement } from '../../src/application/use-cases/movement/shared';
import { CreateResource } from '../../src/application/use-cases/resource/CreateResource';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

/**
 * O invariante contabil e verificado na FRONTEIRA DE PERSISTENCIA (createWithLegs), que e o
 * unico ponto de escrita do ledger. Estes testes provam que ele barra de fato a gravacao —
 * nao apenas que a funcao pura recusa, mas que o banco fica intacto quando alguem tenta
 * gravar um lancamento inconsistente por um caminho novo.
 */
describe('Fronteira de persistencia do ledger', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('recusa gravar um movimento montado a mao com partidas que nao se cancelam', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const a = await seedResource(db, nucleus.id, person.id, { name: 'A', initialBalanceCents: 10000 });
    const b = await seedResource(db, nucleus.id, person.id, { name: 'B', initialBalanceCents: 0 });

    const movement = buildMovement({
      nucleusId: nucleus.id, type: 'TRANSFER', status: 'CONFIRMED', date: '2026-09-27',
      description: 'Transferencia inconsistente', categoryId: null,
      createdByPersonId: person.id, clientOperationId: 'manual-broken-transfer',
    });
    // Monta as legs a mao, furando a TransferPolicy: -5000 e +4000 nao se cancelam.
    const legs = buildLegs(movement.id, [
      { resourceId: a.id, amountCents: -5000 },
      { resourceId: b.id, amountCents: 4000 },
    ]);

    await expect(db.repos.movements.createWithLegs(movement, legs)).rejects.toMatchObject({ code: 'LEDGER_TRANSFER_NOT_BALANCED' });

    // Nada foi gravado: nem movimento, nem partida.
    expect(await db.repos.movements.findById(movement.id)).toBeNull();
    expect(await db.repos.movements.listLegsByMovementIds([movement.id])).toHaveLength(0);
  });

  it('recusa gravar saida com sinal invertido em recurso de dinheiro', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { name: 'Conta', initialBalanceCents: 10000 });

    const movement = buildMovement({
      nucleusId: nucleus.id, type: 'EXPENSE', status: 'CONFIRMED', date: '2026-09-27',
      description: 'Saida com sinal trocado', categoryId: null,
      createdByPersonId: person.id, clientOperationId: 'manual-broken-expense',
    });
    const legs = buildLegs(movement.id, [{ resourceId: conta.id, amountCents: 1000 }]);

    await expect(db.repos.movements.createWithLegs(movement, legs)).rejects.toMatchObject({ code: 'LEDGER_EXPENSE_MUST_DEBIT_RESOURCE' });
    expect(await db.repos.movements.findById(movement.id)).toBeNull();
  });

  it('ACEITA compra no cartao com leg positiva, porque cartao e passivo', async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    const cartao = await new CreateResource(db.uow).execute({ nucleusId: nucleus.id, name: 'Cartao', type: 'CREDIT_CARD', statementDueDay: 10, statementClosingDay: 5, initialBalanceCents: 0, ownerPersonId: person.id });
    const category = categories.find((item) => item.kind === 'EXPENSE')!;

    // A compra aumenta a divida: leg POSITIVA. O invariante nao pode barrar isto — foi o
    // erro da primeira versao da regra, que exigia sinal negativo em toda saida.
    const created = await new CreateExpense(db.uow).execute({ nucleusId: nucleus.id, resourceId: cartao.resource.id, categoryId: category.id, amountCents: 2500, description: 'Compra no credito', date: '2026-09-27', createdByPersonId: person.id, paymentMethod: 'CREDIT', invoiceDueDate: '2026-10-10', clientOperationId: 'ledger-credit-expense' });

    const legs = await db.repos.movements.listLegsByMovementIds([created.movementId]);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.amountCents).toBe(2500);
  });

  it('mantem a soma das partidas igual a zero em toda transferencia real', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const origem = await seedResource(db, nucleus.id, person.id, { name: 'Origem', initialBalanceCents: 100000 });
    const destino = await seedResource(db, nucleus.id, person.id, { name: 'Destino', initialBalanceCents: 0 });

    await new CreateTransfer(db.uow).execute({ nucleusId: nucleus.id, fromResourceId: origem.id, toResourceId: destino.id, amountCents: 25000, description: 'Transferencia valida', date: '2026-09-27', createdByPersonId: person.id, clientOperationId: 'ledger-valid-transfer' });

    const movements = await db.repos.movements.list({ nucleusId: nucleus.id });
    for (const movement of movements) {
      const legs = await db.repos.movements.listLegsByMovementIds([movement.id]);
      const net = legs.reduce((sum, leg) => sum + leg.amountCents, 0);
      if (movement.type === 'TRANSFER') expect(net).toBe(0);
    }
  });
});
