# D-005 — Arquitetura em camadas (Domain / Application / Infrastructure / UI)

**Status:** Aceita

## Contexto
Seção 46 exige separação entre UI, Application, Domain e Infrastructure, com a regra
financeira vivendo no domínio, nunca em componentes React.

## Decisão
```
renderer (UI)  →  electron/main IPC (fronteira validada com Zod)
               →  src/application (casos de uso, orquestração, transação)
               →  src/domain (regras financeiras puras, sem I/O)
               →  src/infrastructure (SQLite/Kysely, filesystem)
```
O domínio não importa nada de `infrastructure` ou `electron`. `application` depende de
`domain` e de interfaces (`ports`) implementadas por `infrastructure`.

## Consequências
- Domínio é testável isoladamente, sem banco e sem Electron (ver `tests/domain`).
- Trocar SQLite por outro banco no futuro exige apenas reimplementar `infrastructure`.

## Alternativas consideradas
- MVC simples dentro do próprio Electron — rejeitado: mistura regra financeira com I/O e
  dificulta o teste unitário exigido na seção 43.
