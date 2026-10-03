# D-012 — Operações multi-entidade são atômicas via UnitOfWork

**Status:** Aceita

## Contexto
Seção 41: se qualquer etapa de uma operação multi-entidade falhar, toda a operação deve
sofrer rollback. Exemplo do cenário 59: transferência que grava a saída de A mas falha
antes de gravar a entrada de B nunca pode ficar em estado parcial.

## Decisão
`UnitOfWork.transaction(fn)` embrulha `db.transaction()` do better-sqlite3. Todo caso de
uso que grava mais de uma linha relacionada (transferência = movement + 2 legs + audit log;
ajuste = movement + leg + adjustment + audit log) roda inteiramente dentro de uma única
`transaction()`.

## Consequências
- Se qualquer `INSERT` falhar (constraint, erro de domínio lançado dentro da função),
  o SQLite desfaz tudo automaticamente — nunca existe "meia transferência".
- Testado com um caso de uso que força falha proposital na segunda leg
  (`tests/application/transfer-rollback.test.ts`).
