# Fluxo

**Seu dinheiro. Em movimento.**

Fluxo é uma aplicação pessoal de controle financeiro, local-first e privada por padrão.
Os dados financeiros vivem no seu dispositivo. Nada é enviado para servidores externos.

## Status desta entrega

> **Revisão de veracidade (2026-10).** Este bloco foi corrigido: o README afirmava que o
> código "nunca foi compilado nem executado" e citava uma versão (V1.0.1) diferente do
> `package.json` (1.0.0). O projeto **está** versionado, compila, tem CI verde e a suíte
> roda.

Estado real, com evidência de execução:

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | passa |
| `npm test` | **108 testes, 33 arquivos** |
| `npm run build` | passa (Vite + Electron) |
| CI (GitHub Actions, `windows-latest`) | verde |

Repositório: `JonGraf92/Fluxo`. Node 24.21.0 e npm 11.16.0 (ver `.nvmrc` e `package.json`).

**Correção de infraestrutura:** `npm test` usava `electron --run-as-node`, flag que **não
existe** no Electron (o correto é a variável `ELECTRON_RUN_AS_NODE=1`). O comando nunca
havia funcionado, e o `ci.yml` — que o executa — sempre falharia. Os números acima são,
portanto, os **primeiros** resultados reais de teste do projeto.

### Hardening aplicado (ADRs D-024 a D-033)

As cinco correções originais (D-024 a D-028) estão implementadas e testadas. Uma auditoria
independente encontrou depois mais seis defeitos, todos corrigidos com teste de regressão:

1. **Saldo inicial era editável pelo renderer**, violando o ADR D-020 — reescrita de saldo
   sem gerar movimento e **sem aparecer na exportação** (D-029).
2. **Baixa parcial de parcela quitava a dívida inteira** — R$ 0,01 quitava R$ 5.000 (D-031).
3. **TOCTOU no pagamento de fatura** — dois toques debitavam o caixa duas vezes (D-031).
4. **`DeleteFinancingPlan` fazia delete físico** e apagava histórico de parcelas pagas (D-031).
5. **Saldo devedor da fatura era calculado por texto** (`description.startsWith(...)`) —
   renomear ou traduzir a mensagem faria o app cobrar de novo uma fatura já paga (D-032).
6. **O invariante contábil falhava aberto** — natureza de recurso desconhecida pulava a
   verificação, e um `EXPENSE` positivo em recurso inexistente passava. A mesma falha
   existia na autorização de núcleo (D-030).

Somam-se correções de fronteira do Electron: `shell.openExternal` sem validar esquema,
`will-navigate` aceitando qualquer `file://` e exportação gravando em caminho escolhido pelo
renderer (D-033).

> **Achado relevante sobre a suíte:** três testes **sancionavam os defeitos** — afirmavam que
> o comportamento errado era o correto. Corrigir o código sem corrigir esses testes criaria
> um conflito falso, e a "correção" acabaria revertida.

Para rodar localmente:

```bash
npm ci
npm run typecheck
npm test
```

Para abrir o app, veja "Como executar (desenvolvimento)": sempre com `FLUXO_DATA_DIR`
apontando para uma pasta descartável.

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

O app roda as migrations sozinho ao abrir. Em desenvolvimento, aponte **sempre** a variável
`FLUXO_DATA_DIR` para uma pasta descartável. A pasta `.fluxo-dev-data/`, na raiz do projeto,
está no `.gitignore` para isso.

PowerShell:

```powershell
$env:FLUXO_DATA_DIR = "$PWD\.fluxo-dev-data"
npm run dev
```

bash:

```bash
FLUXO_DATA_DIR="$PWD/.fluxo-dev-data" npm run dev
```

Isso sobe o Vite (renderer) e o Electron (main) juntos. Na primeira execução, o Fluxo cria
o banco SQLite nessa pasta e roda as migrations. Para recomeçar do zero, feche o app e
apague a pasta.

`FLUXO_DATA_DIR` precisa ser um caminho absoluto. Definida e vazia, relativa, ou apontando
para a pasta de dados da versão antiga, o app mostra um erro e não abre (ver ADR D-034).

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

- macOS: `~/Library/Application Support/fluxo-v2/fluxo.db`
- Windows: `%APPDATA%\fluxo-v2\fluxo.db`
- Linux: `~/.config/fluxo-v2/fluxo.db`

O caminho é resolvido por `resolveDataDir` (`src/infrastructure/dataDir.ts`) e fixado no
processo principal antes de qualquer banco ser aberto (ADR D-034). A variável de ambiente
`FLUXO_DATA_DIR` troca o local por outro caminho absoluto.

A pasta da versão antiga (`%APPDATA%\fluxo`, que no Windows é a mesma que `%APPDATA%\Fluxo`)
**nunca** é usada: o app recusa abrir se o diretório resolvido for essa pasta, estiver dentro
dela ou se chamar "fluxo". Se houver um `fluxo.db` antigo ali, o app só registra um aviso no
log; não abre nem lê o arquivo.

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
