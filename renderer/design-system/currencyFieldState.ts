import { parseBrazilianCurrencyToCents } from '../../src/shared/money-parsing';
import { formatCentsToBRL } from '../services/money';

/**
 * Estado de exibição do campo de valor, separado do componente para ser testável sem DOM.
 *
 * Defeito que isto corrige: o campo abria com "0,00" (ou com o valor atual) e o cursor
 * caía no meio do texto; digitar "123123" virava "1231230,00". Agora, ao receber foco, o
 * campo fica vazio e mostra só o que o usuário digitar. Se ele sair sem digitar nada, o
 * texto anterior volta — o valor guardado pela tela nunca muda só por causa do foco.
 */
export interface CurrencyFieldState {
  /** Texto exibido no campo. */
  text: string;
  /** Texto a devolver se o campo perder o foco sem digitação; `null` fora do foco ou após digitar. */
  restoreText: string | null;
}

/** "1.250,00" a partir de centavos, sem o símbolo; vazio quando não há valor. */
export function displayTextForCents(cents: number | null): string {
  if (cents === null) return '';
  const formatted = formatCentsToBRL(Math.abs(cents)).replace('R$', '').trim();
  return cents < 0 ? `-${formatted}` : formatted;
}

export function initialCurrencyFieldState(cents: number | null): CurrencyFieldState {
  return { text: displayTextForCents(cents), restoreText: null };
}

/** Foco: some tudo o que estava no campo; fica só o que for digitado a partir daqui. */
export function focusCurrencyField(state: CurrencyFieldState): CurrencyFieldState {
  if (state.restoreText !== null) return state;
  return { text: '', restoreText: state.text };
}

export function typeInCurrencyField(_state: CurrencyFieldState, raw: string): CurrencyFieldState {
  return { text: raw, restoreText: null };
}

/**
 * Saída do campo: sem digitação, volta o texto anterior; com valor válido, mostra o valor
 * formatado; texto inválido fica como está, para o usuário ver e corrigir.
 */
export function blurCurrencyField(state: CurrencyFieldState): CurrencyFieldState {
  if (state.restoreText !== null) return { text: state.restoreText, restoreText: null };
  const cents = parseBrazilianCurrencyToCents(state.text);
  if (cents === null) return { text: state.text, restoreText: null };
  return { text: displayTextForCents(cents), restoreText: null };
}
