import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** Prazo informado manualmente para resgate de aplicações, em dias. */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('resources').addColumn('liquidity_days', 'integer').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('resources').dropColumn('liquidity_days').execute();
}
