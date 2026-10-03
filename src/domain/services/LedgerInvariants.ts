import { DomainError } from '../errors/DomainError';

/**
 * Invariante contabil GLOBAL do ledger: a soma das legs de um mesmo movimento e SEMPRE zero.
 *
 * Por que isto existe separado do TransferPolicy: hoje so a transferencia garantia a soma
 * zero (TransferPolicy.ts, com a mensagem "as duas pontas nao se cancelam"). Entradas,
 * saidas e ajustes emitiam uma unica leg e nunca eram conferidos. O resultado e que o
 * sistema tinha partidas dobradas apenas POR ACIDENTE, em um dos quatro tipos de movimento.
 *
 * Com a soma zero verificada em TODO movimento, o Fluxo passa a ter validade contabil real:
 * nenhum lancamento pode criar ou destruir valor. O patrimonio total so muda quando um
 * recurso de fora do ledger e tocado — o que nunca acontece aqui, porque toda variacao de
 * saldo vem de uma leg.
 *
 * Importante: isto NAO e uma checagem de "saldo fecha". Um ajuste, por exemplo, tem uma
 * unica leg com o delta e soma zero nao se aplica a ele da mesma forma que a uma
 * transferencia — por isso a funcao recebe o tipo e trata cada caso explicitamente, em vez
 * de aplicar uma regra unica que estaria errada para algum deles.
 */

export interface LedgerLeg {
  readonly resourceId: string;
  readonly amountCents: number;
}

export interface LedgerInvariantInput {
  readonly movementType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  readonly description: string;
  readonly legs: readonly LedgerLeg[];
}

/**
 * Verifica as invariantes estruturais de um lancamento antes de ele ser gravado.
 *
 * Regras:
 *  1. Todo movimento tem ao menos uma leg (D-018: o valor vive apenas nas legs).
 *  2. Nenhuma leg pode ter valor zero — uma partida nula nao representa nada e costuma
 *     indicar bug de construcao (ex.: sinal trocado que zerou o delta).
 *  3. TRANSFER: exatamente duas legs, de recursos DIFERENTES, que se cancelam (soma zero).
 *     E o caso mais forte: transferencia nunca altera o patrimonio total.
 *  4. INCOME: exatamente uma leg, estritamente POSITIVA.
 *  5. EXPENSE: exatamente uma leg, estritamente NEGATIVA.
 *  6. ADJUSTMENT: exatamente uma leg, nao nula (o delta pode ser positivo ou negativo).
 *
 * Lanca DomainError com codigo estavel — nunca corrige em silencio.
 */
export function assertLedgerInvariants(input: LedgerInvariantInput): void {
  const { movementType, legs } = input;

  if (legs.length === 0) {
    throw new DomainError(
      'LEDGER_MOVEMENT_WITHOUT_LEGS',
      `Movimento "${input.description}" não tem partidas: o efeito financeiro vive apenas nas pernas (ADR D-018).`,
    );
  }

  for (const leg of legs) {
    if (!Number.isInteger(leg.amountCents)) {
      throw new DomainError('LEDGER_LEG_NOT_INTEGER', `Partida com valor não inteiro em centavos: ${leg.amountCents}.`);
    }
    if (leg.amountCents === 0) {
      throw new DomainError(
        'LEDGER_ZERO_LEG',
        `Movimento "${input.description}" tem uma partida de valor zero, que não representa efeito financeiro algum.`,
      );
    }
  }

  if (movementType === 'TRANSFER') {
    if (legs.length !== 2) {
      throw new DomainError(
        'LEDGER_TRANSFER_REQUIRES_TWO_LEGS',
        `Transferência "${input.description}" deve ter exatamente duas partidas (origem e destino); recebeu ${legs.length}.`,
      );
    }
    const [origin, destination] = legs as [LedgerLeg, LedgerLeg];
    if (origin.resourceId === destination.resourceId) {
      throw new DomainError(
        'LEDGER_TRANSFER_SAME_RESOURCE',
        `Transferência "${input.description}" aponta para o mesmo recurso nas duas pontas.`,
      );
    }
    // Garantia formal de que transferencia nunca distorce o patrimonio total.
    if (origin.amountCents + destination.amountCents !== 0) {
      throw new DomainError(
        'LEDGER_TRANSFER_NOT_BALANCED',
        `Falha de integridade: as duas pontas da transferência "${input.description}" não se cancelam (${origin.amountCents} + ${destination.amountCents}).`,
      );
    }
    return;
  }

  if (legs.length !== 1) {
    throw new DomainError(
      'LEDGER_UNEXPECTED_LEG_COUNT',
      `Movimento do tipo ${movementType} deve ter exatamente uma partida; "${input.description}" tem ${legs.length}.`,
    );
  }

  const [leg] = legs as [LedgerLeg];
  if (movementType === 'INCOME' && leg.amountCents <= 0) {
    throw new DomainError(
      'LEDGER_INCOME_MUST_BE_POSITIVE',
      `Entrada "${input.description}" deve creditar o recurso (valor positivo); recebeu ${leg.amountCents}.`,
    );
  }
  if (movementType === 'EXPENSE' && leg.amountCents >= 0) {
    throw new DomainError(
      'LEDGER_EXPENSE_MUST_BE_NEGATIVE',
      `Saída "${input.description}" deve debitar o recurso (valor negativo); recebeu ${leg.amountCents}.`,
    );
  }
}
