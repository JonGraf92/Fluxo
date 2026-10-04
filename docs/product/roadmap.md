# Roadmap do produto

## Estado atual (V1.0 — em hardening)

Aplicativo desktop local-first, pessoa física: núcleo financeiro, recursos de naturezas
distintas (dinheiro, benefício, aplicação, cartão), movimentações com partidas dobradas,
transferências, ajustes, exportação. **108 testes, CI verde.**

---

## Decisões de arquitetura irreversíveis — projetar AGORA

Levantadas por consultoria contábil independente (2026-10). O custo de decidir depois é
migração de todo o histórico; o custo de decidir agora é próximo de zero.

### 1. Plano de contas (prioridade máxima)
A lacuna mais cara do modelo. Sem contas não há Patrimônio Líquido, não há DRE, e não há
resposta auditável para *"quanto gastei com saúde em 2025"*.

**Ação:** gravar cada categoria **já com código hierárquico** (ex.: `3.1.02.004` =
Moradia > Energia), seguindo os modelos dos Anexos VII/XI da ITG 1000. Barato agora,
migração completa depois.

### 2. Eixo receita/despesa
O modelo responde *"onde está meu dinheiro"* (saldo por recurso), mas **não** responde
*"vivi dentro do que ganhei"* — a pergunta central de controle financeiro pessoal. A
NBC TG 1002 define receita como **aumento de PL** e despesa como **redução de PL**; o teste
decisivo é o PL, não o caixa.

### 3. Invariante global de período
O invariante atual valida **um lançamento** (cardinalidade, sinal, soma zero). É teste de
sanidade, não partidas dobradas. Faltam:
- `Σativos − Σpassivos = PL` em qualquer ponto no tempo;
- `ΔPL = receitas − despesas` no período.

### 4. Netting × NBC TG 1002 item 2.13
A norma **proíbe compensação** de ativos/passivos e receitas/despesas. A transferência entre
ativos compensa (duas legs que somam zero) — **irrelevante para PF**, mas **conflito
normativo direto** no mundo PJ.

**Direção:** manter legs como **primitiva de caixa** (dá a UX de saldo por recurso) e
**derivar** delas os lançamentos contábeis com contas. Exige que **cada leg carregue
`account_id` desde já**, mesmo que na V1 aponte para a conta do próprio recurso.

### 5. Competência × caixa
A NBC TG 1002 (P10) exige **regime de competência** nas demonstrações. Criar campo de
**data de competência separado** da data de liquidação, mesmo que o PF preencha iguais.

### 6. Retenções
O modelo empresarial precisa permitir **N legs com bruto ≠ líquido**, com a diferença indo
para passivo (o Anexo VII prevê *Tributos Retidos na Fonte*, *Tributos a Recuperar*,
*Retenções a Recolher*).

### 7. Separação PF × PJ
**Dois livros independentes**, com pró-labore como transação **entre** livros. Compartilhar
livro polui o patrimônio pessoal e contamina a escrituração.

> **Teto do produto empresarial:** a ITG 1000 item 23 exige assinatura de **contador com
> CRC** nas demonstrações. O Fluxo **não poderá emitir demonstrações oficiais** — no máximo
> relatórios gerenciais e exportação para o contador. Posicionar assim desde já.

---

## V1.1 — Cartão de crédito, faturas, compromissos, recorrências

**Parcialmente entregue sem ADR** (dívida a sanar): ciclo de fatura, cartão como passivo,
financiamentos com parcelas, aplicações com liquidez. Os ADRs D-029 a D-033 documentaram as
**correções** dessa área, mas falta o ADR que descreve **o próprio modelo**.

**A incluir:** assinaturas e despesas recorrentes com projeção.

## V1.2 — Captura de documento fiscal (nota fiscal)

Decisões já tomadas com o patrocinador:

- **Público: pessoa física.** A versão empresarial (MEI/ME/Simples) vem depois.
- **QR Code da NFC-e é o caminho principal**; OCR de foto é **exceção**, sempre com
  confirmação do usuário.
- **Provedor de consulta** (NFE.io, Nuvem Fiscal, Tecnospeed): integração própria é
  **inviável para PF** — o serviço de distribuição por CPF (`NFeDistribuicaoDFe`) cobre
  apenas NF-e modelo 55, exige **certificado digital do usuário** e **não vê NFC-e**, que é
  exatamente o cupom de mercado.
- **Impostos são informação de leitura**, com caixa colapsável. **Nunca somados ao
  movimento** — já estão dentro do valor pago; somar contaria o mesmo dinheiro duas vezes.
- **Combustível** identificado por **NCM + CST de tributação monofásica**, nunca pelo nome
  do estabelecimento (D-032).
- `Document` ≠ `Movement`: uma compra é **um** movimento com N itens (D-022).
- `chave_acesso` única → digitalizar a mesma nota duas vezes **não duplica**.
- **Proveniência obrigatória**: `QR_SEFAZ` (fato) × `OCR` (palpite) × `MANUAL`.
- Nota **cancelada** é recusada; nota **ainda não disponível** (404) é regra de negócio
  ("tente em alguns minutos"), não erro.
- Disclaimer cirúrgico colado ao painel de impostos: *"Valores informados pela SEFAZ na
  NFC-e. O Fluxo não apura tributos nem substitui contador."*

**Detalhe técnico:** a NT 2025.001 criou o QR Code v3.0 (SHA-256), e as versões **2.0 e 3.0
convivem**. A extração da chave de 44 dígitos é idêntica nas duas.

## V1.3 — Compartilhamento, família, papéis além de OWNER

`Membership` já modela os papéis (D-007), mas a V1 usa só `OWNER`. **A verificação de papel
não existe hoje** — `handlerFactory` confirma apenas a existência do vínculo.

## V1.4 — Previsões, padrões, inteligência assistiva

Sem autoridade financeira automática. Sugestão de IA sempre com confiança explícita e
confirmação humana.

## V2+ — Open Finance, sincronização, IA local

Caminho definido: **CSV/OFX manual primeiro** (para construir e validar o **motor de
conciliação**, que é o componente crítico), depois **agregador** (Pluggy/Belvo/Klavi), e
**nunca** participante direto antes de haver escala — o custo de compliance é permanente e
incompatível com produto pré-tração.

**Riscos registrados:**
- **Conciliação é o produto.** Sem ela o usuário vê o mesmo lançamento duas vezes (digitado
  + extrato) e desinstala no primeiro dia.
- **Custo por usuário:** R$ 5–10 por conta conectada. O preço da assinatura precisa ser
  definido **junto** com a arquitetura, não depois.
- **LGPD/Open Finance:** consentimento granular com finalidade determinada (autorização
  genérica é nula — LGPD art. 8º, §4º), revogável, com **eliminação após revogação**. O
  prazo exato **precisa ser confirmado em fonte primária** do BCB — pendência aberta.
- **Reforma Tributária:** 2026 é fase de testes (CBS 0,9% e IBS 0,1% destacados, sem cobrança
  efetiva). A camada fiscal precisa de **dono da atualização normativa** — erra-se por
  omissão, não por bug.

## Versão empresarial (Simples Nacional, MEI, ME)

Bloqueada pelas decisões irreversíveis da seção 1. Ver também o **teto do produto**.
