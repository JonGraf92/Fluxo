# D-034 — Diretório de dados da v2 isolado do legado

**Status:** Aceita

## Contexto
O processo principal abria o banco em `app.getPath('userData')`. Esse caminho deriva do
nome do app: `package.json` declara `name: "fluxo"` e `electron-builder.yml` declara
`productName: Fluxo`. No Windows as duas grafias são a mesma pasta, `%APPDATA%\fluxo` —
justamente a pasta da versão anterior, que guarda dados financeiros reais do casal e deve
ficar arquivada só para consulta (plano de validação, PV-02).

O boot chama `runMigrations` sozinho, sem confirmação. O defeito evitado: abrir a versão
nova uma única vez, em desenvolvimento ou instalada, aplicaria as migrations novas sobre o
banco antigo, sem volta. Evidência, por leitura do código: `electron/main/index.ts` passava
`app.getPath('userData')` direto para `openDatabase` e em seguida para `runMigrations`;
não havia nenhum `setPath` nem variável de ambiente no projeto.

## Decisão
- O diretório de dados é resolvido por uma função pura, `resolveDataDir`
  (`src/infrastructure/dataDir.ts`), sem Electron e sem `fs`, que recebe o módulo de
  caminhos (`path.win32` ou `path.posix`) como parâmetro.
- Padrão: `<appData>/fluxo-v2`.
- Override pela variável `FLUXO_DATA_DIR`, aceito só se for caminho absoluto. Variável
  definida e vazia é erro, não "use o padrão".
- Falha fechado. A função lança `DataDirError`, com código, quando o diretório resolvido:
  é `<appData>/fluxo` (`DATA_DIR_IS_LEGACY`); está dentro dele (`DATA_DIR_INSIDE_LEGACY`);
  ou tem "fluxo" como último segmento em qualquer lugar do disco (`DATA_DIR_LEGACY_NAME`).
  As três regras valem também para o override.
- A comparação ignora maiúsculas e minúsculas em todos os sistemas e, no Windows, ignora
  pontos e espaços no fim de cada segmento (`fluxo.` abre `fluxo`).
- O processo principal resolve o diretório no carregamento do módulo, reaplica a
  verificação sobre o caminho real (junctions e symlinks), chama
  `app.setPath('userData', dir)` antes de `app.whenReady()` e passa o diretório ao
  `bootstrap`. Se houver recusa, mostra `dialog.showErrorBox` e encerra com `app.exit(1)`
  sem registrar o `bootstrap`.
- Se existir `fluxo.db` na pasta legada, o app registra um aviso informativo. Verifica só
  a existência do arquivo; nunca abre nem lê.

## Consequências
- Nenhum caminho de execução da v2 abre banco em `%APPDATA%\fluxo`, com ou sem override.
- A v2 começa sempre com banco vazio; os dados antigos só são consultáveis pelo app antigo.
- `productName` e `appId` deixam de influenciar o local dos dados. Continuam definindo o
  nome do executável, a pasta de instalação e a identidade do instalador: com os mesmos
  valores, o instalador da v2 substitui o app antigo instalado. Isso não é tratado aqui.
- Os dados de sessão do Chromium acompanham `userData` e também saem da pasta antiga.
- Uma pasta chamada exatamente "fluxo" é recusada em qualquer lugar, mesmo sem relação com
  o legado. É restrição deliberada: o custo é escolher outro nome.
- Desenvolvimento usa `FLUXO_DATA_DIR` apontando para `.fluxo-dev-data/`, ignorada pelo git.
- Limite conhecido: a verificação compara nomes e caminhos reais; não detecta nome curto
  8.3 do Windows nem uma cópia manual do banco antigo para dentro de `fluxo-v2`.

## Alternativas consideradas
- Renomear `productName` (ou `name`) — rejeitado: o local dos dados continuaria sendo
  efeito colateral de um campo de empacotamento. Em desenvolvimento vale o `name` do
  `package.json`, no instalado vale o `productName`; bastaria esquecer um dos dois, ou
  alguém reverter o nome, para a proteção sumir sem nenhum teste falhar.
- Copiar ou migrar o banco antigo para a pasta nova — rejeitado: contraria a decisão PV-02
  (a versão nova começa do zero, com saldos conferidos) e exigiria abrir o banco real e
  rodar migrations sobre uma cópia dele, exatamente a operação que se quer impedir.
- Confiar só em aviso na documentação — rejeitado: depende de quem abre o app lembrar da
  regra toda vez. Um `npm run dev` distraído bastaria, e o dano não tem desfazer.
