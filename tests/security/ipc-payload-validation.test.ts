import { describe, expect, it } from 'vitest';
import {
  CreateAdjustmentSchema,
  CreateIncomeSchema,
  CreateTransferSchema,
} from '../../src/shared/ipc-contract';

describe('Segurança — validação de payload na fronteira IPC (seção 36)', () => {
  it('rejeita payload de entrada malformado (valor não positivo, data em formato errado)', () => {
    expect(
      CreateIncomeSchema.safeParse({
        nucleusId: 'not-a-uuid',
        amountCents: -100,
        description: '',
        date: '01/01/2026',
        resourceId: 'also-not-a-uuid',
        createdByPersonId: 'x',
        clientOperationId: 'y',
      }).success,
    ).toBe(false);
  });

  it('rejeita datas que têm formato ISO mas não existem no calendário e normaliza a descrição', () => {
    const base = { nucleusId: '11111111-1111-4111-8111-111111111111', resourceId: '11111111-1111-4111-8111-111111111111', amountCents: 100, date: '2026-02-31', description: 'Entrada', clientOperationId: '11111111-1111-4111-8111-111111111111' };
    expect(CreateIncomeSchema.safeParse(base).success).toBe(false);
    const valid = CreateIncomeSchema.safeParse({ ...base, date: '2026-02-28', description: '  Salario  ' });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.description).toBe('Salario');
  });

  it('rejeita objetos com campos extras inofensivos mas ainda cobra os campos obrigatórios', () => {
    const result = CreateTransferSchema.safeParse({
      nucleusId: '11111111-1111-4111-8111-111111111111',
      fromResourceId: '11111111-1111-4111-8111-111111111111',
      // toResourceId ausente de propósito
      amountCents: 1000,
      description: 'teste',
      date: '2026-01-01',
      createdByPersonId: '11111111-1111-4111-8111-111111111111',
      clientOperationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('aceita um payload de ajuste válido e bem formado', () => {
    const result = CreateAdjustmentSchema.safeParse({
      nucleusId: '11111111-1111-4111-8111-111111111111',
      resourceId: '11111111-1111-4111-8111-111111111111',
      newBalanceCents: 5000,
      reason: 'Conferência',
      date: '2026-01-01',

      clientOperationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(true);
  });
});
