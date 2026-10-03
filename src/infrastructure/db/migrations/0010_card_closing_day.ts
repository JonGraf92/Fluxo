import { Migration, sql } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** Dia mensal de corte da fatura do cartão. */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('resources').addColumn('statement_closing_day', 'integer').execute();
  // Existing cards get an initial estimate five days before the due day; users can edit it in Recursos.
  await db.updateTable('resources').set({
    statement_closing_day: sql<number>`CASE WHEN statement_due_day > 5 THEN statement_due_day - 5 ELSE 25 END`,
  }).where('type', '=', 'CREDIT_CARD').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('resources').dropColumn('statement_closing_day').execute();
}
