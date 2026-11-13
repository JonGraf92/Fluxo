/**
 * Detalhes de um abastecimento, 1:1 com o Movement de saída (ADR D-038).
 *
 * São INFORMAÇÃO DE LEITURA: nada aqui entra em saldo nem em total. O valor pago vive só nas
 * partidas do movimento; imposto já está dentro dele e nunca é somado de novo.
 *
 * A digitação manual preenche só combustível, preço por litro e hodômetro. Os demais campos
 * existem para a captura de nota fiscal (QR Code da NFC-e ou OCR), que grava por este mesmo
 * tipo. A proveniência diz quanto confiar: QR_SEFAZ é fato, OCR é palpite, MANUAL é o usuário.
 */
export const FUEL_TYPES = ['GASOLINE', 'ETHANOL', 'DIESEL', 'CNG'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_PROVENANCES = ['MANUAL', 'QR_SEFAZ', 'OCR'] as const;
export type FuelProvenance = (typeof FUEL_PROVENANCES)[number];

/** R$ 99,999 por litro: acima disso é erro de digitação. */
export const MAX_PRICE_PER_LITER_MILLIS = 99_999;
export const MAX_ODOMETER_KM = 9_999_999;

export interface FuelTax {
  /** Sigla do tributo como veio no documento: ICMS, PIS, COFINS, CIDE, IBS, CBS... */
  readonly taxCode: string;
  readonly amountCents: number;
}

export interface FuelDetails {
  readonly movementId: string;
  readonly fuelType: FuelType | null;
  /** Preço por litro em milésimos de real: R$ 5,799 = 5799. Inteiro, nunca float. */
  readonly pricePerLiterMillis: number | null;
  /** Volume em mililitros, quando vem do documento. Na digitação manual é derivado na leitura. */
  readonly quantityMl: number | null;
  readonly odometerKm: number | null;
  readonly stationName: string | null;
  /** 14 dígitos, sem pontuação. */
  readonly stationCnpj: string | null;
  readonly stationAddress: string | null;
  /** Total de tributos informado no documento. */
  readonly taxTotalCents: number | null;
  readonly taxes: readonly FuelTax[];
  readonly provenance: FuelProvenance;
  /** Chave de acesso da NFC-e (44 dígitos). Única: a mesma nota não entra duas vezes. */
  readonly accessKey: string | null;
}

export type FuelDetailsProblem =
  | 'FUEL_TYPE_INVALID'
  | 'FUEL_PRICE_INVALID'
  | 'FUEL_QUANTITY_INVALID'
  | 'FUEL_ODOMETER_INVALID'
  | 'FUEL_STATION_CNPJ_INVALID'
  | 'FUEL_ACCESS_KEY_INVALID'
  | 'FUEL_TAX_INVALID'
  | 'FUEL_PROVENANCE_INVALID';

const isIntIn = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;

/** Devolve o código do primeiro problema, ou null se os detalhes estão válidos. */
export function fuelDetailsProblem(details: Omit<FuelDetails, 'movementId'>): FuelDetailsProblem | null {
  if (details.fuelType !== null && !FUEL_TYPES.includes(details.fuelType)) return 'FUEL_TYPE_INVALID';
  if (details.pricePerLiterMillis !== null && !isIntIn(details.pricePerLiterMillis, 1, MAX_PRICE_PER_LITER_MILLIS)) return 'FUEL_PRICE_INVALID';
  if (details.quantityMl !== null && !isIntIn(details.quantityMl, 1, Number.MAX_SAFE_INTEGER)) return 'FUEL_QUANTITY_INVALID';
  if (details.odometerKm !== null && !isIntIn(details.odometerKm, 0, MAX_ODOMETER_KM)) return 'FUEL_ODOMETER_INVALID';
  if (details.stationCnpj !== null && !/^\d{14}$/.test(details.stationCnpj)) return 'FUEL_STATION_CNPJ_INVALID';
  if (details.accessKey !== null && !/^\d{44}$/.test(details.accessKey)) return 'FUEL_ACCESS_KEY_INVALID';
  if (details.taxTotalCents !== null && !isIntIn(details.taxTotalCents, 0, Number.MAX_SAFE_INTEGER)) return 'FUEL_TAX_INVALID';
  const codes = new Set(details.taxes.map((tax) => tax.taxCode));
  if (codes.size !== details.taxes.length) return 'FUEL_TAX_INVALID';
  if (details.taxes.some((tax) => !tax.taxCode.trim() || !isIntIn(tax.amountCents, 0, Number.MAX_SAFE_INTEGER))) return 'FUEL_TAX_INVALID';
  if (!FUEL_PROVENANCES.includes(details.provenance)) return 'FUEL_PROVENANCE_INVALID';
  // Só a consulta à SEFAZ afirma uma chave de acesso; digitação manual não pode alegar uma.
  if (details.provenance === 'QR_SEFAZ' && details.accessKey === null) return 'FUEL_PROVENANCE_INVALID';
  if (details.provenance === 'MANUAL' && details.accessKey !== null) return 'FUEL_PROVENANCE_INVALID';
  return null;
}

/** Litros em mililitros: o volume do documento ou, na falta dele, valor pago ÷ preço por litro. */
export function fuelQuantityMl(amountCents: number, details: Pick<FuelDetails, 'quantityMl' | 'pricePerLiterMillis'>): number | null {
  if (details.quantityMl !== null) return details.quantityMl;
  if (details.pricePerLiterMillis === null || details.pricePerLiterMillis <= 0) return null;
  return Math.round((Math.abs(amountCents) * 10_000) / details.pricePerLiterMillis);
}
