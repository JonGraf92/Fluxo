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
 *  3. TRANSFER entre recursos da MESMA natureza: duas legs que se cancelam (soma zero).
 *  4. TRANSFER que liquida um PASSIVO (pagamento de fatura): duas legs NEGATIVAS.
 *  5. INCOME: exatamente uma leg, estritamente POSITIVA.
 *  6. EXPENSE: exatamente uma leg, com sinal coerente com a NATUREZA do recurso.
 *  7. ADJUSTMENT: exatamente uma leg, nao nula (o delta pode ser positivo ou negativo).
 *
 * Lanca DomainError com codigo estavel — nunca corrige em silencio.
 *
 * NOTA DELIBERADA 1 — EXPENSE: uma saida NAO exige sinal negativo. O sinal depende da
 * natureza do recurso tocado (natureOf):
 *   - recurso de dinheiro/beneficio (ativo)  -> debita, sinal NEGATIVO;
 *   - cartao de credito (PASSIVO)            -> a divida AUMENTA, sinal POSITIVO.
 * A primeira versao desta funcao errou ao exigir sempre sinal negativo, barrando compras
 * no cartao que estavam corretas. A regra certa e de coerencia com a natureza.
 *
 * NOTA DELIBERADA 2 — TRANSFER nao e uma coisa so. O tipo cobre duas operacoes com efeitos
 * patrimoniais OPOSTOS, e a primeira versao desta funcao tambem errou aqui ao exigir soma
 * zero sempre:
 *
 *   a) Transferencia entre ativos (conta -> poupanca): -X e +X. O patrimonio NAO muda;
 *      e justamente por isso a soma das partidas e zero.
 *   b) Liquidacao de passivo (pagar fatura do cartao): -X na conta e -X no cartao. O
 *      patrimonio DIMINUI em 2X, porque a divida e quitada com dinheiro que sai. Exigir
 *      soma zero aqui estaria errado e impediria pagar fatura.
 *
 * As duas se distinguem pela natureza das pontas: se UMA das pontas e passivo, e liquidacao
 * (caso b); se ambas sao da mesma natureza ativa, e transferencia (caso a).
 */

export interface LedgerLeg {
  readonly resourceId: string;
  readonly amountCents: number;
}

export interface LedgerInvariantInput {
  readonly movementType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  readonly description: string;
  readonly legs: readonly LedgerLeg[];
  /**
   * Natureza do recurso de cada partida, para conferir o sinal em INCOME/EXPENSE.
   * Opcional: quando ausente, apenas a cardinalidade e a nao-nulidade sao conferidas.
   */
  readonly resourceNatures?: ReadonlyMap<string, 'MONEY' | 'BENEFIT' | 'LIABILITY'>;
}

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

    const originNature = input.resourceNatures?.get(origin.resourceId);
    const destinationNature = input.resourceNatures?.get(destination.resourceId);
    const involvesLiability = originNature === 'LIABILITY' || destinationNature === 'LIABILITY';

    if (involvesLiability) {
      // Liquidacao de passivo (pagamento de fatura): as DUAS pontas sao negativas — o
      // dinheiro sai da conta e a divida do cartao e reduzida. O patrimonio cai duas vezes.
      if (origin.amountCents >= 0 || destination.amountCents >= 0) {
        throw new DomainError(
          'LEDGER_LIABILITY_SETTLEMENT_MUST_DEBIT_BOTH',
          `Liquidação de passivo "${input.description}" deve debitar as duas pontas (conta e cartão); recebeu ${origin.amountCents} e ${destination.amountCents}.`,
        );
      }
      if (origin.amountCents !== destination.amountCents) {
        throw new DomainError(
          'LEDGER_LIABILITY_SETTLEMENT_MUST_MATCH',
          `Liquidação de passivo "${input.description}" deve debitar o mesmo valor nas duas pontas; recebeu ${origin.amountCents} e ${destination.amountCents}.`,
        );
      }
      return;
    }

    // Transferencia entre ativos: as pontas se cancelam e o patrimonio NAO muda.
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

  if (movementType === 'EXPENSE') {
    const nature = input.resourceNatures?.get(leg.resourceId);
    // Recurso de dinheiro/beneficio: saida debita o ativo, logo negativa.
    if (nature === 'MONEY' || nature === 'BENEFIT') {
      if (leg.amountCents >= 0) {
        throw new DomainError(
          'LEDGER_EXPENSE_MUST_DEBIT_RESOURCE',
          `Saída "${input.description}" em recurso de ${nature === 'BENEFIT' ? 'benefício' : 'dinheiro'} deve debitar o recurso (valor negativo); recebeu ${leg.amountCents}.`,
        );
      }
    }
    // Cartao de credito: e passivo, entao a compra AUMENTA a divida (sinal positivo).
    if (nature === 'LIABILITY' && leg.amountCents <= 0) {
      throw new DomainError(
        'LEDGER_CREDIT_EXPENSE_MUST_INCREASE_LIABILITY',
        `Compra no cartão "${input.description}" deve aumentar o passivo (valor positivo); recebeu ${leg.amountCents}.`,
      );
    }
    // Sem informacao de natureza, nao ha como conferir o sinal sem risco de falso positivo.
  }
}
