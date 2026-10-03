import { describe, expect, it } from 'vitest';
import { assertLedgerInvariants } from '../../src/domain/services/LedgerInvariants';

/**
 * O invariante contabil global. Antes desta verificacao, apenas a transferencia garantia a
 * soma zero (TransferPolicy); entradas, saidas e ajustes nunca eram conferidos, entao o
 * sistema tinha partidas dobradas por acidente em um dos quatro tipos de movimento.
 */
describe('Invariantes contabeis do ledger', () => {
  it('aceita transferencia com duas partidas que se cancelam', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Da conta para a poupanca',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'poupanca', amountCents: 5000 }],
    })).not.toThrow();
  });

  it('recusa transferencia cujas pontas nao se cancelam', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia torta',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'poupanca', amountCents: 4000 }],
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_NOT_BALANCED' }));
  });

  it('recusa transferencia para o mesmo recurso', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia circular',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'conta', amountCents: 5000 }],
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_SAME_RESOURCE' }));
  });

  it('recusa transferencia com numero de partidas diferente de duas', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia com tres pontas',
      legs: [
        { resourceId: 'a', amountCents: -5000 },
        { resourceId: 'b', amountCents: 2500 },
        { resourceId: 'c', amountCents: 2500 },
      ],
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_REQUIRES_TWO_LEGS' }));
  });

  it('exige sinal correto em entrada e saida', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'INCOME',
      description: 'Entrada com sinal errado',
      legs: [{ resourceId: 'conta', amountCents: -1000 }],
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_INCOME_MUST_BE_POSITIVE' }));

    expect(() => assertLedgerInvariants({
      movementType: 'EXPENSE',
      description: 'Saida com sinal errado',
      legs: [{ resourceId: 'conta', amountCents: 1000 }],
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_EXPENSE_MUST_BE_NEGATIVE' }));

    expect(() => assertLedgerInvariants({
      movementType: 'INCOME',
      description: 'Entrada correta',
      legs: [{ resourceId: 'conta', amountCents: 1000 }],
    })).not.toThrow();

    expect(() => assertLedgerInvariants({
      movementType: 'EXPENSE',
      description: 'Saida correta',
      legs: [{ resourceId: 'conta', amountCents: -1000 }],
    })).not.toThrow();
  });

  it('aceita ajuste positivo e negativo, mas nunca nulo', () => {
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste para cima', legs: [{ resourceId: 'conta', amountCents: 3000 }] })).not.toThrow();
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste para baixo', legs: [{ resourceId: 'conta', amountCents: -3000 }] })).not.toThrow();
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste nulo', legs: [{ resourceId: 'conta', amountCents: 0 }] })).toThrowError(expect.objectContaining({ code: 'LEDGER_ZERO_LEG' }));
  });

  it('recusa movimento sem partidas e partida de valor zero', () => {
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Sem partidas', legs: [] })).toThrowError(expect.objectContaining({ code: 'LEDGER_MOVEMENT_WITHOUT_LEGS' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Partida nula', legs: [{ resourceId: 'conta', amountCents: 0 }] })).toThrowError(expect.objectContaining({ code: 'LEDGER_ZERO_LEG' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Centavos fracionados', legs: [{ resourceId: 'conta', amountCents: -10.5 }] })).toThrowError(expect.objectContaining({ code: 'LEDGER_LEG_NOT_INTEGER' }));
  });
});
