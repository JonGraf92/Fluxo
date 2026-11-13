import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/**
 * Compra parcelada no cartão (ADR D-039): as parcelas são movimentos comuns, ligados por
 * installment_group_id. As três colunas são nulas em todo movimento que não é parcela.
 */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('movements').addColumn('installment_group_id', 'text').execute();
  await db.schema.alterTable('movements').addColumn('installment_number', 'integer').execute();
  await db.schema.alterTable('movements').addColumn('installment_count', 'integer').execute();
  await db.schema.createIndex('movements_installment_group_idx').on('movements').column('installment_group_id').execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropIndex('movements_installment_group_idx').execute();
  await db.schema.alterTable('movements').dropColumn('installment_count').execute();
  await db.schema.alterTable('movements').dropColumn('installment_number').execute();
  await db.schema.alterTable('movements').dropColumn('installment_group_id').execute();
}
