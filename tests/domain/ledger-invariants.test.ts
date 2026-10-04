import { describe, expect, it } from 'vitest';
import { assertLedgerInvariants } from '../../src/domain/services/LedgerInvariants';

/**
 * O invariante contabil global. Antes desta verificacao, apenas a transferencia garantia a
 * soma zero (TransferPolicy); entradas, saidas e ajustes nunca eram conferidos, entao o
 * sistema tinha partidas dobradas por acidente em um dos quatro tipos de movimento.
 */
describe('Invariantes contabeis do ledger', () => {
  const ativos = new Map([['conta', 'MONEY'], ['poupanca', 'MONEY']] as const);
  const comCartao = new Map([['conta', 'MONEY'], ['cartao', 'LIABILITY']] as const);

  it('aceita transferencia entre ativos com duas partidas que se cancelam', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Da conta para a poupanca',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'poupanca', amountCents: 5000 }],
      resourceNatures: ativos,
    })).not.toThrow();
  });

  it('recusa transferencia entre ativos cujas pontas nao se cancelam', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia torta',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'poupanca', amountCents: 4000 }],
      resourceNatures: ativos,
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_NOT_BALANCED' }));
  });

  it('ACEITA liquidacao de passivo com duas partidas negativas (pagamento de fatura)', () => {
    // Pagar fatura debita a conta E reduz a divida do cartao: -X e -X. Exigir soma zero
    // aqui estaria errado — foi o erro da primeira versao da regra.
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Pagamento de fatura: Cartao',
      legs: [{ resourceId: 'conta', amountCents: -2500 }, { resourceId: 'cartao', amountCents: -2500 }],
      resourceNatures: comCartao,
    })).not.toThrow();
  });

  it('recusa liquidacao de passivo com pontas de valores diferentes ou sinal invertido', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Fatura com valores divergentes',
      legs: [{ resourceId: 'conta', amountCents: -2500 }, { resourceId: 'cartao', amountCents: -2000 }],
      resourceNatures: comCartao,
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_LIABILITY_SETTLEMENT_MUST_MATCH' }));

    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Fatura creditando o cartao',
      legs: [{ resourceId: 'conta', amountCents: -2500 }, { resourceId: 'cartao', amountCents: 2500 }],
      resourceNatures: comCartao,
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_LIABILITY_SETTLEMENT_MUST_DEBIT_BOTH' }));
  });

  it('recusa transferencia para o mesmo recurso', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia circular',
      legs: [{ resourceId: 'conta', amountCents: -5000 }, { resourceId: 'conta', amountCents: 5000 }],
      resourceNatures: ativos,
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_SAME_RESOURCE' }));
  });

  it('recusa BENEFIT pago a cartao: liquidacao de passivo exige dinheiro na outra ponta', () => {
    // "Pagar a fatura com vale-alimentacao". O TransferPolicy bloqueia no caso de uso, mas o
    // invariante na fronteira so perguntava "alguma ponta e passivo?" e deixava passar.
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Fatura paga com VR',
      legs: [{ resourceId: 'vr', amountCents: -2500 }, { resourceId: 'cartao', amountCents: -2500 }],
      resourceNatures: new Map([['vr', 'BENEFIT'], ['cartao', 'LIABILITY']] as const),
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_LIABILITY_SETTLEMENT_REQUIRES_MONEY' }));
  });

  it('recusa transferencia entre naturezas ativas diferentes (dinheiro para beneficio)', () => {
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Dinheiro virando VR',
      legs: [{ resourceId: 'conta', amountCents: -2500 }, { resourceId: 'vr', amountCents: 2500 }],
      resourceNatures: new Map([['conta', 'MONEY'], ['vr', 'BENEFIT']] as const),
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_TRANSFER_NATURE_MISMATCH' }));
  });

  it('recusa ajuste que perdoa divida de cartao', () => {
    // Sem esta regra, um ADJUSTMENT negativo no cartao extinguia a divida sem que nenhum
    // dinheiro tivesse saido — o saldo passava a mentir para menos.
    expect(() => assertLedgerInvariants({
      movementType: 'ADJUSTMENT',
      description: 'Perdoando a fatura',
      legs: [{ resourceId: 'cartao', amountCents: -500000 }],
      resourceNatures: new Map([['cartao', 'LIABILITY']] as const),
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_ADJUSTMENT_CANNOT_FORGIVE_LIABILITY' }));

    // Ajuste positivo no cartao (reconhecer compra esquecida) continua permitido.
    expect(() => assertLedgerInvariants({
      movementType: 'ADJUSTMENT',
      description: 'Reconhecendo compra esquecida',
      legs: [{ resourceId: 'cartao', amountCents: 5000 }],
      resourceNatures: new Map([['cartao', 'LIABILITY']] as const),
    })).not.toThrow();
  });

  it('FALHA FECHADA: recusa quando a natureza do recurso e desconhecida', () => {
    // O furo central: um recurso ausente do mapa pulava a conferencia de sinal. Um EXPENSE
    // com sinal positivo apontando para recurso inexistente PASSAVA pelo invariante.
    expect(() => assertLedgerInvariants({
      movementType: 'EXPENSE',
      description: 'Saida em recurso inexistente',
      legs: [{ resourceId: 'fantasma', amountCents: 999999 }],
      resourceNatures: new Map(),
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_UNKNOWN_RESOURCE_NATURE' }));

    // Vale para qualquer tipo: natureza parcialmente conhecida tambem e recusada.
    expect(() => assertLedgerInvariants({
      movementType: 'TRANSFER',
      description: 'Transferencia com uma ponta desconhecida',
      legs: [{ resourceId: 'conta', amountCents: -100 }, { resourceId: 'fantasma', amountCents: 100 }],
      resourceNatures: new Map([['conta', 'MONEY']] as const),
    })).toThrowError(expect.objectContaining({ code: 'LEDGER_UNKNOWN_RESOURCE_NATURE' }));
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
      resourceNatures: new Map([['a', 'MONEY'], ['b', 'MONEY'], ['c', 'MONEY']] as const),
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
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste para cima', legs: [{ resourceId: 'conta', amountCents: 3000 }], resourceNatures: ativos })).not.toThrow();
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste para baixo', legs: [{ resourceId: 'conta', amountCents: -3000 }], resourceNatures: ativos })).not.toThrow();
    expect(() => assertLedgerInvariants({ movementType: 'ADJUSTMENT', description: 'Ajuste nulo', legs: [{ resourceId: 'conta', amountCents: 0 }], resourceNatures: ativos })).toThrowError(expect.objectContaining({ code: 'LEDGER_ZERO_LEG' }));
  });

  it('recusa movimento sem partidas e partida de valor zero', () => {
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Sem partidas', legs: [], resourceNatures: ativos })).toThrowError(expect.objectContaining({ code: 'LEDGER_MOVEMENT_WITHOUT_LEGS' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Partida nula', legs: [{ resourceId: 'conta', amountCents: 0 }], resourceNatures: ativos })).toThrowError(expect.objectContaining({ code: 'LEDGER_ZERO_LEG' }));
    expect(() => assertLedgerInvariants({ movementType: 'EXPENSE', description: 'Centavos fracionados', legs: [{ resourceId: 'conta', amountCents: -10.5 }], resourceNatures: ativos })).toThrowError(expect.objectContaining({ code: 'LEDGER_LEG_NOT_INTEGER' }));
  });
});
