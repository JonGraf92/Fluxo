import { v4 as uuid } from 'uuid';
import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/**
 * Empréstimo como tipo de plano em `financing_plans` (ADR D-036).
 *
 * As três colunas são nulas para os financiamentos existentes e obrigatórias, pela regra
 * do caso de uso e do repositório, quando `asset_type = 'LOAN'`. Valor em centavos e taxa
 * em centésimos de ponto percentual — inteiros, nunca float (ADR D-004).
 */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('financing_plans').addColumn('principal_amount_cents', 'integer').execute();
  await db.schema.alterTable('financing_plans').addColumn('interest_rate_bps', 'integer').execute();
  await db.schema.alterTable('financing_plans').addColumn('interest_rate_period', 'text').execute();

  // Núcleos que já existem ganham a categoria de sistema "Empréstimos"; os novos a recebem
  // pela lista padrão (DEFAULT_EXPENSE_CATEGORIES).
  const nuclei = await db.selectFrom('financial_nuclei').select('id').execute();
  const createdAt = new Date().toISOString();
  for (const nucleus of nuclei) {
    const existing = await db.selectFrom('categories').select('id')
      .where('nucleus_id', '=', nucleus.id).where('name', '=', 'Empréstimos').where('kind', '=', 'EXPENSE')
      .executeTakeFirst();
    if (!existing) {
      await db.insertInto('categories').values({
        id: uuid(), nucleus_id: nucleus.id, name: 'Empréstimos', kind: 'EXPENSE', is_system: 1, created_at: createdAt,
      }).execute();
    }
  }
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('financing_plans').dropColumn('interest_rate_period').execute();
  await db.schema.alterTable('financing_plans').dropColumn('interest_rate_bps').execute();
  await db.schema.alterTable('financing_plans').dropColumn('principal_amount_cents').execute();
  // A categoria fica preservada, inclusive se o usuário já a tiver usado.
}
