import { Kysely } from 'kysely';
import { Membership } from '../../domain/entities/Membership';
import { MembershipRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapMembership, toIso } from './mappers';

export class KyselyMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(membership: Membership): Promise<void> {
    await this.db
      .insertInto('memberships')
      .values({
        id: membership.id,
        person_id: membership.personId,
        nucleus_id: membership.nucleusId,
        role: membership.role,
        created_at: toIso(membership.createdAt),
      })
      .execute();
  }

  /** Único caminho autorizado para descobrir o dono de um núcleo — ver ADR D-016. */
  async findOwner(nucleusId: string): Promise<Membership | null> {
    const row = await this.db
      .selectFrom('memberships')
      .selectAll()
      .where('nucleus_id', '=', nucleusId)
      .where('role', '=', 'OWNER')
      .executeTakeFirst();
    return row ? mapMembership(row) : null;
  }

  async findByPersonAndNucleus(personId: string, nucleusId: string): Promise<Membership | null> {
    const row = await this.db
      .selectFrom('memberships')
      .selectAll()
      .where('person_id', '=', personId)
      .where('nucleus_id', '=', nucleusId)
      .executeTakeFirst();
    return row ? mapMembership(row) : null;
  }

  async listByNucleus(nucleusId: string): Promise<Membership[]> {
    const rows = await this.db.selectFrom('memberships').selectAll().where('nucleus_id', '=', nucleusId).execute();
    return rows.map(mapMembership);
  }
}
