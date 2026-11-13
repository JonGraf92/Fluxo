/**
 * Preço por litro em formato brasileiro ("5,799") para milésimos de real (5799) e de volta.
 * Bomba de combustível usa três casas; centavos não bastam. Mesmo princípio do parser de
 * dinheiro (ADR D-027): inteiro, gramática explícita e null para o que for ambíguo.
 */
const LITER_PRICE_PATTERN = /^\d{1,2}(,\d{1,3})?$/;

export function parseLiterPriceToMillis(rawInput: string): number | null {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim().replace(/^R\$\s*/i, '');
  if (!LITER_PRICE_PATTERN.test(trimmed)) return null;
  const [integerPart, decimalPart] = trimmed.split(',');
  const millis = Number(integerPart) * 1000 + Number((decimalPart ?? '').padEnd(3, '0'));
  return millis > 0 ? millis : null;
}

export function formatLiterPrice(millis: number): string {
  return Math.trunc(millis / 1000) + ',' + String(millis % 1000).padStart(3, '0');
}
