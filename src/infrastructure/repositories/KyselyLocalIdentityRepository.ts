import { Kysely } from 'kysely';
import { LocalIdentity } from '../../domain/entities/LocalIdentity';
import { LocalIdentityRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapLocalIdentity, toIso } from './mappers';

export class KyselyLocalIdentityRepository implements LocalIdentityRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async get(): Promise<LocalIdentity | null> {
    const row = await this.db.selectFrom('local_identity').selectAll().executeTakeFirst();
    return row ? mapLocalIdentity(row) : null;
  }

  async create(identity: LocalIdentity): Promise<void> {
    await this.db
      .insertInto('local_identity')
      .values({ id: identity.id, person_id: identity.personId, installed_at: toIso(identity.installedAt) })
      .execute();
  }
}
