import { v4 as uuid } from 'uuid';
import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/**
 * Categoria Combustível com detalhes do abastecimento (ADR D-038).
 *
 * - categories.system_key: identifica a categoria por chave, não pelo nome (ADR D-032).
 * - fuel_details / fuel_detail_taxes: leitura apenas; nada aqui entra em saldo.
 */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('categories').addColumn('system_key', 'text').execute();

  const nuclei = await db.selectFrom('financial_nuclei').select('id').execute();
  const createdAt = new Date().toISOString();
  for (const nucleus of nuclei) {
    // Uso único do nome: se o usuário já criou "Combustível", ela é adotada em vez de duplicada.
    const existing = await db.selectFrom('categories').select('id')
      .where('nucleus_id', '=', nucleus.id).where('name', '=', 'Combustível').where('kind', '=', 'EXPENSE')
      .executeTakeFirst();
    if (existing) {
      await db.updateTable('categories').set({ system_key: 'FUEL' }).where('id', '=', existing.id).execute();
    } else {
      await db.insertInto('categories').values({
        id: uuid(), nucleus_id: nucleus.id, name: 'Combustível', kind: 'EXPENSE', is_system: 1, system_key: 'FUEL', created_at: createdAt,
      }).execute();
    }
  }
  // NULL não conflita em índice único no SQLite: só uma categoria por chave em cada núcleo.
  await db.schema.createIndex('categories_system_key_unique').on('categories').columns(['nucleus_id', 'system_key']).unique().execute();

  await db.schema.createTable('fuel_details')
    .addColumn('movement_id', 'text', (c) => c.primaryKey().references('movements.id'))
    .addColumn('fuel_type', 'text')
    .addColumn('price_per_liter_millis', 'integer')
    .addColumn('quantity_ml', 'integer')
    .addColumn('odometer_km', 'integer')
    .addColumn('station_name', 'text')
    .addColumn('station_cnpj', 'text')
    .addColumn('station_address', 'text')
    .addColumn('tax_total_cents', 'integer')
    .addColumn('provenance', 'text', (c) => c.notNull())
    .addColumn('access_key', 'text')
    .execute();
  await db.schema.createIndex('fuel_details_access_key_unique').on('fuel_details').column('access_key').unique().execute();

  await db.schema.createTable('fuel_detail_taxes')
    .addColumn('movement_id', 'text', (c) => c.notNull().references('fuel_details.movement_id'))
    .addColumn('tax_code', 'text', (c) => c.notNull())
    .addColumn('amount_cents', 'integer', (c) => c.notNull())
    .addPrimaryKeyConstraint('fuel_detail_taxes_pk', ['movement_id', 'tax_code'])
    .execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('fuel_detail_taxes').execute();
  await db.schema.dropTable('fuel_details').execute();
  await db.schema.dropIndex('categories_system_key_unique').execute();
  await db.schema.alterTable('categories').dropColumn('system_key').execute();
  // A categoria fica preservada, inclusive se o usuário já a tiver usado.
}
