import { describe, expect, it } from 'vitest';
import { formatBpsAsPercent, parsePercentToBps } from '../../src/shared/percent-parsing';

describe('Taxa percentual em centésimos de ponto percentual', () => {
  it('converte formatos brasileiros válidos', () => {
    expect(parsePercentToBps('0')).toBe(0);
    expect(parsePercentToBps('2')).toBe(200);
    expect(parsePercentToBps('1,9')).toBe(190);
    expect(parsePercentToBps('1,99')).toBe(199);
    expect(parsePercentToBps('12,5')).toBe(1250);
    expect(parsePercentToBps(' 1,99 % ')).toBe(199);
    expect(parsePercentToBps('0,05')).toBe(5);
  });

  it('recusa o que é ambíguo ou malformado, em vez de adivinhar', () => {
    for (const input of ['', ' ', '1.99', '1,999', '-1', '1,', ',5', 'abc', '1,9a', '12345', '1 000']) {
      expect(parsePercentToBps(input), input).toBeNull();
    }
  });

  it('formata de volta e o resultado é reversível', () => {
    expect(formatBpsAsPercent(199)).toBe('1,99%');
    expect(formatBpsAsPercent(0)).toBe('0,00%');
    expect(formatBpsAsPercent(5)).toBe('0,05%');
    expect(formatBpsAsPercent(1250)).toBe('12,50%');
    for (const bps of [0, 5, 99, 100, 199, 1250, 100_000]) {
      expect(parsePercentToBps(formatBpsAsPercent(bps))).toBe(bps);
    }
  });
});
