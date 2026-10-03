import { describe, expect, it } from 'vitest';
import { parseBrazilianCurrencyToCents } from '../../src/shared/money-parsing';

describe('parseBrazilianCurrencyToCents — parser canônico único (ADR D-027)', () => {
  it('aceita formatos brasileiros válidos', () => {
    expect(parseBrazilianCurrencyToCents('1.250,00')).toBe(125000);
    expect(parseBrazilianCurrencyToCents('1250,00')).toBe(125000);
    expect(parseBrazilianCurrencyToCents('1250')).toBe(125000); // inteiro = reais, sem centavos
    expect(parseBrazilianCurrencyToCents('10,5')).toBe(1050); // 1 casa decimal vira 50 centavos
    expect(parseBrazilianCurrencyToCents('0,99')).toBe(99);
    expect(parseBrazilianCurrencyToCents('R$ 1.250,00')).toBe(125000);
  });

  it('rejeita (retorna null) o caso que estava quebrado antes do hardening: ponto decimal ambíguo', () => {
    // Antes desta correção, "10.50" virava 105000 centavos (R$ 1.050,00) — dez vezes
    // maior que o valor pretendido. Agora é explicitamente rejeitado como ambíguo, porque
    // ".50" não é um agrupamento de milhar válido (precisaria ser 3 dígitos).
    expect(parseBrazilianCurrencyToCents('10.50')).toBeNull();
  });

  it('rejeita entradas malformadas em vez de adivinhar', () => {
    expect(parseBrazilianCurrencyToCents('')).toBeNull();
    expect(parseBrazilianCurrencyToCents('abc')).toBeNull();
    expect(parseBrazilianCurrencyToCents('1,234,56')).toBeNull();
    expect(parseBrazilianCurrencyToCents('12.34.56')).toBeNull();
    expect(parseBrazilianCurrencyToCents('-')).toBeNull();
  });

  it('aceita valores negativos quando o chamador precisa (ex.: ajuste)', () => {
    expect(parseBrazilianCurrencyToCents('-300,00')).toBe(-30000);
  });

  it('nunca retorna um valor não inteiro de centavos', () => {
    const result = parseBrazilianCurrencyToCents('10,5');
    expect(Number.isInteger(result)).toBe(true);
  });
});
