# D-010 — Ciclo de vida do Movement

**Status:** Aceita

## Contexto
Seção 15 define os estados conceituais `DRAFT, DETECTED, SUGGESTED, CONFIRMED, CANCELLED,
REVERSED`, mas permite que a V1 simplifique o fluxo manual.

## Decisão
O enum completo existe no domínio desde já. A V1 só transita:
```
DRAFT → CONFIRMED
CONFIRMED → CANCELLED
```
`DETECTED`, `SUGGESTED` e `REVERSED` ficam definidos e válidos no tipo, mas sem nenhum
caso de uso que os produza na V1 (seriam usados por OCR/IA no futuro — fora de escopo
agora, ver D-022).

## Consequências
- `BalanceCalculator` só considera legs de movimentos `CONFIRMED`.
- Cancelamento nunca apaga a linha — apenas muda `status` e registra `cancelled_at`/`cancelled_reason`.
