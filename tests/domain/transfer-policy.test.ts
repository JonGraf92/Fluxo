import { describe, expect, it } from 'vitest';
import { planTransfer } from '../../src/domain/services/TransferPolicy';
import { Money } from '../../src/domain/value-objects/Money';
import { DomainError } from '../../src/domain/errors/DomainError';

describe('TransferPolicy — a parte mais sensível do domínio (Regra 4)', () => {
  it('gera duas legs que somam exatamente zero (patrimônio total inalterado)', () => {
    const plan = planTransfer({
      fromResourceId: 'conta-corrente',
      fromResourceType: 'MONEY_ACCOUNT',
      toResourceId: 'poupanca',
      toResourceType: 'MONEY_ACCOUNT',
      amount: Money.fromCents(50000),
    });

    expect(plan.originLeg).toEqual({ resourceId: 'conta-corrente', amountCents: -50000 });
    expect(plan.destinationLeg).toEqual({ resourceId: 'poupanca', amountCents: 50000 });
    expect(plan.originLeg.amountCents + plan.destinationLeg.amountCents).toBe(0);
  });

  it('rejeita transferência para o mesmo recurso', () => {
    expect(() =>
      planTransfer({
        fromResourceId: 'conta-corrente',
        fromResourceType: 'MONEY_ACCOUNT',
        toResourceId: 'conta-corrente',
        toResourceType: 'MONEY_ACCOUNT',
        amount: Money.fromCents(100),
      }),
    ).toThrow(DomainError);
  });

  it('rejeita valor zero ou negativo', () => {
    expect(() =>
      planTransfer({
        fromResourceId: 'A',
        fromResourceType: 'MONEY_ACCOUNT',
        toResourceId: 'B',
        toResourceType: 'MONEY_ACCOUNT',
        amount: Money.zero(),
      }),
    ).toThrow(DomainError);
  });

  it('rejeita transferência entre naturezas diferentes (dinheiro ↔ benefício)', () => {
    expect(() =>
      planTransfer({
        fromResourceId: 'conta-corrente',
        fromResourceType: 'MONEY_ACCOUNT',
        toResourceId: 'vr',
        toResourceType: 'BENEFIT',
        amount: Money.fromCents(10000),
      }),
    ).toThrow(DomainError);
  });

  it('permite transferência entre dois recursos de dinheiro (conta ↔ carteira física)', () => {
    expect(() =>
      planTransfer({
        fromResourceId: 'conta-corrente',
        fromResourceType: 'MONEY_ACCOUNT',
        toResourceId: 'carteira',
        toResourceType: 'CASH',
        amount: Money.fromCents(10000),
      }),
    ).not.toThrow();
  });
});
