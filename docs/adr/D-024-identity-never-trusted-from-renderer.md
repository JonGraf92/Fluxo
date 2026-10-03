# D-024 — createdByPersonId/actorPersonId/ownerPersonId nunca vêm do renderer

**Status:** Aceita — correção de hardening V1.0.1

## Contexto
Até a V1.0.0, os schemas de IPC (`CreateIncomeSchema`, `CreateExpenseSchema`,
`CreateTransferSchema`, `CreateAdjustmentSchema`, `CancelMovementSchema`,
`CreateResourceSchema`) aceitavam `createdByPersonId`/`actorPersonId`/`ownerPersonId`
diretamente do payload enviado pelo renderer. O processo `main` confiava nesse valor sem
verificação. Como o `contextIsolation` protege contra acesso a Node/Electron, mas não
contra o próprio conteúdo JavaScript do renderer ser malicioso ou comprometido (ex.: uma
falha de XSS em uma versão futura com conteúdo externo, ou simplesmente um bug), nada
impedia `window.fluxo.movements.createIncome({ ..., createdByPersonId: 'outro-uuid' })`
de atribuir uma movimentação a uma pessoa arbitrária.

## Decisão
Esses campos foram removidos dos schemas Zod, que agora usam `.strict()` — um payload
com esses campos é REJEITADO (`INVALID_PAYLOAD`), não silenciosamente ignorado. O processo
`main` deriva a pessoa atual exclusivamente de `local_identity` (a identidade singleton
desta instalação, ver D-013/D-026) através de `requireCurrentPerson(repos)`
(`electron/main/ipc/handlerFactory.ts`), e é esse valor — nunca o do payload — que é
passado aos casos de uso via `auth.personId`.

## Consequências
- Um renderer não tem mais como "escolher" quem registrou uma movimentação, mesmo que
  tente enviar o campo.
- `handlerFactory.ts` não importa `electron`, então essa garantia é testável diretamente
  com um banco de teste real, sem precisar de um runtime Electron — ver
  `tests/security/ipc-identity-spoofing.test.ts`.

## Alternativas consideradas
- Confiar no payload mas validar contra uma lista de "pessoas conhecidas" — rejeitado:
  ainda permitiria escolher entre identidades legítimas da instalação; a V1 tem só uma
  pessoa por instalação (D-013), então a resposta correta é nunca aceitar o campo.
