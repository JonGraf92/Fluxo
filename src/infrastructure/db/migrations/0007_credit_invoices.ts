import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

export async function up(db: MigrationDb): Promise<void> {
  await db.schema.createTable('credit_invoices')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('nucleus_id', 'text', (column) => column.notNull().references('financial_nuclei.id'))
    .addColumn('card_resource_id', 'text', (column) => column.notNull().references('resources.id'))
    .addColumn('due_date', 'text', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('OPEN'))
    .addColumn('closed_at', 'text')
    .addColumn('paid_at', 'text')
    .addColumn('payment_resource_id', 'text', (column) => column.references('resources.id'))
    .addColumn('payment_movement_id', 'text', (column) => column.references('movements.id'))
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addColumn('updated_at', 'text', (column) => column.notNull())
    .addUniqueConstraint('credit_invoices_card_due_unique', ['card_resource_id', 'due_date'])
    .execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('credit_invoices').execute();
}
