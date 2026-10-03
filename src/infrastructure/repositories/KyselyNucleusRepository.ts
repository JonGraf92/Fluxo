import { Kysely } from 'kysely';
import { FinancialNucleus } from '../../domain/entities/FinancialNucleus';
import { NucleusRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapNucleus, toIso } from './mappers';

export class KyselyNucleusRepository implements NucleusRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(nucleus: FinancialNucleus): Promise<void> {
    await this.db
      .insertInto('financial_nuclei')
      .values({
        id: nucleus.id,
        name: nucleus.name,
        type: nucleus.type,
        created_at: toIso(nucleus.createdAt),
        updated_at: toIso(nucleus.updatedAt),
      })
      .execute();
  }

  async findById(id: string): Promise<FinancialNucleus | null> {
    const row = await this.db.selectFrom('financial_nuclei').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapNucleus(row) : null;
  }

  async listAll(): Promise<FinancialNucleus[]> {
    const rows = await this.db.selectFrom('financial_nuclei').selectAll().orderBy('created_at', 'asc').execute();
    return rows.map(mapNucleus);
  }
}
