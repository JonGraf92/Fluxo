# Definição de pronto — V1.0

Baseado na seção 55 do Master Build Prompt.

- [ ] Aplicação abre corretamente
- [ ] Banco local funciona e roda migrations automaticamente no primeiro boot
- [ ] Usuário consegue criar núcleo
- [ ] Usuário consegue criar recurso
- [ ] Usuário consegue informar saldo inicial (imutável após — D-020)
- [ ] Usuário consegue criar entrada
- [ ] Usuário consegue criar saída
- [ ] Usuário consegue criar transferência
- [ ] Usuário consegue criar ajuste
- [ ] Saldo é calculado corretamente (soma de legs confirmadas)
- [ ] Transferências não distorcem resultado (patrimônio total do núcleo inalterado)
- [ ] Benefícios são separados de dinheiro em toda a UI (D-023)
- [ ] Histórico persiste após reinicialização
- [ ] Cancelamentos funcionam sem apagar o histórico original
- [ ] Auditoria básica funciona (audit_logs preenchido nas operações relevantes)
- [ ] Exportação (CSV/JSON) funciona
- [ ] Aplicação funciona offline
- [ ] Testes principais passam (`npm test`)
- [ ] Nenhuma operação financeira pode resultar em estado inconsistente (rollback testado)
- [ ] Segurança básica do Electron configurada (ver `docs/security/checklist.md`)
- [ ] Código organizado por responsabilidade (domain/application/infrastructure/UI)

## Cenários financeiros de aceitação (seções 56–59 do Master Build Prompt)

1. Saldo inicial R$ 2.000 + salário R$ 4.000 − supermercado R$ 300 − aluguel R$ 1.200 −
   transferência R$ 500 para poupança → conta corrente R$ 4.000, poupança R$ 500,
   patrimônio total R$ 4.500. Transferência não aparece como despesa.
2. Dinheiro R$ 2.000, VR R$ 800, compra de R$ 200 no VR → dinheiro permanece R$ 2.000, VR
   vira R$ 600. Nunca R$ 2.600.
3. Recurso com R$ 2.000, +R$ 1.000, −R$ 250, transferência de R$ 300 para outro recurso →
   resultado R$ 2.450 no recurso de origem; patrimônio total do núcleo não reduz por causa
   da transferência.
4. Transferência de R$ 500 que falha após debitar a origem e antes de creditar o destino →
   rollback total. Nunca aceitar `A=-500, B=0` como estado final.

Cada cenário acima corresponde a um teste automatizado em `tests/domain` e/ou
`tests/application` — ver seção de testes do README.

## V1.0.1 — Hardening (checklist desta rodada)

- [ ] Exportação inclui os ajustes reais (motivo, não só o efeito numérico) — D-028
- [ ] `local_identity` nunca tem uma segunda linha, mesmo sob uso indevido — D-026
- [ ] `createdByPersonId`/`actorPersonId`/`ownerPersonId` são sempre derivados da
      identidade local no processo `main`, nunca aceitos do payload do renderer — D-024
- [ ] Toda chamada com `nucleusId` no payload é autorizada contra a identidade local antes
      de chegar ao caso de uso; `movement:cancel` (sem `nucleusId` no payload) autoriza a
      partir do núcleo real da movimentação — D-025
- [ ] Existe um único parser de valores monetários no projeto, com gramática explícita,
      usado pelo domínio e pelo renderer — D-027
- [ ] Um renderer que tenta forjar `createdByPersonId` tem o payload inteiro rejeitado
      (schemas `.strict()`) — `tests/security/ipc-identity-spoofing.test.ts`
- [ ] Uma segunda tentativa de onboarding não cria uma segunda identidade/núcleo
      silenciosamente — `tests/application/onboarding-singleton.test.ts`
