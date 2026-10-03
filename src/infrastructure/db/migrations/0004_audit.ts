import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** audit_logs — trilha de auditoria (seção 35). */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .createTable('audit_logs')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('entity_type', 'text', (c) => c.notNull())
    .addColumn('entity_id', 'text', (c) => c.notNull())
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('actor_person_id', 'text')
    .addColumn('nucleus_id', 'text')
    .addColumn('occurred_at', 'text', (c) => c.notNull())
    .addColumn('before_json', 'text')
    .addColumn('after_json', 'text')
    .execute();

  await db.schema.createIndex('audit_logs_entity_idx').on('audit_logs').columns(['entity_type', 'entity_id']).execute();
  await db.schema.createIndex('audit_logs_nucleus_idx').on('audit_logs').column('nucleus_id').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('audit_logs').execute();
}
