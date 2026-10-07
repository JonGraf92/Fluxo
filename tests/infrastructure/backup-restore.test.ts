import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { AddNucleusMember } from '../../src/application/use-cases/person/AddNucleusMember';
import { createBackup, verifyBackupFile } from '../../src/infrastructure/backup/backup';
import { scanIntegrity } from '../../src/infrastructure/db/integrityScan';
import { createFileDb, makeTempDir, removeTempDir } from '../fileDb';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { TestDb } from '../testDb';

/**
 * Etapa A, tarefa A5: segue os mesmos passos de `docs/process/restauracao-backup.md` —
 * conferir a cópia, colocá-la como `fluxo.db` numa pasta de dados vazia e abrir — e
 * confere que os dados voltam iguais. Tudo em pastas temporárias, com dados fabricados.
 */
describe('Restauração de backup — docs/process/restauracao-backup.md', () => {
  const period = { periodDateFrom: '2026-11-01', periodDateTo: '2026-11-30' };
  let originalDir: string;
  let backupDir: string;
  let restoredDir: string;
  let original: TestDb;
  let restored: TestDb | null;

  beforeEach(async () => {
    originalDir = makeTempDir('original');
    backupDir = makeTempDir('backup');
    restoredDir = makeTempDir('restaurado');
    original = await createFileDb(originalDir);
    restored = null;
  });

  afterEach(() => {
    restored?.close();
    original.close();
    removeTempDir(originalDir);
    removeTempDir(backupDir);
    removeTempDir(restoredDir);
  });

  it('o banco restaurado abre com os mesmos saldos, lançamentos e pessoas do original', async () => {
    const { person, nucleus } = await seedPersonAndNucleus(original);
    const second = await new AddNucleusMember(original.uow).execute({ nucleusId: nucleus.id, displayName: 'Bia' });
    const account = await seedResource(original, nucleus.id, person.id, { initialBalanceCents: 50_000 });
    const benefit = await seedResource(original, nucleus.id, person.id, {
      name: 'Vale refeição',
      type: 'BENEFIT',
      benefitSubtype: 'VR',
      initialBalanceCents: 30_000,
    });
    await new CreateIncome(original.uow).execute({
      nucleusId: nucleus.id,
      resourceId: account.id,
      categoryId: null,
      amountCents: 120_000,
      description: 'Salário',
      date: '2026-11-05',
      createdByPersonId: person.id,
      clientOperationId: 'op-entrada',
    });
    await new CreateExpense(original.uow).execute({
      nucleusId: nucleus.id,
      resourceId: benefit.id,
      categoryId: null,
      amountCents: 4_590,
      description: 'Almoço',
      date: '2026-11-06',
      createdByPersonId: person.id,
      responsiblePersonId: second.id,
      clientOperationId: 'op-saida',
    });
    const expected = await new GetDashboardSummary(original.repos).execute({ nucleusId: nucleus.id, ...period });

    // Passo 1 do documento: a cópia vem do backup automático.
    const backup = await createBackup({ source: original.raw, destinationDir: backupDir, now: new Date(2026, 10, 6, 22, 0, 0) });

    // Gravação posterior ao backup: não pode aparecer no banco restaurado.
    await new CreateExpense(original.uow).execute({
      nucleusId: nucleus.id,
      resourceId: account.id,
      categoryId: null,
      amountCents: 999,
      description: 'Depois do backup',
      date: '2026-11-07',
      createdByPersonId: person.id,
      clientOperationId: 'op-depois',
    });

    // Passos 2 a 4: conferir a cópia, copiá-la como fluxo.db para a pasta de dados vazia.
    verifyBackupFile(backup.filePath);
    expect(fs.readdirSync(restoredDir)).toEqual([]);
    fs.copyFileSync(backup.filePath, path.join(restoredDir, 'fluxo.db'));

    // Passo 5: abrir. O app roda as migrations na abertura; num backup atual não há o que migrar.
    restored = await createFileDb(restoredDir);

    const actual = await new GetDashboardSummary(restored.repos).execute({ nucleusId: nucleus.id, ...period });
    expect(actual).toEqual(expected);
    expect(actual.moneyTotalCents).toBe(170_000);
    expect(actual.benefitTotalCents).toBe(25_410);

    const descriptions = (await restored.repos.movements.list({ nucleusId: nucleus.id })).map((m) => m.description);
    expect(descriptions.sort()).toEqual(['Almoço', 'Salário']);

    const members = await restored.repos.persons.listByNucleus(nucleus.id);
    expect(members.map((member) => member.displayName).sort()).toEqual(['Ana', 'Bia']);
    expect((await restored.repos.localIdentity.get()) ?? null).toEqual((await original.repos.localIdentity.get()) ?? null);

    expect(await scanIntegrity(restored.kysely)).toEqual([]);
  });

  it('o arquivo de backup continua intacto e reutilizável depois de restaurado', async () => {
    const { person, nucleus } = await seedPersonAndNucleus(original);
    await seedResource(original, nucleus.id, person.id, { initialBalanceCents: 1_000 });
    const backup = await createBackup({ source: original.raw, destinationDir: backupDir, now: new Date(2026, 10, 6, 22, 0, 0) });
    const sizeBefore = fs.statSync(backup.filePath).size;

    fs.copyFileSync(backup.filePath, path.join(restoredDir, 'fluxo.db'));
    restored = await createFileDb(restoredDir);
    await seedResource(restored, nucleus.id, person.id, { name: 'Criada após restaurar' });

    expect(fs.statSync(backup.filePath).size).toBe(sizeBefore);
    expect(() => verifyBackupFile(backup.filePath)).not.toThrow();
    expect(fs.readdirSync(backupDir)).toEqual([path.basename(backup.filePath)]);
  });
});
