# D-006 — Identity ≠ Person (conceito original)

**Status:** Refinada por D-013

## Contexto
Seção 7 do Master Build Prompt exige separar autenticação/identidade do conceito de
pessoa no domínio financeiro, para não usar `user_id` como chave universal.

## Decisão original
Criar uma entidade `Identity` representando a instalação/autenticação, distinta de
`Person`, que representa a pessoa no domínio financeiro.

## Consequências
Ver D-013 para a decisão final sobre o quão mínima essa entidade deve ser na V1.
