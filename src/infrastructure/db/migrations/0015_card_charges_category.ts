import { v4 as uuid } from 'uuid';
import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/** Categoria de sistema "Juros e encargos" (chave CARD_CHARGES) para o pagamento de fatura (ADR D-040). */
export async function up(db: MigrationDb): Promise<void> {
  const nuclei = await db.selectFrom('financial_nuclei').select('id').execute();
  const createdAt = new Date().toISOString();
  for (const nucleus of nuclei) {
    // Uso único do nome: categoria que o usuário já criou é adotada em vez de duplicada.
    const existing = await db.selectFrom('categories').select('id')
      .where('nucleus_id', '=', nucleus.id).where('name', '=', 'Juros e encargos').where('kind', '=', 'EXPENSE')
      .executeTakeFirst();
    if (existing) {
      await db.updateTable('categories').set({ system_key: 'CARD_CHARGES' }).where('id', '=', existing.id).execute();
    } else {
      await db.insertInto('categories').values({
        id: uuid(), nucleus_id: nucleus.id, name: 'Juros e encargos', kind: 'EXPENSE', is_system: 1, system_key: 'CARD_CHARGES', created_at: createdAt,
      }).execute();
    }
  }
}

export async function down(db: MigrationDb): Promise<void> {
  // A categoria fica preservada, inclusive se já tiver sido usada; só deixa de ter chave.
  await db.updateTable('categories').set({ system_key: null }).where('system_key', '=', 'CARD_CHARGES').execute();
}
