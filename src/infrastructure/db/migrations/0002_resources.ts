import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** resources, resource_ownership, categories. */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .createTable('resources')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('nucleus_id', 'text', (c) => c.notNull().references('financial_nuclei.id'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('benefit_subtype', 'text')
    .addColumn('initial_balance_cents', 'integer', (c) => c.notNull())
    .addColumn('archived', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createIndex('resources_nucleus_idx').on('resources').column('nucleus_id').execute();

  await db.schema
    .createTable('resource_ownership')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('resource_id', 'text', (c) => c.notNull().references('resources.id'))
    .addColumn('person_id', 'text', (c) => c.notNull().references('persons.id'))
    .addColumn('ownership_type', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('resource_ownership_unique')
    .on('resource_ownership')
    .columns(['resource_id', 'person_id'])
    .unique()
    .execute();

  await db.schema
    .createTable('categories')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('nucleus_id', 'text', (c) => c.notNull().references('financial_nuclei.id'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('is_system', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createIndex('categories_nucleus_idx').on('categories').column('nucleus_id').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('categories').execute();
  await db.schema.dropTable('resource_ownership').execute();
  await db.schema.dropTable('resources').execute();
}
