import { Kysely } from 'kysely';
import { Person } from '../../domain/entities/Person';
import { PersonRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapPerson, toIso } from './mappers';

export class KyselyPersonRepository implements PersonRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(person: Person): Promise<void> {
    await this.db
      .insertInto('persons')
      .values({ id: person.id, display_name: person.displayName, created_at: toIso(person.createdAt) })
      .execute();
  }

  async findById(id: string): Promise<Person | null> {
    const row = await this.db.selectFrom('persons').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapPerson(row) : null;
  }

  async listByNucleus(nucleusId: string): Promise<Person[]> {
    const rows = await this.db
      .selectFrom('persons')
      .innerJoin('memberships', 'memberships.person_id', 'persons.id')
      .select(['persons.id', 'persons.display_name', 'persons.created_at'])
      .where('memberships.nucleus_id', '=', nucleusId)
      .orderBy('persons.created_at', 'asc')
      .execute();
    return rows.map(mapPerson);
  }
}
