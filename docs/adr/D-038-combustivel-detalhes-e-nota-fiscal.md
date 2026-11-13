# D-038 — Combustível: detalhes do abastecimento, prontos para a nota fiscal

**Status:** Aceita · **Relacionada:** D-022, D-032

## Contexto
O dono do projeto pediu, em 06/10/2026, a categoria **Combustível**: além do valor total,
preço por litro e hodômetro, ambos opcionais. Pediu também que a estrutura já receba, sem
retrabalho, o que a captura de nota fiscal vai trazer (QR Code da NFC-e ou foto): nome do
posto, CNPJ, endereço, data, combustível, valor total, valor por litro e o total de
impostos com cada imposto discriminado.

Duas regras anteriores limitam o desenho. O D-032 proíbe decidir por texto: a categoria não
pode ser reconhecida pelo nome "Combustível". O roadmap da captura fiscal diz que imposto é
informação de leitura, nunca somado ao movimento, e que toda informação tem proveniência.

## Decisão
- `categories.system_key` identifica categorias com regra própria. Combustível é `FUEL`. O
  nome pode mudar; a chave não. Há no máximo uma categoria por chave em cada núcleo.
- Tabela `fuel_details`, 1:1 com o movimento de saída: combustível, preço por litro em
  **milésimos de real** (bomba usa três casas), volume em mililitros, hodômetro, posto,
  CNPJ, endereço, total de impostos, proveniência e chave de acesso. `fuel_detail_taxes`
  guarda cada imposto.
- Tudo ali é **leitura**. O valor pago continua só nas partidas; nada entra em saldo.
- Na digitação manual o usuário informa combustível, preço por litro e hodômetro. Os litros
  são derivados na leitura (valor ÷ preço), não gravados.
- O contrato IPC aceita só esses três campos. Posto, CNPJ, impostos e chave de acesso só
  podem ser gravados no processo principal, pela captura de nota: o renderer não consegue
  se passar por uma nota da SEFAZ.
- Proveniência obrigatória: `MANUAL`, `QR_SEFAZ` (exige chave de acesso) ou `OCR`. A chave
  de acesso é única: a mesma nota não entra duas vezes.
- Detalhes fora da categoria `FUEL` são recusados, e o lançamento não é gravado.
- A tela mostra uma linha com os detalhes e, se houver, os impostos recolhidos em uma
  caixa, com o aviso de que o Fluxo não apura tributos.

## Consequências
- Posto, CNPJ, endereço, impostos e chave de acesso pertencem ao **documento fiscal**, não
  ao combustível. Ficam em `fuel_details` até a captura geral de notas existir; aí migram
  para `documents` por migration aditiva (D-022). É dívida assumida, não esquecida.
- Não existe ainda nenhum código que leia QR Code ou foto. A gravação com dados de nota é
  exercida só por teste, pelo mesmo repositório que a captura usará.
- A data e o valor total da nota são a data e o valor do próprio movimento.
- Consumo médio (km/L) entre abastecimentos não é calculado.
- A exportação JSON inclui os detalhes; a CSV não.
- "Financiamentos" e "Empréstimos" continuam localizadas pelo nome (D-036).

## Alternativas consideradas
- Reconhecer a categoria pelo nome — rejeitado: viola o D-032.
- Criar já `documents` e `document_items` — rejeitado: o D-022 adia esse desenho até haver
  captura real; aqui só entra o que o abastecimento precisa.
- Guardar preço por litro em centavos — rejeitado: perderia a terceira casa da bomba.
- Gravar os litros calculados — rejeitado: é derivado; gravado, poderia divergir do valor.
- Aceitar posto e impostos pelo formulário — rejeitado: viraria "fato" digitado sem fonte.
