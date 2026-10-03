# D-011 — Idempotência via client_operation_id

**Status:** Aceita

## Contexto
Seção 42 exige proteção contra duplicidade (duplo clique, retry, submit repetido),
implementada no backend/domínio, não apenas desabilitando o botão na UI.

## Decisão
Toda operação de escrita que cria um `Movement` (entrada, saída, transferência, ajuste)
recebe um `client_operation_id` (UUID) gerado no renderer no momento em que o usuário
inicia a ação. A tabela `movements` tem `UNIQUE(nucleus_id, client_operation_id)`. Se o
mesmo UUID chegar duas vezes, o caso de uso retorna o `Movement` já existente em vez de
criar um novo — nunca duplica o efeito financeiro.

## Consequências
- Retry de rede, duplo clique ou reenvio acidental nunca transformam R$ 100 em R$ 200.
- Testado explicitamente em `tests/application/idempotency.test.ts`.
