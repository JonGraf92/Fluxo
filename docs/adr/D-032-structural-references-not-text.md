# D-032 — Semântica financeira nunca deriva de texto; referências são estruturais

**Status:** Aceita · **Relacionada:** D-027 (mesmo princípio para valores), D-024, D-025

## Contexto

O saldo devedor de uma fatura era calculado reconhecendo pagamentos anteriores por **texto
da descrição**:

```ts
if (movement?.type === 'TRANSFER' && movement.description.startsWith('Pagamento de fatura:') ...)
```

Isso significa que a **regra financeira dependia da string exibida ao usuário**. Três formas
de quebrar, todas silenciosas e todas plausíveis:

- renomear a mensagem em português;
- traduzir a interface (i18n está no roadmap);
- o usuário editar a descrição de um movimento.

Em qualquer uma delas o pagamento **deixaria de ser reconhecido** e a fatura pareceria
continuar em aberto — o app cobraria de novo uma fatura já paga.

O mesmo padrão já havia aparecido em D-027 (parsing monetário com três implementações
divergentes) e reapareceria na captura de nota fiscal, onde uma proposta inicial era
identificar combustível pelo nome do estabelecimento ("POSTO") — frágil pelo mesmo motivo.

## Decisão

**Regra financeira nunca é derivada de texto.** A identificação passa a ser estrutural:

- Nova coluna `movements.card_invoice_resource_id`: o cartão cuja fatura o movimento quitou.
  Nula em todo movimento que não seja pagamento de fatura.
- `PayCreditInvoice` identifica o pagamento por `cardInvoiceResourceId === card.id`, junto de
  `invoiceDueDate` e do cartão presente nas legs.
- A descrição continua existindo **para o usuário ler** — nunca como critério de decisão.
- **Migração 0011** adiciona a coluna com *backfill* do histórico: o texto legado é usado uma
  última vez para reconstruir a referência dos movimentos já gravados, para que o saldo
  devedor não mude após a migração.

## Consequências

- Renomear, traduzir ou editar descrição deixa de afetar cálculo financeiro.
- A coluna permite identificar o cartão da fatura sem varrer movimentos por nome de recurso.
- O backfill é uma **contradição assumida**: conserta a semântica-por-texto reusando
  semântica-por-texto, porque para o histórico não há alternativa. Bancos que já sofriam o
  bug podem carregar a referência errada — por isso a varredura de integridade
  (`integrityScan`) reporta pagamentos que ficaram sem referência estrutural.
- **Regra para o roadmap:** ao classificar combustível na captura de NFC-e, usar **NCM + CST
  de tributação monofásica**, nunca o nome do estabelecimento.

## Alternativas consideradas

- **Coluna booleana `is_invoice_payment`** — rejeitada: não diz *qual* cartão, obrigando a
  cruzar com as legs para descobrir, o que reintroduz ambiguidade.
- **Tabela separada de pagamentos de fatura** — rejeitada no momento: duplicaria a
  responsabilidade do ledger, que já registra o efeito financeiro nas legs (D-018).
