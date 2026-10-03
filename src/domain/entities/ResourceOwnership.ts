import { OwnershipType } from '../value-objects/enums';

export interface ResourceOwnership {
  readonly id: string;
  readonly resourceId: string;
  readonly personId: string;
  readonly ownershipType: OwnershipType;
  readonly createdAt: Date;
}
