# D-020 — initial_balance_cents é a posição inicial, imutável após a criação do recurso

**Status:** Aceita

## Contexto
Se `initial_balance_cents` pudesse ser editado livremente depois da criação do recurso,
duas pessoas poderiam interpretar isso de formas diferentes: (a) "corrigi um erro de
digitação" ou (b) "o histórico anterior a esta edição deixou de valer" — a segunda
interpretação fecha/reseta o histórico de forma perigosa e silenciosa.

## Decisão
`initial_balance_cents` representa exclusivamente a posição do recurso no momento em que
ele foi cadastrado no Fluxo (a "data de abertura" no sistema). É gravado uma única vez, na
criação do recurso, e o domínio rejeita qualquer tentativa de alterá-lo depois
(`Resource.changeInitialBalance()` não existe — não há caso de uso para isso).
Qualquer correção posterior ao saldo (percebida depois de já haver movimentações) é
obrigatoriamente um `ADJUSTMENT` (ver D-019), auditado e visível no histórico.

## Consequências
- Fórmula de saldo é sempre: `initial_balance_cents + Σ legs confirmadas`. Nunca um número
  solto que alguém sobrescreve.
- Testado explicitamente: `tests/domain/initial-balance-immutability.test.ts` — tentativa
  de alterar o valor inicial após criação deve lançar `DomainError`.
