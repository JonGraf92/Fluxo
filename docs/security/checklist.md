# Checklist de segurança — Electron + Fluxo

> **Nota de verificação.** Este checklist era 100% aspiracional: todos os itens marcados
> `[x]`, incluindo um que apontava para `src/infrastructure/logging` — diretório que **nunca
> existiu**. Em 2026-10 uma auditoria independente encontrou três falhas reais de fronteira
> que este documento dava como cumpridas. Ele foi reescrito para registrar **evidência** e
> distinguir o que é verificado do que é pendente.

## Electron — verificado no código
- [x] `nodeIntegration: false` — `electron/main/window.ts`
- [x] `contextIsolation: true` — `electron/main/window.ts`
- [x] `sandbox: true` no renderer — `electron/main/window.ts`
- [x] Preload expõe só `window.fluxo.*` via `contextBridge`, sem API Node direta —
      `electron/preload/index.ts`
- [x] Sem `remote` module
- [x] CSP restritiva no `index.html` do renderer (sem script inline, sem `eval`)
- [x] `webSecurity` habilitado (nunca desabilitado)
- [x] `shell.openExternal` **valida o esquema antes** de chamar o sistema operacional —
      apenas `http:`/`https:`; `ms-msdt:`, `search-ms:` e `smb://` são descartados
      (ADR D-033)
- [x] `will-navigate` e `will-frame-navigate` aceitam **apenas** o próprio entrypoint do
      app; o servidor de desenvolvimento só vale com `isDev` verdadeiro (ADR D-033)
- [x] Exportação grava **somente** no caminho aprovado pelo usuário no diálogo nativo; o
      `destinationPath` do payload é ignorado (ADR D-033)

## Dados — verificado no código
- [x] Todas as queries via Kysely (parametrizadas) — nenhuma concatenação de string SQL
- [x] Validação de entrada com Zod em toda fronteira IPC, antes do caso de uso (schemas de
      mutação usam `.strict()` — campo inesperado é rejeitado, não ignorado)
- [x] `createdByPersonId`/`actorPersonId`/`ownerPersonId` são SEMPRE derivados da identidade
      local no processo `main`, nunca aceitos do payload (ADR D-024)
- [x] **Autorização de núcleo falha FECHADA**: canal sem `nucleusId` precisa declarar
      `authorize` explícito; sem isso a operação é **recusada** (ADR D-030). Antes, a
      ausência do campo significava "sem verificação"
- [x] `local_identity` é singleton garantido em duas camadas — checagem explícita em
      `CompleteOnboarding` e `PRIMARY KEY` fixa (ADR D-026)
- [x] Nenhum dado financeiro sai da máquina (sem telemetry, sem analytics externo)
- [x] Invariantes contábeis verificados na fronteira de persistência, falhando fechado
      (ADR D-030)

## Dados — pendente (não verificado)
- [ ] Logs não incluem CPF, conta, cartão ou valores. **Não há camada de logging
      implementada** — o item anterior apontava para um diretório inexistente. Enquanto não
      existir, a afirmação não pode ser feita. O único log hoje é `console.error` de erro
      inesperado em `handlerFactory.ts`, que registra o objeto de erro, não dados do usuário
- [ ] `dateFrom`/`dateTo` em `ListMovementsSchema` são `z.string()` livre, enquanto
      `IsoDateSchema` existe e é usado em outros schemas — inconsistência de validação
- [ ] Sem `session.setPermissionRequestHandler` nem tratamento de `will-attach-webview`

## Testes de segurança (`tests/security/`)
- [x] Tentativa de acessar recurso de outro núcleo é rejeitada pelo caso de uso
- [x] IDs manipulados (UUID de outro núcleo) não retornam dados de outro contexto
- [x] Entrada maliciosa em campos de texto (ex.: `'; DROP TABLE movements;--`) não afeta o
      banco (garantido pela parametrização do Kysely — testado mesmo assim)
- [x] Payload de IPC malformado é rejeitado pelo Zod antes de qualquer efeito colateral
- [x] Payload com `createdByPersonId` forjado é rejeitado inteiramente —
      `tests/security/ipc-identity-spoofing.test.ts` (ADR D-024)
- [x] Natureza de recurso desconhecida no ledger é recusada — `tests/domain/ledger-invariants.test.ts`
- [x] Varredura de integridade detecta inconsistências pré-existentes no banco —
      `tests/infrastructure/integrity-scan.test.ts`

## Antes de abrir ao público (bloqueante)
- [ ] Política de Privacidade e Termos de Uso (CDC art. 6º, III; LGPD art. 9º)
- [ ] Base legal mapeada para dado de Open Finance e fluxo de eliminação pós-revogação
- [ ] Assinatura de código do instalável
- [ ] Revisão de dependências (SBOM) e política de atualização do Electron
