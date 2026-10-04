import { DomainError } from '../errors/DomainError';

/**
 * Invariante contabil GLOBAL do ledger, verificado antes de qualquer lancamento ser gravado.
 *
 * DIRETRIZ DE PROJETO — FALHAR FECHADO (fail-closed):
 * toda validacao de seguranca ou de contabilidade deve RECUSAR quando o dado necessario nao
 * estiver disponivel — nunca pular a verificacao. Este arquivo tinha exatamente o defeito
 * oposto: `resourceNatures` era opcional e um recurso nao encontrado simplesmente nao era
 * conferido, de modo que um EXPENSE com sinal positivo apontando para recurso inexistente
 * PASSAVA pelo invariante. Ausencia de dado virava ausencia de validacao.
 *
 * O mesmo padrao aparecia em `handlerFactory.ts` (autorizacao de nucleo condicional a
 * existencia do campo `nucleusId`). Sao a mesma classe de falha, e por isso a regra vale
 * para todo o projeto: o caminho inseguro nao pode ser o caminho silencioso.
 */

export interface LedgerLeg {
  readonly resourceId: string;
  readonly amountCents: number;
}

export type ResourceNatureKind = 'MONEY' | 'BENEFIT' | 'LIABILITY';

export interface LedgerInvariantInput {
  readonly movementType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  readonly description: string;
  readonly legs: readonly LedgerLeg[];
  /**
   * Natureza de CADA recurso referenciado por alguma leg. Obrigatorio e completo: se faltar
   * a natureza de qualquer partida, o invariante LANCA em vez de pular a conferencia.
   * Sem isso a verificacao de sinal falharia aberta (ver diretriz acima).
   */
  readonly resourceNatures: ReadonlyMap<string, ResourceNatureKind>;
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

export function assertLedgerInvariants(input: LedgerInvariantInput): void {
  const { movementType, legs, resourceNatures } = input;

  if (legs.length === 0) {
    throw new DomainError(
      'LEDGER_MOVEMENT_WITHOUT_LEGS',
      `Movimento "${input.description}" não tem partidas: o efeito financeiro vive apenas nas pernas (ADR D-018).`,
    );
  }

  // FALHA FECHADA: a natureza de TODA partida precisa ser conhecida. Antes, um recurso
  // ausente do mapa simplesmente escapava da conferencia de sinal — um EXPENSE positivo
  // apontando para recurso inexistente passava. Recusar aqui e o que impede a ausencia de
  // dado de virar ausencia de validacao.
  for (const leg of legs) {
    if (!resourceNatures.has(leg.resourceId)) {
      throw new DomainError(
        'LEDGER_UNKNOWN_RESOURCE_NATURE',
        `Não foi possível determinar a natureza do recurso ${leg.resourceId} no movimento "${input.description}". A verificação contábil não pode ser feita e o lançamento foi recusado.`,
      );
    }
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

    const originNature = resourceNatures.get(origin.resourceId)!;
    const destinationNature = resourceNatures.get(destination.resourceId)!;
    const involvesLiability = originNature === 'LIABILITY' || destinationNature === 'LIABILITY';

    if (involvesLiability) {
      // Liquidacao de passivo so faz sentido entre DINHEIRO e CARTAO. Sem esta checagem, um
      // TRANSFER de BENEFIT (VR) para LIABILITY (cartao) passava como liquidacao valida —
      // "pagar a fatura com vale-alimentacao". O TransferPolicy bloqueia isso no caso de uso,
      // mas o invariante na fronteira, que existe justamente para pegar caminhos novos de
      // codigo, precisa bloquear tambem.
      const counterpart = originNature === 'LIABILITY' ? destinationNature : originNature;
      if (counterpart !== 'MONEY') {
        throw new DomainError(
          'LEDGER_LIABILITY_SETTLEMENT_REQUIRES_MONEY',
          `Liquidação de passivo "${input.description}" deve ocorrer entre dinheiro e cartão; a outra ponta é ${counterpart}.`,
        );
      }
      // As DUAS pontas sao negativas: o dinheiro sai da conta e a divida do cartao e
      // reduzida. O patrimonio cai duas vezes.
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

    // Transferencia entre ativos: as pontas precisam ser da MESMA natureza (dinheiro com
    // dinheiro, beneficio com beneficio) e se cancelam — o patrimonio NAO muda.
    if (originNature !== destinationNature) {
      throw new DomainError(
        'LEDGER_TRANSFER_NATURE_MISMATCH',
        `Transferência "${input.description}" mistura naturezas diferentes (${originNature} e ${destinationNature}).`,
      );
    }
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
    const nature = resourceNatures.get(leg.resourceId)!;
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
    return;
  }

  if (movementType === 'ADJUSTMENT') {
    // O delta pode ter qualquer sinal (corrige para cima ou para baixo), mas nao pode zerar
    // um PASSIVO: baixar a divida de cartao exige um pagamento real, nao um ajuste. Sem esta
    // regra, um ADJUSTMENT negativo no cartao perdoava a divida inteira sem lastro — e o
    // saldo passava a mentir para menos.
    const nature = resourceNatures.get(leg.resourceId)!;
    if (nature === 'LIABILITY' && leg.amountCents < 0) {
      throw new DomainError(
        'LEDGER_ADJUSTMENT_CANNOT_FORGIVE_LIABILITY',
        `Ajuste "${input.description}" não pode reduzir a dívida de um cartão. Use o pagamento de fatura, que registra a saída do dinheiro.`,
      );
    }
  }
}
