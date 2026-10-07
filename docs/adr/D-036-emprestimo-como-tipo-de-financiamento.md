# D-036 — Empréstimo como tipo de financiamento, com condições só de registro

**Status:** Aceita

## Contexto
A tela de Financiamentos só conhecia bens financiados (imóvel, veículo, consórcio), com
prazos presos a listas fixas (12 a 60 meses para veículo, 240 a 420 para imóvel). O dono do
projeto pediu, em 06/10/2026, o tipo **Empréstimo**, com campos para valor emprestado, valor
das parcelas, taxa de juros e vencimento inicial, e o vencimento final calculado pela
quantidade de parcelas.

Um empréstimo não cabia no modelo existente por três motivos verificados no código:
- a quantidade de parcelas não segue lista (`allowedFinancingTerms` e o schema IPC exigiam
  no mínimo 12);
- não havia onde guardar valor emprestado nem taxa (`financing_plans` só tem a parcela);
- todas as parcelas pagas caíam na categoria "Financiamentos", sem separar o que é
  empréstimo.

Duas regras financeiras foram decididas pelo dono antes da implementação: o valor
emprestado **não** altera saldo, e as parcelas usam uma categoria nova, "Empréstimos".

## Decisão
- `LOAN` passa a ser um `FinancingAssetType`. O plano e as parcelas reutilizam
  `financing_plans` e `financing_installments`, e a baixa de parcela é a mesma de
  financiamento (valor cheio, transição condicional — ADR D-031).
- Quantidade de parcelas do empréstimo: qualquer inteiro de 1 a 420. Os demais tipos
  continuam presos às suas listas. O mínimo do schema IPC cai para 1; quem aplica o limite
  por tipo é o caso de uso.
- O plano ganha `loan: LoanTerms | null`, gravado em três colunas novas (migration 0012):
  `principal_amount_cents`, `interest_rate_bps` e `interest_rate_period` (`MONTH` ou `YEAR`).
  A taxa é guardada em centésimos de ponto percentual (1,99% = 199), inteiro, pelo mesmo
  motivo do dinheiro em centavos (ADR D-004).
- **Valor emprestado e taxa são registro.** O cadastro não cria movimento e não muda
  nenhum saldo. Só a baixa de cada parcela movimenta dinheiro.
- A tela mostra o vencimento da última parcela, o total a pagar (parcela × quantidade) e
  "juros e encargos" (total − emprestado). **A taxa não entra em nenhuma conta.**
- Categoria de sistema nova, **"Empréstimos"** (saída): entra na lista padrão dos núcleos
  novos e é criada pela migration 0012 nos que já existem.
- Falha fechado (ADR D-030), em três pontos: no caso de uso, na gravação e na leitura do
  repositório. Empréstimo sem condições válidas é recusado; condições num plano que não é
  empréstimo também são recusadas, não descartadas.
- Empréstimo não vira financiamento, nem o contrário (`FINANCING_TYPE_CHANGE_NOT_ALLOWED`):
  a categoria do plano já está nos lançamentos das parcelas pagas.

## Consequências
- Se o dinheiro do empréstimo caiu numa conta, o usuário lança essa entrada à parte. O app
  não faz isso sozinho, e não existe recurso de passivo para o saldo devedor: o empréstimo
  **não aparece** em "Faturas a pagar" nem em nenhum total do painel.
- O custo mostrado é exato em relação ao que foi digitado, mas não confere se a parcela é
  coerente com a taxa. Uma taxa digitada errada não gera aviso.
- A tela avisa, sem bloquear, quando a soma das parcelas é menor que o valor emprestado.
  Não bloqueia porque um empréstimo sem juros com parcelas arredondadas (R$ 1.000,00 em
  3 × R$ 333,33) cai nesse caso de forma legítima.
- Parcelas com vencimento anterior ao cadastro são consideradas pagas sem lançar saída,
  como já acontecia com financiamento.
- Todas as parcelas têm o mesmo valor previsto. Tabelas com parcela decrescente (SAC) ou
  parcela final diferente não são representadas.
- Feito antes do início do relógio de validação, por pedido explícito do dono; não faz
  parte da etapa A.

## Alternativas consideradas
- Lançar o valor emprestado como entrada na conta, no cadastro — rejeitado pelo dono: a
  entrada contaria em "Entradas no mês" como se fosse receita.
- Reaproveitar a categoria "Financiamentos" — rejeitado pelo dono: não daria para separar
  empréstimo de financiamento depois sem relançar.
- Calcular a parcela a partir da taxa (tabela Price) — rejeitado: bancos embutem IOF e
  tarifas, e o número calculado divergiria do contrato. O usuário informa a parcela real.
- Guardar a taxa como número decimal — rejeitado: mesma classe de erro de arredondamento
  que o projeto já eliminou do dinheiro.
- Criar entidade e telas próprias para empréstimo — rejeitado: duplicaria o cronograma, a
  baixa e as travas do ADR D-031 para um comportamento idêntico.
- Recusar quando a soma das parcelas é menor que o valor emprestado — rejeitado: bloquearia
  o caso legítimo de empréstimo sem juros com arredondamento.
