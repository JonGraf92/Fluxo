# D-004 — Valores monetários como inteiro em centavos, nunca float

**Status:** Aceita

## Contexto
Seção 31 do Master Build Prompt proíbe explicitamente floating point para valores
financeiros críticos.

## Decisão
Todo valor monetário é armazenado e calculado como `INTEGER` em centavos
(`amount_cents`), nunca `REAL`/`float`. A conversão para exibição (`R$ 1.250,00`) acontece
apenas na camada de apresentação (`Money.toBRLString()`), nunca antes de um cálculo.

## Consequências
- `Number` do JS é seguro até 2^53-1 — mais que suficiente para qualquer patrimônio pessoal
  em centavos. `BigInt` não é necessário na V1.
- Toda entrada de valor no domínio passa por `Money.fromCents()` ou `Money.fromBRLInput()`,
  que valida que o resultado é um inteiro.

## Alternativas consideradas
- Biblioteca de decimal arbitrário (`decimal.js`) — desnecessária: inteiro em centavos já
  resolve o problema com zero dependências extras.
