# D-019 — Ajuste é Movement + MovementLeg + Adjustment (auditoria), sem saldo paralelo

**Status:** Aceita

## Contexto
A proposta inicial tinha `adjustments.previous_value_cents` / `new_value_cents` como se
fossem a fonte do efeito financeiro do ajuste — o que criaria uma segunda lógica de saldo
correndo em paralelo ao `BalanceCalculator` baseado em legs.

## Decisão
Um ajuste é, antes de tudo, um `Movement` comum (`type = ADJUSTMENT`) com sua
`MovementLeg` (o efeito financeiro real: a diferença, com sinal, entre saldo calculado e
saldo físico correto). `Adjustment` deixa de guardar valores de saldo e passa a guardar
apenas contexto de auditoria: motivo, autor, e referência ao `movement_id`.

Exemplo prático (o mesmo do pedido de correção):
```
Saldo calculado:      R$ 1.000,00
Saldo físico correto: R$ 1.050,00
Movement (ADJUSTMENT)
  └── MovementLeg: +5000 centavos no recurso
Adjustment: reason = "Conferência de saldo físico", movement_id = <este movement>
```

## Consequências
- `BalanceCalculator` não precisa saber que `Adjustment` existe — ele só soma legs de
  movimentos `CONFIRMED`, igual para qualquer tipo.
- Auditoria de "por que este ajuste aconteceu" fica disponível sem duplicar a fonte do
  efeito financeiro.
