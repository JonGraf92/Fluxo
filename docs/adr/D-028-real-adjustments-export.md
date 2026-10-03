# D-028 — Exportação inclui os ajustes de verdade

**Status:** Aceita — correção de hardening V1.0.1

## Contexto
`ExportData` sempre retornava `adjustments: []`, com um comentário dizendo que a
informação de auditoria "já estava refletida" no `Movement`/`MovementLeg`. Isso é verdade
para o efeito financeiro (a leg), mas não para o **motivo** do ajuste — que só existe na
tabela `adjustments` — então a exportação, apesar de ser descrita como "completa o
suficiente para reconstruir o histórico" (seção 38), na prática descartava por que cada
ajuste foi feito.

## Decisão
Adicionado `MovementRepository.listAdjustmentsByNucleus(nucleusId)` (join
`adjustments`+`movements` filtrando por núcleo), usado por `ExportData` para popular o
snapshot de verdade. `exportToJson` já serializava o campo `adjustments`; agora ele deixa
de estar sempre vazio. `exportToCsv` ganhou uma coluna `motivo_ajuste`, preenchida quando a
linha corresponde a um `Movement` do tipo `ADJUSTMENT`.

## Consequências
- A exportação agora é, de fato, completa o suficiente para reconstruir por que cada
  ajuste aconteceu, não só o efeito numérico dele.
- Testado em `tests/application/export-adjustments.test.ts` (JSON e CSV).
