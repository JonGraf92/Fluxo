import { NucleusType } from '../value-objects/enums';

/**
 * Nunca adicionar `ownerPersonId` aqui — ver ADR D-016. O proprietário é resolvido
 * exclusivamente via Membership(role=OWNER).
 */
export interface FinancialNucleus {
  readonly id: string;
  readonly name: string;
  readonly type: NucleusType;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
