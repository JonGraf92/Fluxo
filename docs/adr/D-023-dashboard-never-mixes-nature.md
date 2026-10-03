# D-023 — Dashboard nunca soma dinheiro com benefício em um único total

**Status:** Aceita

## Contexto
Consequência direta de D-008 (Regra 11) aplicada especificamente à camada de apresentação:
é fácil, por conveniência de layout, criar um "saldo total" que some tudo. Isso é
proibido pelo domínio.

## Decisão
O Dashboard (V1) exibe, sempre separados:
1. Saldo por recurso (cada `Resource`, com sua natureza visualmente identificada).
2. Total monetário (`MONEY_ACCOUNT` + `CASH`).
3. Total de benefícios (`BENEFIT`), nunca somado ao total monetário.

Nenhum componente de UI recebe um número já pré-somado entre naturezas diferentes — o caso
de uso `GetBalance`/`GetDashboardSummary` retorna os totais já separados, e a UI apenas
exibe.

## Consequências
- Validado visualmente pelos cenários 56–58 do Master Build Prompt.
- `tests/application/dashboard-summary.test.ts` garante que a soma "dinheiro + benefício"
  nunca aparece em nenhum campo do resultado do caso de uso.
