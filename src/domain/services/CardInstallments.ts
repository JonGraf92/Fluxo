/**
 * Compra parcelada no cartão de crédito (ADR D-039).
 *
 * Cada parcela é uma compra confirmada com a data do seu mês e a fatura do seu ciclo. Os
 * movimentos de uma mesma compra compartilham o installmentGroupId.
 */
export const MAX_CARD_INSTALLMENTS = 48;

export interface InstallmentRef {
  readonly groupId: string;
  /** 1 a count. */
  readonly number: number;
  readonly count: number;
}

/** Parcelas iguais; os centavos que sobram da divisão ficam na primeira. A soma é sempre o total. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => (index === 0 ? totalCents - base * (count - 1) : base));
}

/** Compra parcelada tem pelo menos duas parcelas, e cada uma sabe sua posição. */
export function isValidInstallmentRef(ref: InstallmentRef): boolean {
  return ref.groupId.trim() !== '' && Number.isInteger(ref.count) && ref.count >= 2 && ref.count <= MAX_CARD_INSTALLMENTS
    && Number.isInteger(ref.number) && ref.number >= 1 && ref.number <= ref.count;
}
