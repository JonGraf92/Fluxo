# D-021 — Aplicação única, sem arquitetura de monorepo

**Status:** Aceita

## Contexto
A proposta inicial usou o termo "monorepo" para descrever a raiz do projeto, o que sugere
múltiplos pacotes/workspaces — desnecessário para uma única aplicação Electron.

## Decisão
Projeto único (`fluxo/`), um `package.json`, um `tsconfig` base, sem `workspaces` do npm/
pnpm/yarn nem ferramentas de monorepo (Turborepo, Nx, etc.). A separação de camadas
(domain/application/infrastructure/UI) é feita por pastas dentro do mesmo pacote, não por
pacotes npm separados.

## Consequências
- Menos complexidade de build e de configuração.
- Se no futuro o domínio precisar ser reutilizado por outro processo (ex.: um daemon de
  sincronização em V2+), a decisão de extrair pacotes pode ser revisitada — mas não agora.
