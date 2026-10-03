# D-015 — README e ADRs nascem na Fase 1, não no final

**Status:** Aceita

## Contexto
Seção 63 lista documentação como entregável final. Na prática, decisões tomadas durante a
implementação são mais confiáveis quando registradas no momento em que são tomadas.

## Decisão
`docs/` (architecture, adr, security, product, qa) é criado na Fase 1, junto com a
estrutura do projeto, e atualizado a cada decisão relevante — não escrito retroativamente.

## Consequências
Qualquer pessoa (humana ou IA) que continue o projeto encontra o "porquê" de cada escolha
no momento em que for mexer no código, reduzindo o risco de reverter uma decisão
financeira por parecer "mais simples" sem entender o motivo original (seção 62).
