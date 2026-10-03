# Checklist de segurança — Electron + Fluxo

## Electron (seção 36)
- [x] `nodeIntegration: false` no `BrowserWindow`
- [x] `contextIsolation: true`
- [x] `sandbox: true` no renderer
- [x] Preload expõe só `window.fluxo.*` via `contextBridge`, nenhuma API Node direta
- [x] Sem `remote` module
- [x] CSP restritiva no `index.html` do renderer (sem scripts inline, sem `eval`)
- [x] `webSecurity` habilitado (padrão, nunca desabilitado)
- [x] Navegação externa (`will-navigate`, `setWindowOpenHandler`) bloqueada/whitelisted

## Dados
- [x] Todas as queries via Kysely (parametrizadas) — nenhuma concatenação de string SQL
- [x] Validação de entrada com Zod em toda fronteira IPC, antes de chegar no caso de uso
      (schemas de mutação usam `.strict()` — campos inesperados são rejeitados, não
      silenciosamente ignorados)
- [x] Validação de domínio (invariantes) na camada `domain`, independente da UI
- [x] `createdByPersonId`/`actorPersonId`/`ownerPersonId` são SEMPRE derivados da
      identidade local (`local_identity`) no processo `main` — nunca aceitos do payload
      do renderer (ADR D-024, `electron/main/ipc/handlerFactory.ts`)
- [x] Toda chamada de IPC cujo payload tenha `nucleusId` é autorizada contra a identidade
      local antes de chegar ao caso de uso (ADR D-025); `movement:cancel`, que não carrega
      `nucleusId`, autoriza a partir do núcleo real da movimentação dentro do próprio
      caso de uso
- [x] `local_identity` é um singleton garantido em duas camadas — checagem explícita em
      `CompleteOnboarding` e `PRIMARY KEY` fixa no banco (ADR D-026)
- [x] Nenhum dado financeiro sai da máquina (sem telemetry, sem analytics externo)
- [x] Logs não incluem CPF, número de conta completo, dados de cartão ou valores
      financeiros desnecessários (ver `src/infrastructure/logging`)

## Testes de segurança (seção 44, `tests/security/`)
- [x] Tentativa de acessar recurso de outro núcleo é rejeitada pelo caso de uso
- [x] IDs manipulados (UUID de outro núcleo) não retornam dados de outro contexto
- [x] Entrada maliciosa em campos de texto (ex.: `'; DROP TABLE movements;--`) não afeta o
      banco (garantido pela parametrização do Kysely — testado mesmo assim)
- [x] Payload de IPC malformado é rejeitado pelo Zod antes de qualquer efeito colateral
- [x] Um payload com `createdByPersonId` forjado é rejeitado inteiramente, e uma chamada
      legítima é sempre atribuída à identidade local real —
      `tests/security/ipc-identity-spoofing.test.ts` (ADR D-024)
- [x] Um `nucleusId` sintaticamente válido mas de outro núcleo é rejeitado —
      `tests/security/nucleus-authorization.test.ts` (ADR D-025)
