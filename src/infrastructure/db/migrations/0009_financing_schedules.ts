import { v4 as uuid } from 'uuid';
import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

export async function up(db: MigrationDb): Promise<void> {
  await db.schema.createTable('financing_plans')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('nucleus_id', 'text', (column) => column.notNull().references('financial_nuclei.id'))
    .addColumn('category_id', 'text', (column) => column.notNull().references('categories.id'))
    .addColumn('asset_type', 'text', (column) => column.notNull())
    .addColumn('description', 'text', (column) => column.notNull())
    .addColumn('term_months', 'integer', (column) => column.notNull())
    .addColumn('installment_amount_cents', 'integer', (column) => column.notNull())
    .addColumn('first_due_date', 'text', (column) => column.notNull())
    .addColumn('payment_resource_id', 'text', (column) => column.notNull().references('resources.id'))
    .addColumn('responsible_person_id', 'text', (column) => column.notNull().references('persons.id'))
    .addColumn('created_by_person_id', 'text', (column) => column.notNull().references('persons.id'))
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('ACTIVE'))
    .addColumn('created_at', 'text', (column) => column.notNull())
    .execute();

  await db.schema.createIndex('financing_plans_nucleus_idx').on('financing_plans').column('nucleus_id').execute();

  await db.schema.createTable('financing_installments')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('plan_id', 'text', (column) => column.notNull().references('financing_plans.id'))
    .addColumn('installment_number', 'integer', (column) => column.notNull())
    .addColumn('due_date', 'text', (column) => column.notNull())
    .addColumn('amount_cents', 'integer', (column) => column.notNull())
    .addColumn('paid_amount_cents', 'integer')
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('PENDING'))
    .addColumn('paid_at', 'text')
    .addColumn('payment_movement_id', 'text', (column) => column.references('movements.id'))
    .addColumn('payment_resource_id', 'text', (column) => column.notNull().references('resources.id'))
    .addUniqueConstraint('financing_installments_plan_number_unique', ['plan_id', 'installment_number'])
    .execute();

  await db.schema.createIndex('financing_installments_due_idx').on('financing_installments').column('due_date').execute();

  const nuclei = await db.selectFrom('financial_nuclei').select('id').execute();
  const createdAt = new Date().toISOString();
  for (const nucleus of nuclei) {
    const existing = await db.selectFrom('categories').select('id')
      .where('nucleus_id', '=', nucleus.id).where('name', '=', 'Financiamentos').where('kind', '=', 'EXPENSE')
      .executeTakeFirst();
    if (!existing) {
      await db.insertInto('categories').values({
        id: uuid(), nucleus_id: nucleus.id, name: 'Financiamentos', kind: 'EXPENSE', is_system: 1, created_at: createdAt,
      }).execute();
    }
  }
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('financing_installments').execute();
  await db.schema.dropTable('financing_plans').execute();
  // A categoria fica preservada, inclusive se o usuário já a tiver usado.
}
