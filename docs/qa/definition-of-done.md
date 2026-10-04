# Definição de pronto — V1.0

Baseado na seção 55 do Master Build Prompt.

> **Nota de verificação (2026-10).** Este checklist tinha todos os itens desmarcados e
> nenhum registro de execução, enquanto o README afirmava que os testes passavam. A partir
> da correção do `npm test`, os itens abaixo que dependem de código foram **verificados por
> execução** e apontam o teste que os comprova. O que não tem evidência continua desmarcado.

## Aplicação e dados

- [ ] Aplicação abre corretamente — **não verificado**: exige execução do Electron, que o
      ambiente de verificação não roda (o binário não inicia sob o sandbox)
- [x] Banco local funciona e roda migrations automaticamente no primeiro boot —
      `tests/infrastructure/migrations.test.ts`
- [x] Usuário consegue criar núcleo — `tests/application/onboarding.test.ts`
- [x] Usuário consegue criar recurso — `tests/application/resource-lifecycle.test.ts`
- [x] Usuário consegue informar saldo inicial (imutável após — D-020) —
      `tests/application/application-resource-liquidity.test.ts` (inclui prova de que o
      valor não muda nem por payload adulterado)
- [x] Usuário consegue criar entrada — `tests/application/movement-category-matrix.test.ts`
- [x] Usuário consegue criar saída — `tests/application/movement-category-matrix.test.ts`
- [x] Usuário consegue criar transferência — `tests/application/transfer.test.ts`
- [x] Usuário consegue criar ajuste — `tests/application/adjustment.test.ts`
- [x] Saldo é calculado corretamente (soma de legs confirmadas) —
      `tests/domain/balance-calculator.test.ts`
- [x] Transferências não distorcem resultado (patrimônio total inalterado) —
      `tests/application/transfer.test.ts`, `tests/domain/transfer-policy.test.ts`
- [x] Benefícios são separados de dinheiro em toda a UI (D-023) —
      `tests/domain/resource-nature-policy.test.ts`, `tests/application/dashboard-summary.test.ts`
- [ ] Histórico persiste após reinicialização — **não verificado**: exige abrir o app duas
      vezes
- [x] Cancelamentos funcionam sem apagar o histórico original —
      `tests/application/cancellation.test.ts`
- [x] Auditoria básica funciona (`audit_logs` preenchido nas operações relevantes) —
      `tests/application/*` (vários casos conferem o registro)
- [x] Exportação (CSV/JSON) funciona — `tests/application/export-adjustments.test.ts`
- [ ] Aplicação funciona offline — **não verificado**: exige execução do app
- [x] Testes principais passam (`npm test`) — **108 testes, 33 arquivos**, CI verde
- [x] Nenhuma operação financeira pode resultar em estado inconsistente (rollback testado) —
      `tests/application/unit-of-work-rollback.test.ts`
- [x] Segurança básica do Electron configurada — `docs/security/checklist.md` (agora com
      evidência e itens pendentes explícitos)
- [x] Código organizado por responsabilidade (domain/application/infrastructure/UI)

## Cenários financeiros de aceitação (seções 56–59)

1. [x] Saldo inicial R$ 2.000 + salário R$ 4.000 − supermercado R$ 300 − aluguel R$ 1.200 −
   transferência R$ 500 → corrente R$ 4.000, poupança R$ 500, patrimônio R$ 4.500.
   Transferência não aparece como despesa — `tests/application/dashboard-summary.test.ts`
2. [x] Dinheiro R$ 2.000, VR R$ 800, compra de R$ 200 no VR → dinheiro R$ 2.000, VR R$ 600.
   Nunca R$ 2.600 — `tests/application/dashboard-summary.test.ts`
3. [x] R$ 2.000, +R$ 1.000, −R$ 250, transferência de R$ 300 → R$ 2.450 na origem;
   patrimônio não reduz pela transferência — `tests/application/idempotency.test.ts`
4. [x] Transferência que falha após debitar a origem → rollback total. Nunca `A=-500, B=0` —
   `tests/application/unit-of-work-rollback.test.ts`

## Hardening — D-024 a D-028 (rodada original)

- [x] Exportação inclui os ajustes reais (motivo, não só o efeito) — D-028 —
      `tests/application/export-adjustments.test.ts`
- [x] `local_identity` nunca tem segunda linha — D-026 —
      `tests/application/onboarding-singleton.test.ts`
- [x] `createdByPersonId`/`actorPersonId`/`ownerPersonId` derivados da identidade local —
      D-024 — `tests/security/ipc-identity-spoofing.test.ts`
- [x] Autorização de núcleo em toda chamada com `nucleusId` — D-025 —
      `tests/security/nucleus-authorization.test.ts`, `tests/security/cross-nucleus-access.test.ts`
- [x] Parser monetário único — D-027 — `tests/domain/money-parsing.test.ts`
- [x] Payload com identidade forjada é rejeitado inteiramente —
      `tests/security/ipc-identity-spoofing.test.ts`
- [x] Segunda tentativa de onboarding não cria segunda identidade —
      `tests/application/onboarding-singleton.test.ts`

## Hardening — D-029 a D-033 (rodada de auditoria independente)

- [x] Saldo inicial imutável de forma **estrutural** — D-029 —
      `tests/application/application-resource-liquidity.test.ts`
- [x] Invariantes contábeis na fronteira de persistência, falhando **fechado** — D-030 —
      `tests/domain/ledger-invariants.test.ts`, `tests/application/ledger-boundary.test.ts`
- [x] Transições de estado condicionais e conferidas (TOCTOU) — D-031 —
      `tests/application/credit-invoice-lifecycle.test.ts`,
      `tests/application/financing-schedule.test.ts`
- [x] Exclusão de financiamento é soft delete, preservando histórico — D-031 —
      `tests/application/financing-deletion.test.ts`
- [x] Semântica financeira nunca deriva de texto — D-032 —
      `tests/application/credit-invoice-lifecycle.test.ts`
- [x] Fronteira do Electron endurecida — D-033 — verificado no código
      (`electron/main/window.ts`), sem teste automatizado de UI
- [x] Varredura de integridade detecta inconsistências pré-existentes —
      `tests/infrastructure/integrity-scan.test.ts`

## Pendências conhecidas (não bloqueiam uso local, bloqueiam uso por terceiros)

- [ ] Validação de data (`dateFrom`/`dateTo`) no contrato de IPC
- [ ] Camada de logging com dado sensível mascarado (hoje não existe)
- [ ] `setPermissionRequestHandler` e tratamento de `will-attach-webview`
- [ ] Cobertura medida com limite mínimo no CI
- [ ] Testes E2E de interface
- [ ] Política de Privacidade, Termos de Uso e base legal para Open Finance
- [ ] Assinatura de código, SBOM e política de atualização do Electron

## Lacunas de modelo identificadas pela consultoria contábil (roadmap)

Registradas aqui para não se perderem; **não** fazem parte da V1.0:

- [ ] **Plano de contas** como tabela de primeira classe, com código hierárquico — sem ele,
      o módulo empresarial exigirá migração total do histórico
- [ ] **Eixo receita/despesa**: hoje há saldo por recurso, mas não a variação patrimonial
      ("vivi dentro do que ganhei")
- [ ] **Invariante global de período**: `Σativos − Σpassivos = PL` e
      `ΔPL = receitas − despesas`
- [ ] **Data de competência** separada da data de liquidação
- [ ] Resolver o *netting*: legs como primitiva de caixa, com lançamentos contábeis
      derivados — a NBC TG 1002 item 2.13 proíbe compensação no mundo PJ
- [ ] Separação rígida PF × PJ (dois livros), com pró-labore como transação entre livros
