import { afterEach, describe, expect, it } from 'vitest';
import { CreateAdjustment } from '../../src/application/use-cases/movement/CreateAdjustment';
import { ExportData } from '../../src/application/use-cases/export/ExportData';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';
import fs from 'node:fs/promises';

describe('ExportData — ajustes exportados de verdade (ADR D-028)', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('inclui o ajuste real no JSON exportado, com motivo e vínculo ao Movement', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });

    const adjustmentResult = await new CreateAdjustment(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      newBalanceCents: 105000,
      reason: 'Conferência de saldo físico',
      date: '2026-01-10',
      createdByPersonId: person.id,
      clientOperationId: 'adj-export-1',
    });

    const jsonPath = 'node_modules/.cache/fluxo-export-test.json';
    await fs.mkdir('node_modules/.cache', { recursive: true });
    await new ExportData(db.repos).execute({ nucleusId: nucleus.id, format: 'json', destinationPath: jsonPath });

    const content = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

    expect(content.adjustments).toHaveLength(1);
    expect(content.adjustments[0].reason).toBe('Conferência de saldo físico');
    expect(content.adjustments[0].movementId).toBe(adjustmentResult.movementId);
    expect(content.adjustments[0].resourceId).toBe(conta.id);

    await fs.unlink(jsonPath);
  });

  it('inclui o motivo do ajuste como coluna no CSV exportado', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const conta = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 50000 });

    await new CreateAdjustment(db.uow).execute({
      nucleusId: nucleus.id,
      resourceId: conta.id,
      newBalanceCents: 60000,
      reason: 'Encontrei dinheiro esquecido',
      date: '2026-01-01',
      createdByPersonId: person.id,
      clientOperationId: 'adj-export-2',
    });

    const csvPath = 'node_modules/.cache/fluxo-export-test.csv';
    await fs.mkdir('node_modules/.cache', { recursive: true });
    await new ExportData(db.repos).execute({ nucleusId: nucleus.id, format: 'csv', destinationPath: csvPath });

    const content = await fs.readFile(csvPath, 'utf-8');

    expect(content).toContain('motivo_ajuste');
    expect(content).toContain('Encontrei dinheiro esquecido');

    await fs.unlink(csvPath);
  });

  it('exporta lista vazia de ajustes quando não há nenhum (não é um erro)', async () => {
    db = await createTestDb();
    const { nucleus } = await seedPersonAndNucleus(db);

    const jsonPath = 'node_modules/.cache/fluxo-export-test-empty.json';
    await fs.mkdir('node_modules/.cache', { recursive: true });
    await new ExportData(db.repos).execute({ nucleusId: nucleus.id, format: 'json', destinationPath: jsonPath });

    const content = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    expect(content.adjustments).toEqual([]);

    await fs.unlink(jsonPath);
  });
});
