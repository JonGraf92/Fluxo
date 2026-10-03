import { afterEach, describe, expect, it } from 'vitest';
import { CreateAdjustment } from '../../src/application/use-cases/movement/CreateAdjustment';
import { calculateResourceBalance } from '../../src/domain/services/BalanceCalculator';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

describe('CreateAdjustment — ADR D-019/D-020: ajuste vira leg auditada, saldo inicial nunca é editado', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('registra o delta como uma MovementLeg e mantém o motivo em Adjustment', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });

    const result = await new CreateAdjustment(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      newBalanceCents: 105000,
      reason: 'Conferência de saldo físico',
      date: '2026-01-10',
      createdByPersonId: person.id,
      clientOperationId: 'adj-1',
    });

    expect(result.previousBalanceCents).toBe(100000);
    expect(result.newBalanceCents).toBe(105000);

    const legs = await db.repos.movements.listLegsByMovementIds([result.movementId]);
    expect(legs).toHaveLength(1);
    expect(legs[0]!.amountCents).toBe(5000);

    // resources.initial_balance_cents NUNCA muda — ADR D-020.
    const resourceRow = await db.repos.resources.findById(conta.id);
    expect(resourceRow?.initialBalanceCents).toBe(100000);

    // Saldo calculado reflete o ajuste através da leg, não de um campo solto.
    const legsForBalance = await db.repos.movements.listLegsForBalance(nucleus.id);
    expect(calculateResourceBalance(conta.id, resourceRow!.initialBalanceCents, legsForBalance).toCents()).toBe(105000);
  });

  it('exige motivo e rejeita ajuste sem efeito (novo saldo igual ao atual)', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 50000 });

    await expect(
      new CreateAdjustment(db.uow).execute({
        nucleusId: nucleus.id,
        resourceId: conta.id,
        newBalanceCents: 50000,
        reason: 'Sem efeito',
        date: '2026-01-01',
        createdByPersonId: person.id,
        clientOperationId: 'adj-noop',
      }),
    ).rejects.toThrow();

    await expect(
      new CreateAdjustment(db.uow).execute({
        nucleusId: nucleus.id,
        resourceId: conta.id,
        newBalanceCents: 60000,
        reason: '   ',
        date: '2026-01-01',
        createdByPersonId: person.id,
        clientOperationId: 'adj-no-reason',
      }),
    ).rejects.toThrow();
  });
});
