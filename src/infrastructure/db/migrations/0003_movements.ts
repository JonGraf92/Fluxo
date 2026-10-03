import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** movements, movement_legs, adjustments — o ledger central (ADR D-009/D-018/D-019). */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .createTable('movements')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('nucleus_id', 'text', (c) => c.notNull().references('financial_nuclei.id'))
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('date', 'text', (c) => c.notNull())
    .addColumn('description', 'text', (c) => c.notNull())
    .addColumn('category_id', 'text')
    .addColumn('created_by_person_id', 'text', (c) => c.notNull().references('persons.id'))
    .addColumn('client_operation_id', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .addColumn('cancelled_at', 'text')
    .addColumn('cancelled_reason', 'text')
    .execute();

  await db.schema
    .createIndex('movements_idempotency_unique')
    .on('movements')
    .columns(['nucleus_id', 'client_operation_id'])
    .unique()
    .execute();

  await db.schema.createIndex('movements_nucleus_date_idx').on('movements').columns(['nucleus_id', 'date']).execute();
  await db.schema.createIndex('movements_status_idx').on('movements').column('status').execute();

  await db.schema
    .createTable('movement_legs')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('movement_id', 'text', (c) => c.notNull().references('movements.id'))
    .addColumn('resource_id', 'text', (c) => c.notNull().references('resources.id'))
    .addColumn('amount_cents', 'integer', (c) => c.notNull())
    .addColumn('sequence', 'integer', (c) => c.notNull())
    .execute();

  await db.schema.createIndex('movement_legs_resource_idx').on('movement_legs').column('resource_id').execute();
  await db.schema.createIndex('movement_legs_movement_idx').on('movement_legs').column('movement_id').execute();

  await db.schema
    .createTable('adjustments')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('movement_id', 'text', (c) => c.notNull().references('movements.id'))
    .addColumn('resource_id', 'text', (c) => c.notNull().references('resources.id'))
    .addColumn('reason', 'text', (c) => c.notNull())
    .addColumn('created_by_person_id', 'text', (c) => c.notNull().references('persons.id'))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('adjustments').execute();
  await db.schema.dropTable('movement_legs').execute();
  await db.schema.dropTable('movements').execute();
}
