# D-025 — Autorização consistente de núcleo em toda a fronteira de IPC

**Status:** Aceita — correção de hardening V1.0.1

## Contexto
Os casos de uso filtravam dados por `nucleusId`, mas nada verificava que a pessoa atual
(a identidade local desta instalação) realmente pertencia ao núcleo referenciado pelo
payload. Um `nucleusId` incorreto (por bug ou por payload malicioso) não era rejeitado
antes de chegar à camada de aplicação.

## Decisão
`buildAuthenticatedHandler` (`electron/main/ipc/handlerFactory.ts`) verifica
automaticamente: se o payload validado tiver um campo `nucleusId`, a pessoa derivada de
`local_identity` precisa ter `Membership` nesse núcleo (`assertNucleusAccess`) — senão a
chamada é rejeitada com `ForbiddenError` antes mesmo de `fn` ser executada. Isso cobre,
de forma uniforme, todos os canais cujo payload carrega `nucleusId` (recursos, categorias,
lançamentos, dashboard, exportação).

O único canal de escrita cujo payload não carrega `nucleusId` diretamente é
`movement:cancel` (só tem `movementId`) — para esse caso, `CancelMovement`
(`src/application/use-cases/movement/CancelMovement.ts`) faz a mesma verificação por
conta própria, a partir do núcleo real da movimentação encontrada.

## Consequências
- Um único ponto de aplicação da regra para a maioria dos canais (`handlerFactory.ts`),
  mais uma verificação pontual no único caso de uso que foge do padrão — nenhum canal
  fica sem verificação.
- `CreateResource` já validava isso indiretamente via D-017 (ownership exige membership);
  a checagem genérica de `handleAuthenticated` passou a cobrir isso também na fronteira de
  IPC, então a garantia agora existe em duas camadas para esse canal.
