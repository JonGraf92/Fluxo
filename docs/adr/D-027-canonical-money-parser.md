# D-027 — Parser monetário único e explícito

**Status:** Aceita — correção de hardening V1.0.1

## Contexto
Existiam três implementações independentes de parsing de string monetária brasileira:
`Money.fromDecimalString` no domínio (nunca exercitada pelo app real — o IPC já trafega
tudo em centavos), `parseBRLInputToCents` em `renderer/services/money.ts`, e uma lógica
inline dentro de `CurrencyInput.tsx`. Todas usavam a mesma técnica ingênua — remover todos
os pontos da string antes de trocar a vírgula por ponto — o que interpretava errado
qualquer entrada com ponto decimal em vez de separador de milhar: `"10.50"` virava
`105000` centavos (R$ 1.050,00) em vez de ser reconhecida como ambígua/rejeitada.

## Decisão
Criada uma única implementação, `parseBrazilianCurrencyToCents`
(`src/shared/money-parsing.ts`), com uma gramática explícita
(`/^-?(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/`) validada ANTES de qualquer substituição de
caractere. Entradas fora dessa gramática retornam `null` em vez de um valor adivinhado.
`Money.fromDecimalString` (domínio) e `CurrencyInput`/`parseBRLInputToCents` (renderer)
agora chamam essa função em vez de reimplementar a lógica.

## Consequências
- Existe uma única fonte de verdade para "o que é uma string monetária válida em
  português brasileiro" — testada isoladamente em
  `tests/domain/money-parsing.test.ts`, cobrindo o caso que estava errado
  (`"10.50"` é rejeitado, não interpretado como R$ 1.050,00).
- `CurrencyInput` agora mostra um erro de validação em vez de aceitar/gravar um valor
  errado quando o usuário digita algo ambíguo.
