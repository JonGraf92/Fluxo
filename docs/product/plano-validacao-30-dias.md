# Fluxo — Plano de validação de 30 dias e próximos passos

> **Status:** rascunho v0.1 — 06/10/2026
> **Origem:** sessão de entrevista (grill-me) entre o dono do projeto e o Claude.
> **Onde colocar:** `docs/product/plano-validacao-30-dias.md`
> **Como ler:** as decisões marcadas como **Decidido** foram confirmadas pelo dono do projeto. Itens marcados como **Proposto** foram recomendados, mas não confirmados explicitamente. Itens em **A verificar** dependem de conferência no código ou fora dele.

---

## 1. Objetivo

Usar o Fluxo no dia a dia, com **dados reais do casal**, por 30 dias, e descobrir o que falta de verdade antes de investir em servidor, login, convite de membros e app de celular.

O objetivo **não** é lançar para terceiros nem ampliar o escopo. Tudo o que não ajuda a passar o primeiro fechamento de mês fica congelado.

## 2. Contexto

- App desktop Electron local-first (SQLite, TypeScript, Vite), com a Fase 1 de correções concluída e 108 testes passando no CI.
- O casal já usou uma versão anterior do app. Esses dados **ficam arquivados no app desktop antigo, só para consulta**. A versão nova começa com dados novos.
- Há dois usuários reais (o dono e a esposa) e **quatro cartões de crédito**: três fecham no dia 1 e um fecha no dia 4.
- Disponibilidade de construção: **5 a 10 horas por semana** até a data de partida.

## 3. Decisões consolidadas

| # | Decisão | Estado |
|---|---|---|
| PV-01 | Objetivo imediato: uso real diário pelo casal (não lançamento a terceiros) | Decidido |
| PV-02 | Dados antigos ficam no app antigo; a versão nova começa do zero com saldos conferidos | Decidido |
| PV-03 | Os 30 dias só provam algo se o ponto de partida estiver certo: saldos iniciais conferidos com o banco | Decidido |
| PV-04 | Critério de aceite: três perguntas respondidas num ciclo completo (seção 6) | Decidido |
| PV-05 | Durante os 30 dias, só correção de bug; nada de funcionalidade nova | Decidido |
| PV-06 | O relógio começa em **05/11/2026**, primeiro período de **05/11 a 04/12** (30 dias) | Decidido |
| PV-07 | Ponto de decisão em **25/10/2026**; se a etapa A não estiver pronta, o relógio começa em **05/12/2026** | Proposto |
| PV-08 | Único item obrigatório antes do relógio: etapa A (segurança) | Decidido |
| PV-09 | Parcelas no cartão (B) e botão de pagar fatura (C) são projetos futuros, com desenho preservado | Decidido |
| PV-10 | Nos 30 dias, os dois lançam no mesmo PC e no mesmo usuário do Windows, distinguindo responsável e recurso | Decidido |
| PV-11 | Backup em pasta do Google Drive para computador (privada, acesso restrito) | Decidido |
| PV-12 | Visão de longo prazo: login individual, grupo consolidado, compartilhamento por recurso (seção 9) | Decidido |
| PV-13 | "Quem deve a quem" e a patota de futebol ficam fora do escopo (hipótese futura) | Decidido |

## 4. Escopo

### 4.1 Etapa A — obrigatória antes do relógio (segurança)

1. **Pasta de dados própria** para a versão nova (por exemplo, nome de aplicação distinto como `fluxo-v2`). Motivo: o app lê o banco em `app.getPath('userData')`. Se a versão nova usar a mesma pasta do app antigo, as migrations novas rodam sobre os dados antigos.
2. **Cópia de segurança da pasta antiga** (`%APPDATA%\fluxo`, incluindo `fluxo.db`, `fluxo.db-wal` e `fluxo.db-shm`) **antes de abrir ou atualizar qualquer coisa**.
3. **Backup automático** (seção 8).
4. **Saldos iniciais conferidos** com o banco no dia da partida. O saldo inicial é gravado uma única vez (ADR D-029); correções depois só por ajuste.
5. **Cadastro da segunda pessoa** (esposa) no núcleo.

Estimativa grosseira de esforço (chute, não medido): 2 a 4 horas.

### 4.2 Projeto futuro B — parcelas no cartão (desenho fechado)

Hoje uma compra no cartão é um único lançamento com um valor, uma partida e uma fatura. Não existe campo de parcelas.

Desenho acordado:

- **Cadastro:** valor total e número de parcelas (1 = à vista). Opcional: "ajustar a 1ª parcela". Parcelas iguais; a sobra de centavos fica na primeira parcela por padrão. Pré-visualização antes de gravar ("12 parcelas de R$ 100,00, a 1ª de 12 na fatura de dezembro").
- **Modelo:** reaproveitar o padrão do financiamento. O plano gera **parcelas previstas** (`PENDING`), cada uma amarrada à sua fatura. Na consolidação da fatura, as parcelas do ciclo viram **compras confirmadas** no cartão.
- **Data de cada parcela:** data da compra + (n−1) meses. A parcela precisa ser gravada com a data do mês dela, e não com a data da consolidação.
- **Relatório de gasto:** compra à vista conta na data da compra; cada parcela conta no seu mês. Uma visão separada mostra o **comprometido nos próximos meses**.
- **Antecipação (depois):** mover parcelas previstas para uma fatura anterior. Como são previsão, e não histórico, o princípio de que o histórico confirmado não é editado se mantém.
- **A verificar:** como cada banco trata arredondamento e antecipação (não verificado, inclusive o C6 citado pelo dono do projeto).

Estimativa grosseira: 8 a 14 horas.

### 4.3 Projeto futuro C — botão de pagar fatura (desenho proposto)

Hoje o fluxo exige consolidar a fatura e depois pagá-la; o valor é calculado pela soma das compras lançadas, e o dono do projeto não digita nada.

Desenho proposto:

- Cartão guarda uma **conta de pagamento padrão** (débito em conta ou PIX), definida no cadastro.
- Botão "pagar fatura" na página inicial: já vem preenchido com o total lançado; o usuário só confirma a conta de origem.
- **Fecha e paga na mesma transação**, preservando a trava contra pagamento em dobro (ADR D-031).
- Se o valor for **editado para mais**, o app pede a classificação da diferença ("juros e encargos" ou "compra não lançada") e a registra como despesa no cartão na mesma operação.
- Se for **editado para menos**, o app **recusa** (pagamento parcial não suportado), seguindo a regra já adotada para financiamento.
- O casal informou que **sempre paga a fatura inteira**.
- Histórico: "Pagamento de fatura: Apelido do cartão" (já existe).

Estimativa grosseira: 4 a 8 horas.

### 4.4 Lista de espera (sem decisão, nesta ordem aproximada)

- Adiantamento de faturas e antecipação de parcelas.
- Parcelado com juros (total pago difere do preço da compra).
- **Rótulo da fatura na tela:** propor rotular pelo **vencimento** ("vence em 10/nov"), como o código já faz. O dono usou "fatura de novembro" e "fatura de outubro, paga em novembro" para o mesmo ciclo, o que indica risco de confusão.
- Filtro por pessoa e por categoria na tela de Movimentações; totais por pessoa no painel.
- Login, grupo/família, convite de membros, servidor, app de celular (seção 9).
- Leitura de nota fiscal (QR Code da NFC-e ou foto).
- "Quem deve a quem" e a patota de futebol.
- Congelados do roadmap atual: versão PJ/MEI, Open Finance, IA.

## 5. Regras do período de teste

1. **Congelamento:** só correção de bug. Ideias novas vão para uma lista e esperam o fim do período.
2. **O relógio só reinicia** se uma migration mudar como o histórico já lançado é interpretado (por exemplo, se saldos passados mudarem). Correção de tela ou de texto não reinicia.
3. **Backup antes de cada atualização do app.**
4. **Regra provisória das parcelas** (substitui o projeto B durante o teste): compra parcelada **não** entra pelo total. Todo mês, a parcela do mês entra como compra normal no cartão, com o valor da parcela e "(n/N)" na descrição, só para leitura humana. Isso vale também para as parcelas de compras antigas que ainda estão em andamento. Uma parcela esquecida faz o valor calculado da fatura divergir do banco.
5. **Responsável e recurso:** todo lançamento distingue **quem gastou** (campo Responsável) e **de onde saiu** (conta, cartão ou benefício).

## 6. Critério de aceite

O período termina quando o casal consegue, sem planilha e sem correção manual, responder:

1. **Quanto sobrou ou faltou no período?** Receitas menos despesas (o painel já calcula receita e despesa de um período pela data do movimento).
2. **Os saldos de cada recurso batem com a realidade?** Contas, benefícios e cartões conferidos com o banco.
3. **Para onde foi o dinheiro?** Gastos por categoria, com totais corretos. *(A verificar: o painel atual não mostra gasto por categoria; conferir se há outra tela ou se é preciso exportar.)*

Se alguma resposta exigir correção manual, o que faltou vira o próximo item. O veredito sai por volta de **8 a 12 de dezembro**, quando as quatro faturas do primeiro ciclo estiverem pagas. O mês de calendário de dezembro, comparável com o controle mensal atual, só fecha em janeiro.

## 7. Procedimento do dia zero (05/11/2026)

### 7.1 Regra de corte (verificada em `CreditInvoiceCycle.ts`)

Uma compra feita **no dia do fechamento** entra na fatura que fecha naquele dia. Uma compra do dia **seguinte** vai para a próxima fatura. Com fechamento no dia 1, a fatura de novembro cobre as compras de 02/out a 01/nov; com fechamento no dia 4, cobre 05/out a 04/nov.

### 7.2 Por que 05/11

É o dia seguinte ao último fechamento (04/11). Nesse dia, os quatro cartões têm uma fatura fechada com total visível no aplicativo do banco, e os ciclos em aberto estão quase vazios. Começar em 01/11 exigiria relançar cerca de um mês de compras de quatro cartões.

### 7.3 Passos

1. Fazer a **cópia de segurança** da pasta de dados antiga e confirmar que a versão nova usa pasta própria.
2. Cadastrar os recursos (contas, cartões, benefícios, aplicações) com os **saldos iniciais conferidos com o banco** naquele dia. Cadastrar nos cartões o dia de fechamento e o de vencimento.
3. Para **cada um dos quatro cartões**, um lançamento chamado **"Fatura anterior ao Fluxo"**: no cartão, com o **total da fatura fechada** que o banco mostra, **sem categoria**, com data **31/10/2026**. Pela regra de corte, a data 31/10 cai na fatura correta (a que fecha em 01/11 ou 04/11) e fica **fora do gasto do novo período**.
4. No **vencimento** de cada uma, consolidar e pagar pelo fluxo normal. O cartão zera, a conta cai na data do pagamento e bate com o banco.
5. Lançar individualmente as **compras de 02/11 a 04/11** nos três cartões que fecham no dia 1 (elas pertencem à fatura que fecha em 01/12). O cartão do dia 4 não tem compras no ciclo aberto em 05/11.
6. Confirmar o dia de vencimento de cada fatura e o total no dia 05. *(A verificar: se algum total ainda muda depois do fechamento.)*
7. **A verificar:** o app não impede lançar com data anterior ao início? Conferir antes do dia zero.

## 8. Backup

- **Mecanismo:** usar o backup do próprio SQLite (API de backup do `better-sqlite3`), e não copiar o arquivo com o app aberto. O banco usa WAL, e uma cópia simples pode sair corrompida.
- **Frequência:** uma cópia ao fechar o app e uma por dia se ele ficar aberto; manter as últimas 14.
- **Destino:** pasta dentro do **Google Drive para computador**, com acesso **Restrito** (nunca "qualquer pessoa com o link") e conta com **verificação em duas etapas**. Um HD externo pode complementar.
- **Teste de restauração** antes do dia zero: restaurar uma cópia de verdade e conferir que os dados abrem.
- **Exportação mensal** em CSV/JSON no fechamento, que o app já tem, como segunda proteção em formato legível.
- **Não** deixar o `fluxo.db` vivo dentro de pasta sincronizada: o SQLite pode corromper sem aviso com arquivos auxiliares sincronizados em momentos diferentes e com conflitos entre computadores.

## 9. Visão de longo prazo (após o período de teste)

Nada abaixo entra nos 30 dias. Registra o destino para que as decisões da etapa A não o bloqueiem.

### 9.1 Modelo de dados e compartilhamento

- **Cada pessoa tem login próprio** e sobe seus próprios lançamentos. Os dados são **da pessoa**; o grupo é uma **visão consolidada**. Quem sai do grupo não leva nem deixa o outro sem acesso ao histórico individual.
- **Convite:** cada membro com login recebe um convite para um grupo/família. O grupo consolida os dados do casal, ou de todos os membros.
- **Compartilhamento por recurso:** cada recurso (conta, cartão, benefício) é marcado como compartilhado ou privado. O consolidado soma só o que está compartilhado. Esta escolha vale se não houver necessidade de esconder lançamentos dentro de um mesmo recurso.
- **Regras de desenho a preservar desde já:** um recurso poder pertencer a um **núcleo** (e não só a uma pessoa), e os **papéis** poderem ser mais de um (por exemplo `OWNER`, `TREASURER`, `VIEWER`).
- O domínio já separa pessoa, núcleo financeiro e vínculo (`Membership`), o que sustenta esse desenho.

### 9.2 Servidor e celular

- **Destino:** um app de celular para cada pessoa, com o **computador de casa como servidor**. O Google Drive não executa servidor; serve só como destino de backup.
- **O servidor é a autoridade.** O celular guarda lançamentos offline como **pendentes**, cada um com ID único (UUID) gerado no aparelho; o servidor valida (Zod e invariantes do domínio) e confirma ou rejeita. O saldo exibido offline é uma estimativa, marcada como tal.
- **Offline restrito a receita e despesa simples** (decidido). Pagar fatura, parcelas, financiamentos, edição, cancelamento, criação de categoria e transferências exigem conexão. O celular tem uma cópia só de leitura das categorias.
- **Riscos de usar o PC como servidor:** falha de disco (backup obrigatório), reinício ou suspensão do Windows, queda de energia ou de internet, e segurança (conexão cifrada e privada, por exemplo Tailscale, nunca porta aberta no roteador).
- **Alternativa não escolhida:** nuvem de terceiros (por exemplo Supabase). Preços informados por fontes de terceiros em 2026: plano Free a US$ 0 (500 MB, pausa após 7 dias sem uso) e Pro a US$ 25/mês. **A verificar** em supabase.com/pricing antes de qualquer decisão. Implicaria migrar de SQLite para Postgres e cifrar no cliente.
- **Ordem:** só depois do período de teste, e só depois que o modelo estiver validado. Construir servidor e celular antes significaria mudar o contrato de sincronização com dados reais circulando.

### 9.3 Fora do escopo por enquanto

- **"Quem deve a quem"** e a **patota de futebol** (carteira do grupo, mensalidades, tesoureiro): são um produto diferente, com recurso pertencente ao grupo, papéis distintos e dívidas por membro. Ficam como hipótese de teste do modelo.
- **Leitura de nota fiscal:** o QR Code da NFC-e tende a ser mais confiável que OCR da foto, por trazer dados estruturados. Decidir depois.

## 10. Itens a verificar no código ou fora dele

- [ ] Existe tela para cadastrar a segunda pessoa no núcleo? (O caso de uso `AddNucleusMember` existe.)
- [ ] Como o painel agrupa gasto por categoria, e se há como ver isso hoje.
- [ ] O app aceita lançar com data anterior ao início do período? (Necessário para o passo 7.3.3.)
- [ ] Datas de vencimento reais de cada um dos quatro cartões.
- [ ] A receita lançada em recurso de benefício (VR/VA) entra no cálculo de "quanto sobrou"? O painel soma receita e despesa do período sem separar por natureza.
- [ ] Regras de antecipação e de arredondamento de parcelas de cada banco.
- [ ] Conferir que o repositório está **privado** e que não contém dados reais. Na revisão feita nesta sessão: nenhum arquivo de banco, CSV ou JSON de exportação em todo o histórico (24 commits, de 03 a 04/10/2026), e o `.gitignore` bloqueia `*.db`, `*.sqlite`, `.env` e chaves. Não foi lido o conteúdo de todos os arquivos.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Perda do `fluxo.db` (disco, corrupção) | Backup automático via API do SQLite, destino fora do disco, teste de restauração |
| Versão nova rodar migrations sobre os dados do app antigo | Pasta de dados própria; cópia da pasta antiga antes de abrir qualquer coisa |
| Valor da fatura no app diferente do banco | Fatura anterior consolidada no dia zero; regra provisória das parcelas; conferência a cada fatura |
| Parcela ou compra esquecida | Disciplina de lançamento; conferência com o aplicativo do banco no fechamento |
| Ampliação de escopo durante o teste | Congelamento (PV-05); lista de espera |
| Orçamento de horas insuficiente | Ponto de decisão em 25/10; plano B de partida em 05/12 |
| Vazamento de dados via repositório ou backup | Repositório privado; pasta de backup restrita com verificação em duas etapas; nunca versionar banco |

## 12. Cronograma

| Data | Marco |
|---|---|
| 06/10 | Plano consolidado (este documento) |
| até 25/10 | Etapa A pronta; **ponto de decisão** (se não, partida em 05/12) |
| até 04/11 | Teste de restauração do backup concluído; cartões e recursos cadastrados |
| 05/11 | **Dia zero:** saldos conferidos, quatro faturas anteriores lançadas, início do relógio |
| 05/11 a 04/12 | Período de teste (30 dias), só correção de bug |
| 08 a 12/12 | Veredito pelos três critérios, após o pagamento das quatro faturas do ciclo |

## 13. Histórico de revisões

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 06/10/2026 | Primeira consolidação a partir da sessão de entrevista |
