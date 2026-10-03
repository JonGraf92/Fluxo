import { Kysely } from 'kysely';
import { ResourceOwnership } from '../../domain/entities/ResourceOwnership';
import { ResourceOwnershipRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapResourceOwnership, toIso } from './mappers';

export class KyselyResourceOwnershipRepository implements ResourceOwnershipRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(ownership: ResourceOwnership): Promise<void> {
    await this.db
      .insertInto('resource_ownership')
      .values({
        id: ownership.id,
        resource_id: ownership.resourceId,
        person_id: ownership.personId,
        ownership_type: ownership.ownershipType,
        created_at: toIso(ownership.createdAt),
      })
      .execute();
  }

  async listByResource(resourceId: string): Promise<ResourceOwnership[]> {
    const rows = await this.db
      .selectFrom('resource_ownership')
      .selectAll()
      .where('resource_id', '=', resourceId)
      .execute();
    return rows.map(mapResourceOwnership);
  }
}
