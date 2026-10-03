import { Kysely } from 'kysely';
import { Category } from '../../domain/entities/Category';
import { CategoryRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapCategory, toDbBool, toIso } from './mappers';

export class KyselyCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(category: Category): Promise<void> {
    await this.db
      .insertInto('categories')
      .values({
        id: category.id,
        nucleus_id: category.nucleusId,
        name: category.name,
        kind: category.kind,
        is_system: toDbBool(category.isSystem),
        created_at: toIso(category.createdAt),
      })
      .execute();
  }

  async createMany(categories: Category[]): Promise<void> {
    if (categories.length === 0) return;
    await this.db
      .insertInto('categories')
      .values(
        categories.map((category) => ({
          id: category.id,
          nucleus_id: category.nucleusId,
          name: category.name,
          kind: category.kind,
          is_system: toDbBool(category.isSystem),
          created_at: toIso(category.createdAt),
        })),
      )
      .execute();
  }

  async listByNucleus(nucleusId: string): Promise<Category[]> {
    const rows = await this.db
      .selectFrom('categories')
      .selectAll()
      .where('nucleus_id', '=', nucleusId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map(mapCategory);
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.db.selectFrom('categories').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapCategory(row) : null;
  }
}
