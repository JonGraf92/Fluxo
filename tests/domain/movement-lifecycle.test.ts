import { describe, expect, it } from 'vitest';
import { assertValidTransition, isCancellable } from '../../src/domain/services/MovementLifecycle';
import { DomainError } from '../../src/domain/errors/DomainError';

describe('MovementLifecycle — ADR D-010', () => {
  it('permite CONFIRMED → CANCELLED', () => {
    expect(() => assertValidTransition('CONFIRMED', 'CANCELLED')).not.toThrow();
  });

  it('rejeita transições inválidas (ex.: CANCELLED → CONFIRMED)', () => {
    expect(() => assertValidTransition('CANCELLED', 'CONFIRMED')).toThrow(DomainError);
  });

  it('CONFIRMED e DRAFT são canceláveis; CANCELLED não é', () => {
    expect(isCancellable('CONFIRMED')).toBe(true);
    expect(isCancellable('DRAFT')).toBe(true);
    expect(isCancellable('CANCELLED')).toBe(false);
  });
});
