# D-008 — Recursos mantêm sua natureza; dinheiro e benefício nunca são somados

**Status:** Aceita

## Contexto
Seção 11 do Master Build Prompt é uma regra obrigatória: VR/VA não são dinheiro
equivalente. Somar R$ 4.000 de conta com R$ 800 de VR em "saldo disponível: R$ 4.800"
distorce a realidade financeira do usuário.

## Decisão
`Resource.type` é `MONEY_ACCOUNT | CASH | BENEFIT`. `ResourceNaturePolicy` no domínio
define quais tipos podem ser agregados entre si (`MONEY_ACCOUNT` + `CASH` = "dinheiro";
`BENEFIT` fica sempre em um total separado). Nenhum caso de uso ou componente de UI tem
permissão de somar as duas naturezas em um único número.

## Consequências
- Dashboard sempre mostra ao menos dois totais: "Dinheiro disponível" e "Benefícios".
- Testado explicitamente: `tests/domain/resource-nature-policy.test.ts`.
