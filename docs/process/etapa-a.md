# Etapa A — tarefas e prompts para o Claude Code

> **Para quem:** o Claude Code (que não tem memória das conversas anteriores) e o dono do projeto.
> **Fonte das decisões:** `docs/product/plano-validacao-30-dias.md`. Em caso de conflito, o plano e o `CLAUDE.md` valem mais que este arquivo.
> **Prazo:** ponto de decisão em **25/10/2026**. Se A1 a A3 não estiverem prontas, o relógio dos 30 dias passa de 05/11 para 05/12/2026.

---

## 1. Pré-requisitos (dono do projeto)

- [x] **Cópia de segurança de `%APPDATA%\fluxo`** feita e conferida (06/10/2026).
- [ ] Pasta local atualizada: `git switch main` e `git pull`.
- [ ] **Não abrir o Fluxo** (nem o instalado, nem `npm run dev`) até a tarefa A1 estar mergeada. `npm test` é seguro: usa banco em memória.
- [ ] Abrir o Claude Code na pasta do projeto, **em modo de plano**, e colar o prompt da seção 3.

---

## 2. Tarefas, em ordem

Cada uma é uma branch (`etapa-a/<nome-curto>`) e um PR. A ordem importa: **a A1 protege os dados antigos**, e só depois dela é seguro abrir o app.

| # | Tarefa | Pronto quando |
|---|---|---|
| **A1** | **Pasta de dados própria da v2.** Diretório isolado (`fluxo-v2`), override por `FLUXO_DATA_DIR`, recusa do diretório legado. | O app não consegue abrir a pasta antiga; testes cobrem a regra; ADR D-034 escrito; CI verde |
| **A2** | **Backup automático.** Cópia consistente pela API de backup do SQLite ao fechar o app e uma por dia, 14 cópias, destino configurável, verificação de integridade da cópia, falha visível. | Teste de integração gera e valida um backup; falha de destino aparece para o usuário |
| **A3** | **Segunda pessoa no núcleo.** Verificar se existe tela para cadastrar a esposa; se não existir, a menor implementação que permita. | Dá para cadastrar a segunda pessoa e escolhê-la como Responsável |
| **A4** | **Verificações do plano** (seção 10 do plano): lançar com data anterior ao início, como o painel agrupa por categoria, receita em benefício. **Só relatório, sem implementar.** | Relatório curto com evidência (arquivo e linha) para cada item |
| **A5** | **Procedimento de restauração.** Documento passo a passo e teste que restaura um backup e confere os dados. | O dono consegue restaurar seguindo o documento; **concluída antes de 04/11** |

Notas para quando chegar a A2:
- O banco é fechado em `window-all-closed` (`electron/main/index.ts`). O backup precisa rodar **antes** de `closeDatabase`.
- O banco usa WAL; copiar o arquivo com o app aberto pode gerar cópia corrompida. Usar a API de backup do `better-sqlite3`.
- Falha de backup não pode ser silenciosa.

---

## 3. Prompt da tarefa A1

Cole tudo entre as linhas, com o Code em **modo de plano**.

---

Leia, nesta ordem: `CLAUDE.md`, `docs/product/plano-validacao-30-dias.md`, `docs/process/etapa-a.md`, `docs/adr/D-001-local-first.md`, `docs/adr/D-014-kysely-better-sqlite3.md`, `electron/main/index.ts` e `src/infrastructure/db/connection.ts`.

**Tarefa A1: pasta de dados própria da v2.**

**Problema.** Hoje o app abre o banco em `app.getPath('userData')`. O `package.json` nomeia o app `fluxo`, então, em desenvolvimento, a pasta é `%APPDATA%\fluxo`, a mesma da versão antiga, que tem dados financeiros reais do casal. O boot roda `runMigrations` sozinho. Se alguém abrir a versão nova sem esta proteção, as migrations novas rodam em cima dos dados antigos. Isso precisa ser **estruturalmente impossível**, não uma recomendação de documentação.

**O que já foi verificado (por leitura, não por execução):**
- `electron-builder.yml` define `productName: Fluxo`, então o app **instalado** usa o nome "Fluxo" e o de **desenvolvimento** usa "fluxo". No Windows as duas grafias caem na **mesma pasta**. A trava precisa ignorar maiúsculas e minúsculas.
- Em `electron/main/index.ts`, `bootstrap()` chama `app.getPath('userData')` e passa para `openDatabase`. A documentação do Electron diz que, para mudar o local de `userData`, é preciso sobrescrevê-lo **antes** do evento `ready`.
- Em `electron/main/window.ts` e `electron/main/ipc/handlers/export.handlers.ts` não há uso de `app.getPath`. Os demais arquivos do processo principal **não foram lidos**: faça uma busca por `getPath` e `userData` em todo o projeto e liste o resultado no plano.
- O CI (`.github/workflows/ci.yml`) roda em **windows-latest**: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. O PR precisa passar nos quatro.
- `tsconfig.base.json` usa `strict` e `noUncheckedIndexedAccess`. Os testes ficam em `tests/**/*.test.ts` e importam `describe`, `it`, `expect` de `vitest` (`globals: false`).
- O próximo ADR livre é **D-034**. O último existente é o D-033.

**O que fazer.**

1. Criar uma função **pura e testável** que resolve o diretório de dados, em `src/infrastructure/dataDir.ts`. Sugestão de contrato, que você pode ajustar justificando no plano:
   - padrão: `<appData>\fluxo-v2`;
   - override pela variável de ambiente `FLUXO_DATA_DIR`, **só aceito se for caminho absoluto**; valor vazio é erro;
   - **falha fechado:** recusar, lançando erro com código e mensagem claros, se o diretório resolvido (a) tiver o nome `fluxo`, sem diferenciar maiúsculas de minúsculas, (b) for igual a `<appData>\fluxo`, mesmo vindo do override, ou (c) estiver dentro de `<appData>\fluxo`;
   - receber o módulo de caminhos (`path.win32` ou `path.posix`) como parâmetro, para testar o comportamento de Windows em qualquer sistema.
2. No processo principal, resolver o diretório e chamar `app.setPath('userData', ...)` **antes** de `app.whenReady()` e antes de qualquer abertura de banco. Se a função recusar, o app deve **mostrar uma mensagem visível** (por exemplo `dialog.showErrorBox`) e **encerrar**, sem seguir para o `bootstrap`. Passar o diretório resolvido ao `bootstrap` em vez de chamar `app.getPath('userData')` de novo.
3. Se existir um `fluxo.db` no diretório legado, registrar um aviso informativo no log dizendo que há dados legados que **não serão tocados**. Verifique **só a existência** do arquivo. Não o abra e não leia seu conteúdo.
4. Testes unitários da função (`tests/infrastructure/data-dir.test.ts`), cobrindo: padrão; override válido; override relativo recusado; override vazio recusado; `fluxo`, `Fluxo` e `FLUXO` recusados; caminho legado exato recusado mesmo via override; pasta dentro do legado recusada; separadores de Windows e de POSIX.
5. Escrever o **ADR D-034** ("Diretório de dados da v2 isolado do legado") no formato de `docs/adr/template.md`. Registrar o defeito evitado e as **alternativas descartadas**: renomear `productName`, copiar ou migrar o banco antigo, confiar só em aviso na documentação.
6. Adicionar `.fluxo-dev-data/` ao `.gitignore`. Atualizar o `README.md` com a variável `FLUXO_DATA_DIR` e um exemplo de uso em desenvolvimento com essa pasta descartável. Atualizar a regra 1 do `CLAUDE.md` para dizer que a A1 foi concluída.
7. Ler o `electron-builder.yml` e **reportar** se `productName` ou `appId` afetam o diretório de dados do app instalado depois da mudança. **Não altere** esse arquivo.

**O que NÃO fazer.**
- Não migrar, copiar, mover ou ler nenhum banco existente.
- Não rodar o app (`npm run dev`, `npm run dist`, executável instalado). Se precisar rodar para verificar algo, só com `FLUXO_DATA_DIR` apontando para uma pasta descartável dentro do projeto, e **avise o dono antes**.
- Não criar migration, não editar migration existente, não mexer no domínio.
- Não implementar backup (é a A2) nem nada dos projetos B ou C.

**Pronto quando.** `npm test`, `npm run typecheck`, `npm run lint` e `npm run build` passam; a função tem os testes acima; o ADR D-034 existe; nenhum arquivo `*.db*` foi tocado ou versionado.

**Processo.** Comece pelo **plano** e espere aprovação do dono. Trabalhe na branch `etapa-a/pasta-de-dados`. Ao terminar, abra um PR (sem merge) com este relatório: o que mudou, o que foi **verificado** (com o comando e o resultado), o que **não** foi verificado, e os riscos que ainda enxerga.

---

## 4. Como revisar o PR da A1

Antes de aprovar, confira:

- [ ] A função recusa `fluxo` (em qualquer capitalização), o caminho legado e pastas dentro dele (veja os **testes**, não só o código).
- [ ] O app encerra com mensagem visível se o diretório for recusado, em vez de seguir para o `bootstrap`.
- [ ] `app.setPath('userData', ...)` acontece **antes** de `whenReady`.
- [ ] O `.gitignore` ganhou `.fluxo-dev-data/`.
- [ ] Não há nenhum arquivo `.db`, `-wal` ou `-shm` no diff.
- [ ] O CI está **verde** (lint, typecheck, test e build).
- [ ] O relatório do Code diz o que **não** verificou. Se disser que verificou tudo, desconfie.

**Primeira abertura do app depois do merge:** só com `FLUXO_DATA_DIR` apontando para uma pasta descartável (por exemplo `.fluxo-dev-data` dentro do projeto), para ver o app funcionando sem tocar em nenhum dado real. Nenhum teste automático abre o app do Electron; essa conferência é manual.
