/**
 * Taxa percentual em formato brasileiro ("1,99") para centésimos de ponto percentual
 * (199) e de volta. Mesmo princípio do parser de dinheiro (ADR D-027): inteiro, gramática
 * explícita, e `null` para qualquer coisa ambígua em vez de adivinhar.
 *
 * Aceita: "0", "2", "1,9", "1,99", "12,5". Rejeita: "1.99" (ponto), "1,999" (três casas),
 * "-1", "", "abc", "1,".
 */

const PERCENT_PATTERN = /^\d{1,4}(,\d{1,2})?$/;

export function parsePercentToBps(rawInput: string): number | null {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim().replace(/\s*%$/, '');
  if (!PERCENT_PATTERN.test(trimmed)) return null;
  const [integerPart, decimalPart] = trimmed.split(',');
  return Number(integerPart) * 100 + Number((decimalPart ?? '').padEnd(2, '0'));
}

export function formatBpsAsPercent(bps: number): string {
  const integerPart = Math.trunc(bps / 100);
  const decimalPart = String(Math.abs(bps) % 100).padStart(2, '0');
  return `${integerPart},${decimalPart}%`;
}
