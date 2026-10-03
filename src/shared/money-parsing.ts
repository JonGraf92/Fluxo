/**
 * Parser canônico de valores monetários em formato brasileiro (R$ 1.250,00).
 *
 * Antes desta correção existiam TRÊS implementações divergentes fazendo essa conversão
 * (Money.fromDecimalString no domínio, e duas outras no renderer), nenhuma delas a
 * "fonte de verdade" real — o IPC já trafega tudo em centavos, então o parser do domínio
 * nunca era exercitado pelo app de verdade, só pelo próprio teste unitário dele.
 *
 * A implementação anterior também tinha um bug de correção financeira: ela removia TODOS
 * os pontos da string antes de interpretar a vírgula como separador decimal
 * (`"10.50".replace(/\./g,'')` → `"1050"` → interpretado como R$ 1.050,00 em vez de
 * R$ 10,50). Silenciosamente multiplicava o valor por 100.
 *
 * Esta versão valida a estrutura da string com uma gramática explícita ANTES de
 * qualquer substituição, e rejeita (retorna `null`) qualquer coisa ambígua em vez de
 * adivinhar. Esta é a única implementação de parsing monetário do projeto — o domínio
 * (`Money.fromDecimalString`) e o renderer (`CurrencyInput`, `parseBRLInputToCents`)
 * chamam esta função em vez de duplicar a lógica.
 *
 * Gramática aceita (grupo de milhar são exatamente 3 dígitos; no máximo 2 casas decimais):
 *   -?  ( \d{1,3}(\.\d{3})*  |  \d+ )  (,\d{1,2})?
 *
 * Exemplos aceitos: "1250", "1.250", "1.250,00", "10,5", "-300,00"
 * Exemplos rejeitados (ambíguos ou malformados): "10.50" (não é separador de milhar
 * válido — teria que ser "1.050,00" ou "10,50"), "1,234,56", "R$abc", ""
 */

const BRAZILIAN_CURRENCY_PATTERN = /^-?(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/;

export function parseBrazilianCurrencyToCents(rawInput: string): number | null {
  if (typeof rawInput !== 'string') return null;

  const withoutCurrencySymbol = rawInput.trim().replace(/^R\$\s*/i, '');
  if (withoutCurrencySymbol === '' || withoutCurrencySymbol === '-') return null;

  if (!BRAZILIAN_CURRENCY_PATTERN.test(withoutCurrencySymbol)) {
    return null;
  }

  const isNegative = withoutCurrencySymbol.startsWith('-');
  const unsigned = isNegative ? withoutCurrencySymbol.slice(1) : withoutCurrencySymbol;

  const [integerPartRaw, decimalPartRaw] = unsigned.split(',');
  const integerPart = (integerPartRaw ?? '').replace(/\./g, ''); // aqui já sabemos que são separadores de milhar válidos
  const decimalPart = (decimalPartRaw ?? '').padEnd(2, '0').slice(0, 2);

  const cents = Number(integerPart) * 100 + Number(decimalPart || '0');
  if (!Number.isSafeInteger(cents)) return null;

  return isNegative ? -cents : cents;
}
