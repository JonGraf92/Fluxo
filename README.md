# Fluxo

**Seu dinheiro. Em movimento.**

Fluxo é um aplicativo de desktop para controle financeiro pessoal e familiar. Ele é
**local-first**: os dados ficam em um banco SQLite no próprio computador, e o aplicativo
funciona sem internet e sem conta em nenhum serviço.

## Estado do projeto

| | |
|---|---|
| Versão | 1.0.0 |
| Fase | Pré-validação. O período de uso real de 30 dias começa em 05/11/2026 (ver `docs/product/plano-validacao-30-dias.md`) |
| Plataforma | Windows. É a única em que o aplicativo é testado e onde o CI roda |
| Integração contínua | GitHub Actions: lint, verificação de tipos, testes e build a cada push e pull request |
| Uso | Projeto pessoal, sem distribuição pública |

## O que o Fluxo faz

- **Recursos:** contas, dinheiro físico, aplicações (com prazo de liquidez), benefícios
  (VR/VA) e cartões de crédito, cada um com saldo inicial gravado uma única vez.
- **Movimentações:** entradas, saídas, transferências entre recursos e ajustes de saldo
  auditados. Um lançamento confirmado não é apagado; ele pode ser cancelado, com motivo,
  e continua no histórico.
- **Cartão de crédito:** compras entram na fatura correta pelo dia de fechamento; a fatura é
  consolidada e paga a partir de uma conta, com trava contra pagamento em dobro.
- **Financiamentos e empréstimos:** cronograma de parcelas previstas, com baixa de cada
  parcela mediante confirmação. Empréstimos guardam valor emprestado e taxa de juros, e a
  tela mostra o total a pagar e o custo.
- **Painel:** saldos separados por natureza (dinheiro disponível, aplicações, benefícios e
  faturas a pagar), entradas e saídas do mês e movimentações recentes.
- **Pessoas:** mais de uma pessoa no mesmo núcleo financeiro, com o responsável de cada
  lançamento registrado separadamente de quem o digitou.
- **Categorias:** lista padrão de entrada e de saída, com criação de categorias próprias.
- **Backup automático:** cópia conferida do banco ao fechar o aplicativo e uma por dia
  enquanto ele fica aberto, com as 14 mais recentes guardadas na pasta escolhida.
- **Exportação:** CSV e JSON com recursos, categorias e todas as movimentações, inclusive
  as canceladas.
- **Tema** claro e escuro.

## O que ainda não faz

- Parcelamento de compras no cartão de crédito. Hoje cada parcela é lançada no seu mês.
- Total de gastos por categoria nas telas. Disponível apenas pela exportação.
- Período personalizado no painel. Os totais seguem o mês de calendário.
- Saldo devedor de financiamentos e empréstimos no painel.
- Integração bancária (Open Finance), leitura de notas e documentos, sincronização entre
  dispositivos, acesso por celular e login por pessoa.

O que vem depois está em `docs/product/roadmap.md` e na seção 9 do plano de validação.

## Privacidade e proteção dos dados

- Nenhum dado financeiro sai do computador. Não há chamadas de rede para autenticação,
  sincronização, telemetria ou IA (ADR D-001).
- A interface não acessa o banco de dados. Ela conversa com o processo principal por uma
  API mínima, e todo canal valida a entrada antes de executar (ADR D-024, D-025, D-033).
- A pasta de dados da versão 1.0 é separada da pasta usada por versões anteriores, e o
  aplicativo se recusa a abrir a pasta antiga (ADR D-034).
- Os arquivos de backup e de exportação **não são cifrados**. Trate as pastas onde eles
  ficam como dado sensível.

## Requisitos

- Windows 10 ou superior
- Node.js 24 (a versão de referência está em `.nvmrc`; o intervalo aceito, em `package.json`)
- npm 11.16.0

## Instalação

```bash
npm ci
```

`better-sqlite3` é um módulo nativo. Os testes rodam no mesmo runtime do Electron usado pelo
aplicativo, então não é preciso recompilar para alternar entre testar e executar. Se o
módulo falhar ao carregar, use `npm run rebuild:electron`.

## Execução em desenvolvimento

O aplicativo aplica as migrations do banco sozinho ao abrir. Em desenvolvimento, aponte
**sempre** a variável `FLUXO_DATA_DIR` para uma pasta descartável. A pasta
`.fluxo-dev-data/`, na raiz do projeto, está no `.gitignore` para isso.

PowerShell:

```powershell
$env:FLUXO_DATA_DIR = "$PWD\.fluxo-dev-data"
npm run dev
```

bash:

```bash
FLUXO_DATA_DIR="$PWD/.fluxo-dev-data" npm run dev
```

`FLUXO_DATA_DIR` precisa ser um caminho absoluto. Se estiver vazia, for relativa ou apontar
para a pasta de dados de uma versão anterior, o aplicativo mostra um erro e não abre. Para
recomeçar do zero, feche o aplicativo e apague a pasta.

## Testes e qualidade

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes cobrem as regras do domínio, os casos de uso, a fronteira com a interface, as
migrations, o backup e a restauração. Todos usam banco em memória ou pastas temporárias,
com dados fabricados; nenhum teste abre o aplicativo nem toca em dados reais.

Os quatro comandos acima são os mesmos que o CI executa
(`.github/workflows/ci.yml`).

## Build instalável

```bash
npm run dist
```

Gera o instalador em `release/` com o `electron-builder`. O instalador usa a mesma
identidade de versões anteriores do Fluxo: instalar a versão nova substitui o programa
antigo, mas não toca nos dados dele.

## Onde os dados ficam

| Sistema | Caminho |
|---|---|
| Windows | `%APPDATA%\fluxo-v2\fluxo.db` |
| macOS | `~/Library/Application Support/fluxo-v2/fluxo.db` |
| Linux | `~/.config/fluxo-v2/fluxo.db` |

O caminho é resolvido por `src/infrastructure/dataDir.ts` e fixado antes de qualquer banco
ser aberto. A pasta de versões anteriores (`%APPDATA%\fluxo`) nunca é usada: se houver um
banco antigo ali, o aplicativo apenas registra um aviso e não o abre.

## Backup e restauração

- As cópias são feitas pela API de backup do SQLite e conferidas antes de valer. Elas têm o
  nome `fluxo-backup-AAAAMMDD-HHMMSS.db`.
- A pasta de destino é escolhida em **Configurações → Backup automático**. Sem escolha, as
  cópias ficam em `backups`, dentro da pasta de dados, no mesmo disco: escolha uma pasta
  fora do computador, como a de um serviço de armazenamento sincronizado ou um disco externo.
- Falha de backup aparece em um aviso na tela e fica visível em Configurações.
- Não mantenha o `fluxo.db` em uso dentro de uma pasta sincronizada. Use a pasta
  sincronizada apenas como destino das cópias.
- O passo a passo de restauração, com um ensaio que não toca nos dados reais, está em
  `docs/process/restauracao-backup.md`.

## Arquitetura

```
Interface (React)
      │
      ▼
preload (contextBridge: API mínima, sem Node exposto)
      │
      ▼
Processo principal (Electron)
  ├── Canais IPC      valida a entrada com Zod, deriva a identidade, autoriza por núcleo
  ├── Aplicação       casos de uso transacionais
  ├── Domínio         regras financeiras, sem I/O
  └── Infraestrutura  SQLite/Kysely, migrations, backup, exportação
```

| Pasta | Conteúdo |
|---|---|
| `src/domain/` | Entidades, `Money`, ciclo de fatura, cálculo de saldo e invariantes |
| `src/application/` | Casos de uso e portas |
| `src/infrastructure/` | Banco, migrations, repositórios, backup e exportação |
| `src/shared/` | Contrato IPC e parsers de valor |
| `electron/` | Processo principal, canais IPC e preload |
| `renderer/` | Interface React |
| `tests/` | Espelha a estrutura acima |

**Stack:** TypeScript (strict), Electron, React com Vite, SQLite via `better-sqlite3`,
Kysely, Zod e Vitest. A justificativa de cada escolha está em `docs/adr/`.

## Regras que o domínio não quebra

- Dinheiro é sempre inteiro em centavos, nunca ponto flutuante.
- Saldo é derivado das movimentações confirmadas; não é um número editável.
- O saldo inicial de um recurso é gravado uma vez. Correções posteriores são ajustes auditados.
- Histórico confirmado não é apagado, apenas cancelado ou estornado.
- Dinheiro e benefício nunca são somados em um mesmo saldo.
- Transferência não é despesa, e pagamento de fatura não conta a compra duas vezes.
- Operações que tocam mais de um recurso são atômicas.
- Validações de segurança e de contabilidade falham fechado: sem o dado necessário, a
  operação é recusada.
- O esquema do banco só muda por migration nova.

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/adr/` | Decisões de arquitetura, numeradas (D-001 a D-036) |
| `docs/architecture/overview.md` | Arquitetura e modelo de dados |
| `docs/security/checklist.md` | Checklist de segurança do Electron e da aplicação |
| `docs/product/plano-validacao-30-dias.md` | Plano do período de uso real e critérios de aceite |
| `docs/product/roadmap.md` | O que fica para depois |
| `docs/process/etapa-a.md` | Tarefas de preparação para o período de validação |
| `docs/process/etapa-a-verificacoes.md` | Lacunas conhecidas, com referência ao código |
| `docs/process/restauracao-backup.md` | Procedimento de restauração de backup |
| `docs/qa/definition-of-done.md` | Critérios de aceite e cenários financeiros validados |
| `CLAUDE.md` | Regras de trabalho no repositório |

## Como contribuir

- Uma tarefa por branch e por pull request, sem push direto na `main`.
- Toda decisão que muda comportamento ganha um ADR em `docs/adr/`.
- Correção de defeito vem com teste de regressão.
- Lint, verificação de tipos, testes e build precisam passar antes da revisão.

As regras completas estão em `CLAUDE.md`.

## Licença

Projeto de uso pessoal, sem licença de uso ou distribuição (`UNLICENSED`). Todos os
direitos reservados.
