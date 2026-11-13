# D-039 — Compra parcelada no cartão: uma compra confirmada por mês

**Status:** Aceita · **Diverge do desenho do plano de validação (seção 4.2)**

## Contexto
Uma compra no cartão era um único lançamento, em uma única fatura. A regra provisória do
plano mandava lançar à mão, todo mês, a parcela do mês com "(n/N)" na descrição: uma
parcela esquecida fazia a fatura do app divergir da do banco.

O plano tinha um desenho fechado para isso (projeto B): um plano com parcelas **previstas**
(`PENDING`), que só viram compras confirmadas na consolidação de cada fatura. O dono pediu,
em 13/11/2026, que o projeto fosse finalizado.

Ao implementar, o desenho do plano mostrou dois custos:
- o gasto do mês ficaria errado até a fatura fechar: a 1ª parcela de uma compra de 10/11 só
  apareceria como gasto depois de 01/12, enquanto a mesma compra à vista aparece na hora;
- exigiria uma segunda engrenagem (plano, parcelas, materialização) atravessando a listagem
  de faturas, a consolidação, o pagamento e o painel, duplicando o que o movimento já faz.

## Decisão
- A compra parcelada grava **N compras confirmadas** de uma vez, na mesma transação.
- Parcela `n` tem a data da compra mais `n−1` meses (sem derrapar no fim do mês) e entra na
  fatura seguinte à da parcela anterior. Fatura já consolidada é pulada.
- Parcelas iguais; a sobra de centavos fica na primeira. A soma é sempre o total.
- As parcelas compartilham `installment_group_id` e guardam posição e total (`n` de `N`) em
  colunas próprias. O "(n/N)" na descrição é só leitura (D-032).
- De 1 a 48 parcelas, só no cartão de crédito. A 1ª usa o id da operação: reenvio não duplica.
- Cancelar: uma parcela, ou todas as ainda confirmadas da compra, com o mesmo motivo. Nada
  é apagado.

## Consequências
- O gasto de cada mês conta só a parcela daquele mês, desde o lançamento.
- O saldo do cartão ("Cartões a pagar") passa a mostrar a **dívida inteira**, incluindo
  parcelas futuras. É o "limite utilizado" do banco, não a fatura atual. A fatura de cada
  mês continua visível na lista de faturas, que já mostra os meses seguintes
  ("comprometido").
- Parcelas com data futura aparecem na tela de Movimentações. O painel as deixa fora da
  lista de recentes.
- Antecipar uma parcela = cancelá-la e lançar a compra na fatura desejada.
- Não há "ajustar a 1ª parcela" nem parcelado com juros: o valor informado é o total pago.
- Detalhes de combustível, se houver, ficam na 1ª parcela.

## Alternativas consideradas
- Parcelas previstas que viram compra na consolidação (desenho do plano) — rejeitado pelos
  dois custos acima. O que ele protegia (não editar histórico confirmado na antecipação) é
  atendido por cancelar e relançar, que deixa rastro.
- Um lançamento pelo total na fatura da compra — rejeitado: a fatura do mês ficaria maior
  que a do banco.
- Guardar só "(n/N)" na descrição — rejeitado: regra por texto (D-032).
