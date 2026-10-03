/**
 * Metadado de auditoria/contexto de um ajuste. O efeito financeiro real vive na
 * MovementLeg do Movement referenciado — ver ADR D-019. Este registro NUNCA guarda
 * valores de saldo (evita lógica paralela de cálculo).
 */
export interface Adjustment {
  readonly id: string;
  readonly movementId: string;
  readonly resourceId: string;
  readonly reason: string;
  readonly createdByPersonId: string;
  readonly createdAt: Date;
}
