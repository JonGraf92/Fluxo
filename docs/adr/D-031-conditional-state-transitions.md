# D-031 — Toda transição de estado financeiro é condicional e conferida

**Status:** Aceita · **Relacionada:** D-011, D-012

## Contexto

Três operações financeiras gravavam sem conferir se a escrita **de fato aconteceu**:

**1. Baixa de parcela quitava a dívida por qualquer valor.**
`PayFinancingInstallment` aceitava qualquer inteiro positivo e chamava `markInstallmentPaid`,
que marcava a parcela como `PAID` **sem comparar com `amountCents`**. Pagar 1 centavo quitava
uma parcela de R$ 5.000 — e, sendo a última, o plano inteiro virava `COMPLETED`.
`financing-schedule.test.ts` **sancionava** o defeito: pagava 5500 numa parcela de 5000.

**2. Escrita que não afetava linha nenhuma passava em silêncio.**
`markInstallmentPaid` já tinha `where status = 'PENDING'` (a transição era condicional, sem
TOCTOU), mas o retorno era **ignorado**. Se o `UPDATE` não afetasse nada, a despesa já teria
sido lançada e a auditoria gravada — deixando a parcela `PENDING` com o dinheiro debitado.

**3. TOCTOU no pagamento de fatura.**
`PayCreditInvoice` lia o status (`CLOSED`) e só depois gravava. Entre leitura e escrita havia
uma janela: dois `clientOperationId` **distintos** (dois toques, duas abas) passavam ambos
pela validação, gerando duas `TRANSFER` e **debitando o caixa duas vezes**. A idempotência
por `clientOperationId` não cobre este caso, porque são operações diferentes.

## Decisão

**1. Transição condicional no próprio `UPDATE`.** O estado esperado faz parte do `WHERE`,
eliminando a janela entre ler e gravar:
- `CreditInvoiceRepository.markPaid` usa `where status = 'CLOSED'`.
- `FinancingRepository.markInstallmentPaid` usa `where status = 'PENDING'`.

**2. Escrita que não afeta linha é ERRO.** Ambas devolvem o número de linhas afetadas e o
caso de uso **exige exatamente 1**; caso contrário lança (`INVOICE_STATE_CHANGED`,
`FINANCING_INSTALLMENT_STATE_CHANGED`) e o `UnitOfWork` desfaz tudo.

**3. Baixa de parcela exige o valor integral.** Valor diferente lança
`FINANCING_INSTALLMENT_PARTIAL_NOT_SUPPORTED`. Pagamento parcial de verdade exige um estado
`PARTIALLY_PAID` com saldo devedor, que ainda não existe no modelo — até lá, **recusar é
melhor que dar a dívida por quitada**.

## Consequências

- Nenhuma operação financeira pode "achar" que gravou.
- Os testes que sancionavam os defeitos foram invertidos, e há casos de regressão provando
  que nada é debitado quando a operação é recusada.
- Exclusão de financiamento passou a ser **soft delete** (`status = 'DELETED'`): o `DELETE`
  físico apagava histórico de parcelas já pagas. Plano `COMPLETED` ou com parcela paga é
  recusado, orientando a cancelar as previsões.
- `KyselyFinancingRepository.deletePlan` **foi removido da porta** — a operação deixou de
  existir, em vez de ser desencorajada.

## Alternativas consideradas

- **`SELECT ... FOR UPDATE`** — rejeitada: o SQLite não oferece bloqueio pessimista de linha
  e a arquitetura é local-first; a condição no `UPDATE` resolve com menos complexidade.
- **Confiar no `clientOperationId` para cobrir o duplo pagamento** — rejeitada: os dois
  pagamentos tinham ids distintos e eram operações legítimas do ponto de vista do app.
