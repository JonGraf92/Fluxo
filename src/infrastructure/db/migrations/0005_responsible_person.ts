import { Migration, sql } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .alterTable('movements')
    .addColumn('responsible_person_id', 'text', (column) => column.references('persons.id'))
    .execute();
  await db.updateTable('movements')
    .set({ responsible_person_id: sql.ref('created_by_person_id') })
    .execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('movements').dropColumn('responsible_person_id').execute();
}
