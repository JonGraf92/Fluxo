export interface MovementLeg {
  readonly id: string;
  readonly movementId: string;
  readonly resourceId: string;
  /** Sinal importa: negativo = débito do recurso, positivo = crédito. Nunca zero. */
  readonly amountCents: number;
  readonly sequence: number;
}
