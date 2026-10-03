# D-007 — Financial Nucleus + Membership com papéis

**Status:** Aceita (fonte de verdade refinada por D-016)

## Contexto
Seção 8 e 9 exigem que o núcleo financeiro seja desacoplado da pessoa via uma relação de
participação (`Membership`), preparando para múltiplos núcleos e papéis futuros
(OWNER, ADMIN, MEMBER, VIEWER, ASSISTED).

## Decisão
`Membership` é uma entidade própria ligando `Person` a `FinancialNucleus` com um `role`.
Na V1, todo núcleo tem exatamente uma `Membership` com `role = OWNER`, criada junto com o
núcleo. Nenhuma tela de convite/permissão é construída na V1.

## Consequências
Ver D-016: `financial_nuclei` não guarda proprietário diretamente — só via `memberships`.
