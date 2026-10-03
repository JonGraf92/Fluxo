import { afterEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { CreateTransfer } from '../../src/application/use-cases/movement/CreateTransfer';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('CreateTransfer — cenário 56/58 do Master Build Prompt', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('transferência não distorce o patrimônio total e não aparece como despesa', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const contaCorrente = await seedResource(db, nucleus.id, person.id, { name: 'Conta corrente', initialBalanceCents: 200000 });
    const poupanca = await seedResource(db, nucleus.id, person.id, { name: 'Poupança', initialBalanceCents: 0 });

    await new CreateIncome(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: contaCorrente.id,
      categoryId: null,
      amountCents: 400000,
      description: 'Salário',
      date: '2026-01-05',
      createdByPersonId: person.id,
      clientOperationId: 'op-income-1',
    });
    await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: contaCorrente.id,
      categoryId: null,
      amountCents: 30000,
      description: 'Supermercado',
      date: '2026-01-06',
      createdByPersonId: person.id,
      clientOperationId: 'op-expense-1',
    });
    await new CreateExpense(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: contaCorrente.id,
      categoryId: null,
      amountCents: 120000,
      description: 'Aluguel',
      date: '2026-01-07',
      createdByPersonId: person.id,
      clientOperationId: 'op-expense-2',
    });

    const transferResult = await new CreateTransfer(db.uow).execute({
      nucleusId: nucleus.id,
      fromResourceId: contaCorrente.id,
      toResourceId: poupanca.id,
      amountCents: 50000,
      description: 'Reserva',
      date: '2026-01-08',
      createdByPersonId: person.id,
      clientOperationId: 'op-transfer-1',
    });

    const movement = await db.repos.movements.findById(transferResult.movementId);
    expect(movement?.type).toBe('TRANSFER');
    expect(movement?.categoryId).toBeNull(); // nunca classificável como despesa/entrada

    const legsForBalance = await db.repos.movements.listLegsForBalance(nucleus.id);
    const saldoContaCorrente = calculateResourceBalance(contaCorrente.id, contaCorrente.initialBalanceCents, legsForBalance);
    const saldoPoupanca = calculateResourceBalance(poupanca.id, poupanca.initialBalanceCents, legsForBalance);

    expect(saldoContaCorrente.toCents()).toBe(400000); // cenário 56
    expect(saldoPoupanca.toCents()).toBe(50000);

    const patrimonioTotal = saldoContaCorrente.toCents() + saldoPoupanca.toCents();
    expect(patrimonioTotal).toBe(450000); // 2000+4000-300-1200 = 4500, transferência não reduz o total
  });

  it('grava exatamente duas legs para toda transferência, uma em cada recurso', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const a = await seedResource(db, nucleus.id, person.id, { name: 'A', initialBalanceCents: 100000 });
    const b = await seedResource(db, nucleus.id, person.id, { name: 'B', initialBalanceCents: 0 });

    const result = await new CreateTransfer(db.uow).execute({
      nucleusId: nucleus.id,
      fromResourceId: a.id,
      toResourceId: b.id,
      amountCents: 30000,
      description: 'Transferência',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'op-x',
    });

    const legs = await db.repos.movements.listLegsByMovementIds([result.movementId]);
    expect(legs).toHaveLength(2);
    expect(legs.find((l) => l.resourceId === a.id)?.amountCents).toBe(-30000);
    expect(legs.find((l) => l.resourceId === b.id)?.amountCents).toBe(30000);
  });

  it('rejeita transferência entre recursos de naturezas diferentes', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { name: 'Conta', type: 'MONEY_ACCOUNT', initialBalanceCents: 100000 });
    const vr = await seedResource(db, nucleus.id, person.id, { name: 'VR', type: 'BENEFIT', benefitSubtype: 'VR', initialBalanceCents: 60000 });

    await expect(
      new CreateTransfer(db.uow).execute({
        nucleusId: nucleus.id,
        fromResourceId: conta.id,
        toResourceId: vr.id,
        amountCents: 1000,
        description: 'Inválida',
        date: '2026-01-01',
        createdByPersonId: person.id,
        clientOperationId: 'op-invalid',
      }),
    ).rejects.toThrow();
  });
});
