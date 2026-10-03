import { MembershipRole } from '../value-objects/enums';

export interface Membership {
  readonly id: string;
  readonly personId: string;
  readonly nucleusId: string;
  readonly role: MembershipRole;
  readonly createdAt: Date;
}
