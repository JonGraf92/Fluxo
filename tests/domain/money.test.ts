import { describe, expect, it } from 'vitest';
import { Money, requirePositiveMagnitude } from '../../src/domain/value-objects/Money';
import { DomainError } from '../../src/domain/errors/DomainError';

describe('Money — seção 31: nunca float, sempre inteiro em centavos', () => {
  it('converte uma entrada decimal para centavos inteiros', () => {
    expect(Money.fromDecimalString('1.250,00').toCents()).toBe(125000);
    expect(Money.fromDecimalString('10,5').toCents()).toBe(1050);
  });

  it('rejeita centavos não inteiros', () => {
    expect(() => Money.fromCents(10.5)).toThrow(DomainError);
  });

  it('soma e subtrai preservando o inteiro', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(250);
    expect(a.add(b).toCents()).toBe(1250);
    expect(a.subtract(b).toCents()).toBe(750);
  });

  it('nunca permite valor zero ou negativo em requirePositiveMagnitude', () => {
    expect(() => requirePositiveMagnitude(Money.zero())).toThrow(DomainError);
    expect(() => requirePositiveMagnitude(Money.fromCents(-100))).toThrow(DomainError);
    expect(() => requirePositiveMagnitude(Money.fromCents(100))).not.toThrow();
  });

  it('formata em BRL só para exibição, sem alterar o valor interno', () => {
    expect(Money.fromCents(125000).toBRLString()).toContain('1.250,00');
  });
});
