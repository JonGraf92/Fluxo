import { Migration, sql } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** persons, local_identity, financial_nuclei, memberships — núcleo de identidade/participação. */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema
    .createTable('persons')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('display_name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createTable('local_identity')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('person_id', 'text', (c) => c.notNull().references('persons.id'))
    .addColumn('installed_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createTable('financial_nuclei')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createTable('memberships')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('person_id', 'text', (c) => c.notNull().references('persons.id'))
    .addColumn('nucleus_id', 'text', (c) => c.notNull().references('financial_nuclei.id'))
    .addColumn('role', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex('memberships_person_nucleus_unique')
    .on('memberships')
    .columns(['person_id', 'nucleus_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('memberships_nucleus_idx')
    .on('memberships')
    .column('nucleus_id')
    .execute();

  await sql`SELECT 1`.execute(db); // no-op, mantém a assinatura async consistente
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('memberships').execute();
  await db.schema.dropTable('financial_nuclei').execute();
  await db.schema.dropTable('local_identity').execute();
  await db.schema.dropTable('persons').execute();
}
