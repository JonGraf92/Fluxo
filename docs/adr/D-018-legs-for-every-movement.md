# D-018 — Toda movimentação financeira é representável como MovementLeg

**Status:** Aceita (generaliza D-009)

## Contexto
A proposta inicial só usava `MovementLeg` explicitamente para transferências. Isso criaria
dois caminhos diferentes de cálculo de saldo: um lendo `movement.amount` diretamente
(entrada/saída) e outro somando legs (transferência) — risco real de inconsistência.

## Decisão
Regra dura do domínio: **toda** `Movement` — INCOME, EXPENSE, TRANSFER ou ADJUSTMENT — tem
pelo menos uma `MovementLeg`. `Movement` nunca guarda um campo `amount` próprio.
- INCOME → 1 leg, `amount_cents` positivo.
- EXPENSE → 1 leg, `amount_cents` negativo.
- TRANSFER → 2 legs (origem negativa, destino positiva).
- ADJUSTMENT → 1 leg (o efeito financeiro real) + 1 `Adjustment` (motivo/contexto).

## Consequências
- `BalanceCalculator` tem uma única implementação, sem `if (type === ...)` para decidir de
  onde vem o valor — sempre soma legs.
- Simplifica preparação para pagamentos divididos e fatura de cartão no futuro (um único
  `Movement` de compra no cartão poderá gerar legs em múltiplos recursos sem mudar o
  modelo).
