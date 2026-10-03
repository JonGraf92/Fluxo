# D-022 — documents / document_items removidos do schema da V1

**Status:** Aceita

## Contexto
A proposta inicial já retirava OCR e a UI de documentos do escopo da V1, mas ainda criava
as tabelas `documents` e `document_items` "reservando espaço" para o futuro. Isso adiciona
uma tabela vazia e sem caso de uso real testável agora — complexidade que não ajuda a
validar o núcleo financeiro, que é a prioridade desta fase.

## Decisão
`documents` e `document_items` NÃO existem no schema da V1. Ficam documentadas aqui como
extensão futura (V1.2, ver `docs/product/roadmap.md`), a ser desenhadas com mais precisão
quando o OCR for de fato implementado — nenhuma tabela "adivinhada" hoje.
O relacionamento conceitual "1 documento pode gerar múltiplas movimentações" (Regra 1,
seção 14) permanece válido como princípio de domínio, mas `Movement` não referencia
`document_id` na V1 (o campo será adicionado quando `documents` existir).

## Consequências
- Menos uma tabela, uma migration e um repositório sem uso real na V1.
- Quando `documents` for implementado (V1.2), será uma migration aditiva
  (`ALTER TABLE movements ADD COLUMN document_id`), sem quebrar dados existentes.

## Alternativas consideradas
- Criar o schema vazio agora "para não precisar migrar depois" — rejeitado a pedido
  explícito do produto: reduzir complexidade desnecessária da primeira versão tem
  prioridade sobre economizar uma migration futura.
