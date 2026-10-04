# D-029 — Imutabilidade do saldo inicial é garantida pela ESTRUTURA, não por documentação

**Status:** Aceita · **Relacionada:** D-019, D-020 (reforça), D-024, D-025

## Contexto

O ADR D-020 determinava que `initial_balance_cents` fosse gravado uma única vez e nunca mais
alterado. A regra estava escrita em **três lugares**: no próprio D-020, no comentário de
`Resource.ts` e no `docs/architecture/overview.md`.

Mesmo assim, era violada — e pelo caminho mais curto possível:

```
ResourcesScreen.tsx   enviava `initialBalanceCents` em resources.update
  → UpdateResourceSchema aceitava o campo
  → UpdateResource repassava ao repositório
  → KyselyResourceRepository gravava `initial_balance_cents` no SET
  → apenas um audit_log era registrado
```

E `audit_logs` **não entra no `ExportSnapshot`**. O resultado: o saldo do usuário era
reescrito sem gerar `Movement`, sem `Leg`, sem ajuste e **sem aparecer na exportação** —
invisível justamente para quem confia no arquivo exportado para reconstruir o histórico.

Pior: `tests/application/application-resource-liquidity.test.ts` **afirmava que esse
comportamento era o correto** (esperava 250000 → 275000). O teste protegia o defeito: qualquer
correção no código apareceria como regressão.

A D-020 também citava `tests/domain/initial-balance-immutability.test.ts` — **arquivo que
nunca existiu**. A garantia era declarada, não verificada.

## Decisão

A imutabilidade passa a ser **impossível de violar**, em vez de documentada:

1. `ResourceRepository.updateProperties` **não recebe** `initialBalanceCents` — o parâmetro
   não existe na assinatura.
2. `KyselyResourceRepository` **não inclui** `initial_balance_cents` no `SET`.
3. `UpdateResource` não aceita o campo no input.
4. `UpdateResourceSchema` não declara o campo; como o schema é `.strict()`, qualquer payload
   que ainda o envie é **rejeitado** com `INVALID_PAYLOAD`.
5. `ResourcesScreen` exibe o saldo como somente leitura, orientando o caminho correto (ajuste).

O teste que sancionava o defeito foi **invertido**: agora exige que o saldo permaneça
250000, e um caso novo prova que um valor adulterado no payload não altera o banco.

## Consequências

- Correção de saldo existe **apenas** via `CreateAdjustment` (D-019), que gera movimento,
  leg, auditoria e aparece na exportação.
- Um esquecimento futuro não reabre a brecha: não há parâmetro para passar.
- **Lição registrada:** regra que depende de alguém lembrar não é regra. Onde a violação tem
  consequência financeira, a garantia precisa ser estrutural.

## Alternativas consideradas

- **Manter o campo no schema e validar no caso de uso** — rejeitada: foi exatamente o que
  existia, e a validação dependia de o schema ser lembrado.
- **Permitir edição com confirmação explícita na UI** — rejeitada: registrava apenas em
  `audit_logs`, invisível na exportação. Um saldo que muda sem rastro visível é pior que um
  saldo que não muda.
