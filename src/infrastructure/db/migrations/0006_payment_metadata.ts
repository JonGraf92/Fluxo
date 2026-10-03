import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('resources').addColumn('statement_due_day', 'integer').execute();
  await db.schema.alterTable('movements').addColumn('payment_method', 'text').execute();
  await db.schema.alterTable('movements').addColumn('invoice_due_date', 'text').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('movements').dropColumn('invoice_due_date').execute();
  await db.schema.alterTable('movements').dropColumn('payment_method').execute();
  await db.schema.alterTable('resources').dropColumn('statement_due_day').execute();
}
