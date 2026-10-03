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

  it('exige sinal coerente com a NATUREZA do recurso em entrada e saida', () => {
    const money = new Map([['conta', 'MONEY'] as const]);
    const liability = new Map([['cartao', 'LIABILITY'] as const]);
    const benefit = new Map([['vr', 'BENEFIT'] as const]);

    // Entrada sempre credita, independentemente da natureza.
    expect(() => assertLedgerInvariants({ movementType: 'INCOME', description: 'Entrada com sinal errado', legs: [{ resourceId: 'conta', amountCents: -1000 }], resourceNatures: money }))
      .toThrowError(expect.objectContaining({ code: 'LEDGER_INCOME_MUST_BE_POSITIVE' }));
    expect(() => assertLedgerInvariants({ movementType: 'INCOME', description: 'Entrada correta', legs: [{ resourceId: 'conta', amountCents: 1000 }], resourceNatures: money })).not.toThrow();

    // Saida em dinheiro/beneficio DEBITA (negativo).
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Saida em dinheiro com sinal trocado', legs: [{ resourceId: 'conta', amountCents: 1000 }], resourceNatures: money }))
      .toThrowError(expect.objectContaining({ code: 'LEDGER_EXPENSE_MUST_DEBIT_RESOURCE' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Saida em beneficio com sinal trocado', legs: [{ resourceId: 'vr', amountCents: 1000 }], resourceNatures: benefit }))
      .toThrowError(expect.objectContaining({ code: 'LEDGER_EXPENSE_MUST_DEBIT_RESOURCE' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Saida correta', legs: [{ resourceId: 'conta', amountCents: -1000 }], resourceNatures: money })).not.toThrow();

    // Compra no CARTAO e passivo: aumenta a divida, logo POSITIVA. Este e o caso que a
    // primeira versao desta funcao errou ao exigir sinal negativo sempre.
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Compra no cartao', legs: [{ resourceId: 'cartao', amountCents: 2500 }], resourceNatures: liability })).not.toThrow();
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Compra no cartao com sinal invertido', legs: [{ resourceId: 'cartao', amountCents: -2500 }], resourceNatures: liability }))
      .toThrowError(expect.objectContaining({ code: 'LEDGER_CREDIT_EXPENSE_MUST_INCREASE_LIABILITY' }));
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
