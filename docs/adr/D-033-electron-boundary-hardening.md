# D-033 — Fronteira do Electron: esquema validado antes do SO, destino de arquivo aprovado, origem exata

**Status:** Aceita · **Relacionada:** D-024, D-025, D-030 (mesma diretriz: falhar fechado)

## Contexto

Auditoria independente confirmou três falhas na fronteira do Electron, todas exploráveis a
partir de um renderer comprometido:

**1. `shell.openExternal` sem validar esquema.** A chamada acontecia **antes** do `deny` e
para **qualquer** URL. No Windows, `ms-msdt:` e `search-ms:` são vetores conhecidos de
execução, e `smb://` faz a máquina vazar o hash NTLM para um host arbitrário.

**2. `will-navigate` permissivo.** Aceitava **qualquer** `file://` — inclusive
`file:///.../fluxo.db`, o banco com os dados financeiros do usuário — e o allowlist de
`http://localhost:5173` **não dependia de `isDev`**, permanecendo ativo em produção.

**3. Escrita em caminho arbitrário.** `ExportData` gravava em `destinationPath` vindo do
payload. O `showSaveDialog` existia, mas seu resultado **não era vinculante**: o renderer
podia escolher qualquer caminho do disco e sobrescrever arquivos do usuário.

## Decisão

**1. Esquema validado ANTES de tocar o sistema operacional.** Lista fechada (`http:`,
`https:`); qualquer outro esquema é descartado sem chamada ao SO.

**2. Origem exata para navegação.** O app só pode navegar para o seu próprio entrypoint
(`file://…/dist/index.html`). O servidor de desenvolvimento é aceito **somente** quando
`isDev` é verdadeiro. Adicionado `will-frame-navigate` com a mesma regra, cobrindo
redirecionamentos e âncoras.

**3. Destino de arquivo aprovado pelo usuário.** O processo `main` guarda, por núcleo, o
caminho retornado pelo `showSaveDialog` e **grava sempre nele**, ignorando o payload. Não é
comparação seguida de recusa — é descarte, o que elimina variações de normalização e link
simbólico.

## Consequências

- O renderer deixa de ser fonte confiável para decidir onde escrever, reforçando o princípio
  de D-024 ("identidade nunca vem do renderer") para o domínio de I/O.
- `export:chooseDestination` passou a exigir `nucleusId`, pois o caminho aprovado é guardado
  por núcleo.
- Uma cadeia de exfiltração local — abrir `file://` do banco e enviar para fora via esquema
  registrado — fica fechada nas duas pontas: nem navega, nem entrega ao SO.
- Permanece pendente, para a fase de distribuição: `setPermissionRequestHandler`, tratamento
  de `will-attach-webview` e CSP mais estrita.

## Alternativas consideradas

- **Filtrar o caminho no renderer** — rejeitada: o renderer é exatamente a parte que não pode
  ser confiada; validar ali não protege contra o cenário considerado.
- **Comparar `destinationPath` com o caminho aprovado e recusar se divergir** — rejeitada em
  favor de ignorar o payload: comparação exige normalização correta de caminhos, e um erro
  nessa normalização reabriria a brecha.
