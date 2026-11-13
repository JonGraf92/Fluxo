# D-037 — Painel: período livre, gasto por categoria e benefício fora do resultado

**Status:** Aceita

## Contexto
O relatório da A4 (`docs/process/etapa-a-verificacoes.md`) mostrou três lacunas que
impediam responder aos critérios de aceite do plano de validação sem planilha:
- o painel só mostrava o mês de calendário, e o período de teste vai de dia 05 a dia 04;
- não havia total de gasto por categoria em nenhuma tela (critério 3);
- "entradas" e "saídas" do período somavam dinheiro e benefício (VR/VA) no mesmo número,
  o que contraria o princípio do ADR D-023 e distorce "quanto sobrou" (critério 1).

Além disso, o saldo devedor de financiamentos e empréstimos não aparecia em lugar nenhum.

## Decisão
- O painel ganha um período **De/Até** livre, que começa no mês corrente.
- `periodIncomeCents` e `periodExpenseCents` passam a conter **só dinheiro e cartão**.
  Benefício vai para `periodBenefitIncomeCents` e `periodBenefitExpenseCents` e aparece em
  uma linha à parte, fora do "Resultado".
- Compra no cartão continua contando como saída **na data da compra**; pagamento de fatura
  é transferência e não conta de novo.
- Novo `expenseByCategory`: saídas confirmadas do período por categoria, da maior para a
  menor, com dinheiro/cartão e benefício em colunas separadas. "Sem categoria" é uma linha.
- Novo `financingOutstandingCents`: soma das parcelas ainda previstas dos planos ativos.
- A lista de recentes vai só até o fim do período, para que lançamentos com data futura
  (parcelas de cartão) não ocupem o topo.

## Consequências
- Mudou o significado de dois campos existentes do resumo: quem lia `periodIncomeCents`
  como "tudo" passa a ver só dinheiro. O único consumidor era o próprio painel.
- A soma da coluna "Dinheiro e cartão" da tabela é igual ao cartão "Saídas" (coberto por
  teste).
- O percentual por categoria é sobre as saídas em dinheiro e cartão; benefício não entra.
- Recurso arquivado continua contando nos totais do período pela natureza que tinha.
- Não há comparação com período anterior, gráfico nem orçamento por categoria.

## Alternativas consideradas
- Ciclo fixo "dia 05 a dia 04" configurável — rejeitado: é o período do teste, não uma
  regra do produto; o intervalo livre cobre esse e qualquer outro caso.
- Um total único por categoria somando benefício — rejeitado: mistura naturezas (D-023).
- Tela separada de relatórios — rejeitado por ora: o painel responde às três perguntas do
  plano com menos navegação.
