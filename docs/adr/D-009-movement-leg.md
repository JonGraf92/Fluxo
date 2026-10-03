# D-009 — Movement + MovementLeg (partidas) como modelo central do ledger

**Status:** Aceita, generalizada por D-018

## Contexto
Seção 34 sugere partidas (legs) para transferências. No refinamento da V1.1, a regra foi
generalizada: TODA movimentação — entrada, saída, transferência ou ajuste — é
representável como uma ou mais `MovementLeg`.

## Decisão
- `Movement` guarda o tipo, status, data, descrição e contexto.
- `MovementLeg` guarda o efeito financeiro real: `resource_id` + `amount_cents` (com sinal).
- INCOME e EXPENSE geram exatamente 1 leg.
- TRANSFER gera exatamente 2 legs (uma negativa, uma positiva) que se cancelam no
  patrimônio total do núcleo.
- ADJUSTMENT gera exatamente 1 leg (o efeito financeiro) + 1 registro em `Adjustment`
  (motivo e contexto de auditoria — ver D-019).

## Consequências
O `BalanceCalculator` tem uma única fonte de verdade para saldo: somar `MovementLeg.amount_cents`
de movimentos `CONFIRMED` por recurso. Não existe lógica paralela de saldo em nenhum lugar.

## Alternativas consideradas
- Guardar `amount` direto em `Movement` sem `MovementLeg` — rejeitado: não representa
  transferências (que afetam 2 recursos) nem prepara o sistema para pagamentos divididos
  e fatura de cartão no futuro (seção 25).
