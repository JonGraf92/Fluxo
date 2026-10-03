# D-003 — SQLite via better-sqlite3 (driver síncrono)

**Status:** Aceita

## Contexto
Operações financeiras críticas (transferência, ajuste) precisam ser atômicas. Drivers
assíncronos de SQLite (ex.: `sqlite3`, `node-sqlite3`) introduzem complexidade de
coordenação entre Promises concorrentes dentro de uma mesma transação.

## Decisão
Usar `better-sqlite3`, que executa de forma síncrona no processo `main` do Electron.
Transações financeiras (`UnitOfWork`) usam `db.transaction(fn)` do better-sqlite3, que já
garante atomicidade real (commit/rollback) no SQLite.

## Consequências
- Chamadas ao banco bloqueiam o processo `main` brevemente — aceitável porque o volume de
  dados de uma pessoa/família é pequeno e o `main` não deve fazer I/O pesado de qualquer forma.
- Simplifica MUITO a implementação de transações atômicas (seção 41 do Master Build Prompt).
- Todas as chamadas de banco ficam na `infrastructure`, nunca no processo `renderer`.

## Alternativas consideradas
- `sqlite3` assíncrono — rejeitado: maior risco de estado intermediário inconsistente em
  operações multi-entidade (ex.: transferência com 2 legs).
