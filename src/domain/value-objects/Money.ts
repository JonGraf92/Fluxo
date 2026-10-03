/**
 * Money — valor monetário representado exclusivamente como inteiro em centavos.
 *
 * Nunca usar `number` com casas decimais para dinheiro em nenhuma camada do domínio.
 * Ver ADR D-004.
 */

import { DomainError } from '../errors/DomainError';
import { parseBrazilianCurrencyToCents } from '../../shared/money-parsing';

export class Money {
  private readonly cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new DomainError('MONEY_MUST_BE_INTEGER_CENTS', 'Valor monetário deve ser um inteiro em centavos.');
    }
    if (!Number.isSafeInteger(cents)) {
      throw new DomainError('MONEY_OUT_OF_RANGE', 'Valor monetário fora do intervalo seguro.');
    }
    this.cents = cents;
  }

  static zero(): Money {
    return new Money(0);
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  /**
   * Converte uma string de entrada do usuário (ex.: "1.250,00") para Money.
   * Único ponto de entrada aceito para valores digitados por humanos — delega para o
   * parser canônico compartilhado (`src/shared/money-parsing.ts`), a única implementação
   * de parsing monetário do projeto (ver correção de hardening V1.0.1).
   */
  static fromDecimalString(input: string): Money {
    const cents = parseBrazilianCurrencyToCents(input);
    if (cents === null) {
      throw new DomainError('MONEY_INVALID_INPUT', `Valor monetário inválido ou ambíguo: "${input}".`);
    }
    return new Money(cents);
  }

  toCents(): number {
    return this.cents;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  negate(): Money {
    return new Money(-this.cents);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** Formatação apenas para apresentação — nunca usar o resultado de volta em cálculo. */
  toBRLString(): string {
    const value = this.cents / 100;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  static sum(values: Money[]): Money {
    return values.reduce((acc, v) => acc.add(v), Money.zero());
  }
}

/** Garante que um valor de entrada representa uma magnitude estritamente positiva (>0). */
export function requirePositiveMagnitude(money: Money, fieldName = 'valor'): void {
  if (!money.isPositive()) {
    throw new DomainError('MONEY_MUST_BE_POSITIVE', `O campo "${fieldName}" deve ser maior que zero.`);
  }
}
