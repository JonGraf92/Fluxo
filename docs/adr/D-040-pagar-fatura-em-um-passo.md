# D-040 — Pagar a fatura em um passo, com a diferença classificada

**Status:** Aceita · **Relacionada:** D-031, D-032

## Contexto
Pagar uma fatura exigia dois passos em telas pouco óbvias: consolidar a fatura em Recursos
e depois registrar o pagamento. O valor era sempre a soma das compras lançadas; se o banco
cobrasse outro valor (juros, uma compra esquecida), não havia como registrar a diferença
no mesmo ato. O plano de validação tinha um desenho proposto para isso (projeto C), e o
dono pediu, em 13/11/2026, que o projeto fosse finalizado.

## Decisão
- Novo caso de uso `SettleCreditInvoice`: **consolida e paga na mesma transação**. O painel
  ganha a seção "Faturas do cartão", com o botão "Pagar fatura" em cada uma.
- O diálogo já vem com o total lançado. O usuário confirma a conta e a data.
- Valor pago **menor** que o lançado é recusado: pagamento parcial não é suportado.
- Valor pago **maior** exige classificar a diferença, que vira uma compra no próprio
  cartão, na mesma fatura e na data do pagamento:
  - "Juros e encargos": categoria de sistema nova, chave `CARD_CHARGES` (migration 0015);
  - "Compra que não lancei": sem categoria.
- A trava contra pagamento em dobro continua sendo a transição condicional do D-031. O
  reenvio da mesma operação não lança a diferença de novo. Qualquer falha (saldo
  insuficiente, fatura já paga) desfaz tudo, inclusive a diferença e a consolidação.
- A conta sugerida é a do **último pagamento daquele cartão**, lida das faturas pagas.
- O painel mostra as seis próximas faturas e a soma das demais ("comprometido").

## Consequências
- O fluxo antigo em dois passos continua em Recursos, para quem quer só consolidar.
- Pagar uma fatura cujo ciclo ainda não fechou a consolida; compras lançadas depois vão
  para a fatura seguinte. É a forma de adiantar uma fatura.
- A despesa da diferença conta no gasto do mês do pagamento, não no mês da compra original.
- A conta precisa ter saldo para o valor inteiro; não há pagamento com duas contas.

## Alternativas consideradas
- Guardar no cartão uma "conta de pagamento padrão" (desenho do plano) — rejeitado: exige
  coluna, migration e tela para um dado que o histórico de faturas pagas já tem.
- Aceitar valor menor e deixar saldo na fatura — rejeitado: é pagamento parcial, com juros
  e rolagem que o app não modela; o casal informou que sempre paga a fatura inteira.
- Lançar a diferença como saída da conta, fora do cartão — rejeitado: a fatura do app
  continuaria diferente da do banco.
- Trocar o fluxo antigo pelo novo em Recursos — adiado: sem ganho para o uso atual.
