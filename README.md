# Fluxo

**Seu dinheiro. Em movimento.**

Fluxo é uma aplicação pessoal de controle financeiro, local-first e privada por padrão.
Os dados financeiros vivem no seu dispositivo. Nada é enviado para servidores externos.

## Status desta entrega

Este código passou por duas rodadas: a V1.0.0 (arquitetura completa) e a V1.0.1, um
**hardening obrigatório antes do primeiro uso real**, que corrigiu:

1. Exportação não incluía os ajustes de verdade (só o efeito numérico, não o motivo).
2. `local_identity` não tinha garantia de singleton — uma segunda tentativa de onboarding
   podia criar uma segunda identidade/núcleo silenciosamente.
3. `createdByPersonId`/`actorPersonId`/`ownerPersonId` eram aceitos do payload enviado
   pelo renderer, em vez de derivados da identidade local no processo `main`.
4. Autorização de núcleo não era verificada de forma consistente na fronteira de IPC.
5. Havia três implementações divergentes de parsing de valores monetários, uma delas com
   um bug real de interpretação (`"10.50"` virava R$ 1.050,00).

Os detalhes de cada correção estão em `docs/adr/D-024` a `D-028`, e os testes
correspondentes em `tests/security/` e `tests/application/`.

Nenhuma funcionalidade nova foi adicionada nesta rodada — só correções.

Este código foi escrito integralmente (domínio, aplicação, infraestrutura, IPC, UI e
testes), mas **ainda não foi compilado nem executado** neste ambiente de geração — o
sandbox usado para escrever o projeto não tem acesso à internet para baixar as
dependências do `npm install`. Ele passou por revisão estática (imports, exports,
balanceamento de chaves, consistência de caminhos), mas o primeiro passo real é local:

```bash
npm install
npm run typecheck   # confirma que tudo compila
npm test            # roda os testes de domínio, aplicação e segurança
npm run rebuild:electron && npm run dev   # roda a aplicação de verdade
```

Se o `typecheck` ou os testes acusarem algo, é esperado que sejam ajustes pontuais — a
arquitetura, o modelo de dados e as regras financeiras foram implementados seguindo à
risca o que está documentado em `docs/adr/`.

## Princípios

1. Correção financeira acima de tudo.
2. Segurança.
3. Integridade dos dados.
4. Privacidade.
5. Usabilidade.
6. Manutenibilidade.
7. Performance.
8. Estética.

Regras que o domínio nunca quebra (ver `docs/adr/` para o histórico completo):

- Documento ≠ Movimento.
- OCR/IA ≠ autoridade financeira (não implementado na V1).
- Dinheiro ≠ benefício — nunca somados em um único total.
- Transferência ≠ despesa.
- Compra de cartão ≠ saída imediata (fora do escopo da V1, arquitetura não bloqueia).
- Saldo é sempre derivado de movimentos confirmados, nunca um número editável.
- Histórico confirmado não é apagado — apenas cancelado/estornado, com auditoria.
- Acesso ≠ propriedade. Identidade ≠ pessoa financeira.
- Operações que tocam mais de um recurso são atômicas (tudo ou nada).
- Dados financeiros permanecem locais na V1.

## Stack

- TypeScript (strict) em toda a base
- Electron (desktop, local-first)
- React + Vite (renderer)
- SQLite via `better-sqlite3` (persistência local, síncrona)
- Kysely (query builder tipado, SQL explícito e auditável — sem engine própria como Prisma)
- Zod (validação nas fronteiras: IPC e casos de uso)
- Vitest (testes)

Ver `docs/adr/` para a justificativa de cada escolha.

## Arquitetura

```
Renderer (React)
      │
      ▼
preload (contextBridge — API mínima, sem Node exposto)
      │
      ▼
Main process
  ├── IPC handlers   (valida entrada com Zod)
  ├── Application    (casos de uso)
  ├── Domain         (regras financeiras — sem I/O)
  └── Infrastructure (SQLite/Kysely, filesystem, exportação)
```

Nenhuma regra financeira (cálculo de saldo, transferência ≠ despesa, dinheiro ≠ benefício)
vive na UI ou nos handlers de IPC. Vive só no domínio (`src/domain`), testável sem banco
e sem Electron.

Detalhes completos em `docs/architecture/overview.md`.

## Como instalar

Pré-requisitos: Node.js 24.21.0 e npm 11.16.0. As versões ficam registradas em
`.nvmrc` e em `package.json`; o `.npmrc` rejeita instalações com versões diferentes.

```bash
npm ci
```

### Nota sobre módulo nativo (better-sqlite3)

`better-sqlite3` é um módulo nativo. O comando padrão `npm test` roda no runtime do Electron
fixado pelo projeto, portanto usa a mesma ABI da aplicação e não exige recompilações para
alternar entre testes e uso do app. Use `npm ci` para instalar exatamente as dependências
registradas no `package-lock.json`.

O Electron está fixado em 44.4.5, junto com `better-sqlite3` 13.0.3 e as ferramentas de
rebuild/empacotamento. Essa linha de Electron é suportada atualmente; atualize-a regularmente
para continuar recebendo correções de segurança.

## Como executar (desenvolvimento)

```bash
npm run dev
```

Isso sobe o Vite (renderer) e o Electron (main) juntos. Na primeira execução, o Fluxo cria
o banco SQLite local e roda as migrations automaticamente.

## Como testar

```bash
npm test
```

Cobre domínio (regras financeiras puras), application (casos de uso com banco em memória)
e testes de segurança básicos (validação de entrada, parametrização de queries).

O workflow `.github/workflows/ci.yml` repete a instalação limpa, lint, verificação de tipos,
testes e build em Windows usando as mesmas versões do projeto.

## Como gerar build instalável

```bash
npm run dist
```

Gera o instalável em `release/` via `electron-builder` (dmg/nsis/AppImage conforme o SO).

## Onde os dados ficam

Banco SQLite local, em:

- macOS: `~/Library/Application Support/Fluxo/fluxo.db`
- Windows: `%APPDATA%/Fluxo/fluxo.db`
- Linux: `~/.config/Fluxo/fluxo.db`

(caminho exato definido por `app.getPath('userData')` do Electron — ver `electron/main/index.ts`)

## Backup / exportação

Menu **Configurações → Exportar dados** gera um arquivo CSV e/ou JSON com todas as
movimentações confirmadas e canceladas, recursos e categorias — suficiente para reconstruir
o histórico financeiro fora do Fluxo. Nada é enviado para a nuvem automaticamente.

## Limitações conhecidas da V1.0

- Sem integração bancária / Open Finance.
- Sem cartão de crédito (fatura/parcelamento) — arquitetura preparada, não implementado.
- Sem OCR / captura de documentos — schema não existe ainda nesta versão (ver ADR D-022).
- Sem sincronização em nuvem.
- Sem compartilhamento familiar/multiusuário na interface (o domínio já modela `Membership`
  e papéis, mas a V1 só usa `OWNER`).
- Sem IA financeira / previsões.

Ver `docs/product/roadmap.md` para o que vem depois.

## Documentação

- `docs/architecture/overview.md` — arquitetura e modelo de dados detalhado
- `docs/adr/` — decisões arquiteturais (ADRs), numeradas
- `docs/security/checklist.md` — checklist de segurança do Electron e da aplicação
- `docs/product/roadmap.md` — o que fica para V1.1+
- `docs/qa/definition-of-done.md` — critérios de aceite da V1.0 e cenários financeiros validados
