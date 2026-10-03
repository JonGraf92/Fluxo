import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, TestDb } from '../testDb';

describe('Migrations — seção 33: estrutura mínima do banco', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('cria todas as tabelas esperadas da V1 (sem documents/document_items — ADR D-022)', async () => {
    db = await createTestDb();

    const tables = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((row) => row.name);

    const expected = [
      'persons',
      'local_identity',
      'financial_nuclei',
      'memberships',
      'resources',
      'resource_ownership',
      'categories',
      'movements',
      'movement_legs',
      'adjustments',
      'audit_logs',
      'credit_invoices',
    ];

    for (const table of expected) {
      expect(tableNames).toContain(table);
    }

    // Regra explícita do ADR D-022: nada de tabela de documentos na V1.
    expect(tableNames).not.toContain('documents');
    expect(tableNames).not.toContain('document_items');
  });

  it('impõe unicidade de idempotência (nucleus_id + client_operation_id)', async () => {
    db = await createTestDb();
    const now = new Date().toISOString();

    db.raw
      .prepare('INSERT INTO persons (id, display_name, created_at) VALUES (?, ?, ?)')
      .run('p1', 'Teste', now);
    db.raw
      .prepare('INSERT INTO financial_nuclei (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('n1', 'Núcleo', 'INDIVIDUAL', now, now);
    db.raw
      .prepare(
        'INSERT INTO movements (id, nucleus_id, type, status, date, description, category_id, created_by_person_id, client_operation_id, created_at, updated_at, cancelled_at, cancelled_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'n1', 'INCOME', 'CONFIRMED', '2026-01-01', 'x', null, 'p1', 'dup-op', now, now, null, null);

    expect(() =>
      db.raw
        .prepare(
          'INSERT INTO movements (id, nucleus_id, type, status, date, description, category_id, created_by_person_id, client_operation_id, created_at, updated_at, cancelled_at, cancelled_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('m2', 'n1', 'INCOME', 'CONFIRMED', '2026-01-01', 'y', null, 'p1', 'dup-op', now, now, null, null),
    ).toThrow();
  });
});
