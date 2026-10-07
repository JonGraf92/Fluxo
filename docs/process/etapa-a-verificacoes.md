# Etapa A, tarefa A4 — verificações do plano (só relatório)

> **Origem:** seção 10 de `docs/product/plano-validacao-30-dias.md`.
> **Método:** leitura do código na branch `etapa-a/pasta-de-dados`, em 06/10/2026. Nada foi
> implementado nesta tarefa. Onde algo foi confirmado por teste automatizado, está dito.
> **Não verificado:** nenhum item foi conferido clicando no app com dados reais.

---

## 1. Dá para lançar com data anterior ao início do período?

**Sim. Não há limite inferior de data em nenhuma camada.**

- `src/shared/ipc-contract.ts:60` — `IsoDateSchema` só confere o formato `AAAA-MM-DD` e se
  a data existe no calendário.
- `src/application/use-cases/movement/` — nenhuma comparação da data do lançamento com data
  de criação do recurso, de início de período ou "hoje" (busca por `resource.createdAt`,
  `startDate`, `date <` e `date >` nos casos de uso: zero ocorrências).
- `renderer/features/movements/NewMovementModals.tsx:118`, `:260`, `:356`, `:457` — os
  campos de data são `type="date"` sem `min` nem `max`.

**Consequência para o dia zero (plano, 7.3.3):** o lançamento "Fatura anterior ao Fluxo" com
data 31/10/2026 é aceito. Para compra no crédito, a única regra de data é a do corte:
`CreateExpense.ts:90-91` recusa (`INVOICE_BEFORE_CUTOFF`) uma fatura com vencimento anterior
ao primeiro vencimento possível para a data da compra.

**Efeito colateral a conhecer:** também é aceita data futura e data muito antiga por erro de
digitação (por exemplo, 2025 no lugar de 2026). O saldo do recurso considera todos os
lançamentos confirmados, qualquer que seja a data; só os totais do período filtram por data.

## 2. Como o painel agrupa gasto por categoria?

**Não agrupa. Hoje não existe total por categoria em nenhuma tela.**

- `src/application/use-cases/balance/GetDashboardSummary.ts:67-74` — o resumo soma apenas
  dois números do período: entradas (`INCOME`) e saídas (`EXPENSE`). Não há quebra por
  categoria no resultado (`DashboardSummary`, linhas 13-25).
- `renderer/features/dashboard/Dashboard.tsx:95-100` — os cartões do painel são: dinheiro
  disponível, aplicações, benefícios, faturas a pagar, entradas no mês e saídas no mês.
- `renderer/features/movements/MovementsScreen.tsx:83-97` — os filtros da tela de
  Movimentações são tipo, recurso e intervalo de datas. Não há filtro por categoria na
  tela, embora o contrato já aceite `categoryId` (`src/shared/ipc-contract.ts:228`).

**Como responder "para onde foi o dinheiro" hoje:** exportar em CSV (Configurações) e somar
pela coluna `categoria` (`src/infrastructure/export/CsvExporter.ts:30`) numa planilha. Isso
contraria o critério de aceite 3 do plano ("sem planilha"), então **gasto por categoria é
uma lacuna real para o veredito de dezembro**. Não foi implementado: é funcionalidade nova,
e a decisão é do dono.

## 3. Receita lançada em benefício (VR/VA) entra em "quanto sobrou"?

**Sim. Os totais do período não separam por natureza do recurso.**

- `GetDashboardSummary.ts:72` — toda partida de movimento `INCOME` do período entra em
  `periodIncome`, seja em conta, dinheiro ou benefício.
- `GetDashboardSummary.ts:73` — toda partida de movimento `EXPENSE` entra em
  `periodExpense`, inclusive gasto pago com VR/VA e compra no cartão de crédito (que conta
  na data da compra, não no pagamento da fatura).
- Os **saldos**, ao contrário, são separados por natureza (`aggregateByNature`, linhas
  51-56): "Dinheiro disponível" e "Benefícios" nunca se somam (ADR D-023).

**Consequência:** "Entradas no mês − Saídas no mês" mistura dinheiro e benefício. A recarga
mensal do VR conta como entrada e o almoço pago com VR conta como saída. O número fecha,
mas não é "quanto sobrou de dinheiro". Pagamento de fatura é `TRANSFER` e não entra em
nenhum dos dois totais, o que está correto (a compra já contou).

## 4. Existe tela para cadastrar a segunda pessoa? (tarefa A3)

**Sim, já existia. Nada foi implementado; foi acrescentado teste.**

- `renderer/features/settings/SettingsScreen.tsx:112-126` — bloco "Pessoas do núcleo" em
  Configurações, com campo de nome e botão "Adicionar pessoa".
- `electron/main/ipc/handlers/member.handlers.ts` — canais `member:create` e `member:list`,
  autenticados e autorizados por núcleo.
- `renderer/features/movements/NewMovementModals.tsx:107-110` e `:227-230` — o campo
  "Responsável" de entrada e de saída lista as pessoas do núcleo.
- `CreateIncome.ts:57-58` — responsável que não pertence ao núcleo é recusado
  (`MEMBER_NOT_IN_NUCLEUS`).
- **Confirmado por teste:** `tests/application/second-member-responsible.test.ts`.

**Limites observados:** a segunda pessoa entra com papel `MEMBER` e não tem login próprio
(as duas usam a mesma identidade local, conforme PV-10). Não há tela para renomear ou
remover pessoa. Transferência e ajuste não têm campo "Responsável" na tela.

## 5. Achado fora da lista: o "período" do painel é o mês de calendário

- `renderer/features/dashboard/Dashboard.tsx:52-53` — o período do painel é fixo: do
  primeiro dia do mês corrente até hoje. Os rótulos são "Entradas no mês" e "Saídas no mês".

O plano define o primeiro período de teste como **05/11 a 04/12** (PV-06) e o critério de
aceite 1 como "quanto sobrou ou faltou no período". O painel não mostra esse intervalo: em
novembro mostra 01/11 a hoje, e em dezembro zera. A tela de Movimentações aceita intervalo
livre de datas, mas lista os lançamentos; não mostra o total.

Como o lançamento "Fatura anterior ao Fluxo" tem data 31/10, ele fica fora do mês de
novembro no painel, que é o comportamento desejado pelo plano (7.3.3).

## 6. Itens da seção 10 que dependem do dono, não do código

- Datas de vencimento reais dos quatro cartões.
- Regras de antecipação e de arredondamento de parcelas de cada banco.
- **Repositório privado:** em 06/10/2026 o repositório `JonGraf92/Fluxo` estava **público**.
  O plano exige privado. A mudança é feita nas configurações do repositório no GitHub.

## 7. Resumo para decisão

| Item | Situação | Bloqueia o dia zero? |
|---|---|---|
| Data anterior ao início | Aceita | Não |
| Segunda pessoa | Tela existe, coberta por teste | Não |
| Gasto por categoria | Não existe na tela; só via CSV | Não bloqueia lançar; afeta o critério de aceite 3 |
| Receita em benefício | Entra nos totais do período, misturada | Não bloqueia lançar; afeta a leitura do critério 1 |
| Período do painel | Mês de calendário, não 05 a 04 | Não bloqueia lançar; afeta a leitura do critério 1 |
| Repositório privado | Estava público | Decisão do dono, fora do código |
