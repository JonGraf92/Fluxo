import { Kysely } from 'kysely';
import { Resource } from '../../domain/entities/Resource';
import { ResourceRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapResource, toDbBool, toIso } from './mappers';

export class KyselyResourceRepository implements ResourceRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(resource: Resource): Promise<void> {
    await this.db
      .insertInto('resources')
      .values({
        id: resource.id,
        nucleus_id: resource.nucleusId,
        name: resource.name,
        type: resource.type,
        benefit_subtype: resource.benefitSubtype,
        statement_due_day: resource.statementDueDay,
        statement_closing_day: resource.statementClosingDay,
        liquidity_days: resource.liquidityDays,
        initial_balance_cents: resource.initialBalanceCents,
        archived: toDbBool(resource.archived),
        created_at: toIso(resource.createdAt),
        updated_at: toIso(resource.updatedAt),
      })
      .execute();
  }

  async findById(id: string): Promise<Resource | null> {
    const row = await this.db.selectFrom('resources').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapResource(row) : null;
  }

  async updateNameAndArchived(resourceId: string, name: string, archived: boolean, updatedAt: Date): Promise<void> {
    await this.db.updateTable('resources').set({ name, archived: toDbBool(archived), updated_at: toIso(updatedAt) }).where('id', '=', resourceId).execute();
  }

  async updateProperties(resourceId: string, name: string, initialBalanceCents: number, liquidityDays: number | null, statementClosingDay: number | null, updatedAt: Date): Promise<void> {
    await this.db.updateTable('resources').set({ name, initial_balance_cents: initialBalanceCents, liquidity_days: liquidityDays, statement_closing_day: statementClosingDay, updated_at: toIso(updatedAt) }).where('id', '=', resourceId).execute();
  }

  async listByNucleus(nucleusId: string, options?: { includeArchived?: boolean }): Promise<Resource[]> {
    let query = this.db.selectFrom('resources').selectAll().where('nucleus_id', '=', nucleusId);
    if (!options?.includeArchived) {
      query = query.where('archived', '=', 0);
    }
    const rows = await query.orderBy('created_at', 'asc').execute();
    return rows.map(mapResource);
  }
}
