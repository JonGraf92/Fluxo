import { describe, expect, it } from 'vitest';
import {
  blurCurrencyField,
  CurrencyFieldState,
  displayTextForCents,
  focusCurrencyField,
  initialCurrencyFieldState,
  typeInCurrencyField,
} from '../../renderer/design-system/currencyFieldState';
import { parseBrazilianCurrencyToCents } from '../../src/shared/money-parsing';

function typeAll(state: CurrencyFieldState, keys: string): CurrencyFieldState {
  let current = state;
  for (const key of keys) {
    current = typeInCurrencyField(current, current.text + key);
  }
  return current;
}

describe('Campo de valor — foco limpa o campo e fica só o que o usuário digita', () => {
  it('regressão: campo aberto com "0,00" não mistura o zero com o valor digitado', () => {
    const opened = initialCurrencyFieldState(0);
    expect(opened.text).toBe('0,00');

    const focused = focusCurrencyField(opened);
    expect(focused.text).toBe('');

    const typed = typeAll(focused, '123123');
    expect(typed.text).toBe('123123');
    expect(parseBrazilianCurrencyToCents(typed.text)).toBe(12_312_300);
  });

  it('campo com valor já preenchido também esvazia ao receber foco', () => {
    const focused = focusCurrencyField(initialCurrencyFieldState(45_990));
    expect(focused.text).toBe('');

    const typed = typeAll(focused, '500,5');
    expect(typed.text).toBe('500,5');
    expect(parseBrazilianCurrencyToCents(typed.text)).toBe(50_050);
  });

  it('sair do campo sem digitar devolve o texto anterior, sem alterar o valor', () => {
    const opened = initialCurrencyFieldState(45_990);
    const left = blurCurrencyField(focusCurrencyField(opened));
    expect(left).toEqual(opened);
  });

  it('campo vazio continua vazio ao focar e sair', () => {
    const opened = initialCurrencyFieldState(null);
    expect(opened.text).toBe('');
    expect(blurCurrencyField(focusCurrencyField(opened))).toEqual(opened);
  });

  it('apagar tudo o que digitou deixa o campo vazio ao sair (não ressuscita o valor antigo)', () => {
    const typed = typeAll(focusCurrencyField(initialCurrencyFieldState(45_990)), '7');
    const erased = typeInCurrencyField(typed, '');
    expect(blurCurrencyField(erased).text).toBe('');
  });

  it('ao sair, valor válido é exibido formatado e continua representando os mesmos centavos', () => {
    const left = blurCurrencyField(typeAll(focusCurrencyField(initialCurrencyFieldState(0)), '123123'));
    expect(left.text).toBe('123.123,00');
    expect(parseBrazilianCurrencyToCents(left.text)).toBe(12_312_300);
  });

  it('ao sair, texto inválido fica como está para o usuário corrigir', () => {
    const left = blurCurrencyField(typeAll(focusCurrencyField(initialCurrencyFieldState(null)), '10.50'));
    expect(left.text).toBe('10.50');
    expect(parseBrazilianCurrencyToCents(left.text)).toBeNull();
  });

  it('segundo foco depois de digitar esvazia de novo', () => {
    const first = blurCurrencyField(typeAll(focusCurrencyField(initialCurrencyFieldState(null)), '80'));
    expect(first.text).toBe('80,00');
    const second = focusCurrencyField(first);
    expect(second.text).toBe('');
    expect(blurCurrencyField(second).text).toBe('80,00');
  });

  it('foco repetido sem sair não perde o texto a devolver', () => {
    const focusedTwice = focusCurrencyField(focusCurrencyField(initialCurrencyFieldState(45_990)));
    expect(blurCurrencyField(focusedTwice).text).toBe('459,90');
  });

  it('valor negativo mantém o sinal e é reversível pelo parser', () => {
    expect(displayTextForCents(-30_000)).toBe('-300,00');
    expect(parseBrazilianCurrencyToCents(displayTextForCents(-30_000))).toBe(-30_000);
    expect(displayTextForCents(null)).toBe('');
  });
});
