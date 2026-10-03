import { Migration } from 'kysely';

type MigrationDb = Parameters<Migration['up']>[0];

/**
 * Substitui a identificacao de pagamento de fatura por TEXTO por uma referencia ESTRUTURAL.
 *
 * PayCreditInvoice.ts:44 reconhecia o pagamento da fatura com
 * `movement.description.startsWith('Pagamento de fatura:')` — semantica financeira apoiada
 * na descricao exibida ao usuario. Renomear a string em portugues, traduzir a interface ou
 * deixar o usuario editar a descricao quebrava silenciosamente o calculo do saldo devedor
 * da fatura, fazendo o app cobrar de novo uma fatura ja paga.
 *
 * A coluna `card_invoice_resource_id` guarda o cartao cuja fatura este movimento quitou.
 * E nula em todo movimento que nao e pagamento de fatura, o que torna a identificacao exata
 * e independente de idioma, texto ou edicao posterior pelo usuario.
 *
 * Backfill: reconstruir a referencia a partir do texto para os movimentos ja gravados, para
 * que historico existente continue calculando o mesmo saldo devedor apos a migracao.
 */
export async function up(db: MigrationDb): Promise<void> {
  await db.schema.alterTable('movements').addColumn('card_invoice_resource_id', 'text').execute();

  // Backfill do historico: so TRANSFER com a descricao legada identifica pagamento de fatura.
  // O cartao e a leg do proprio movimento cujo recurso e do tipo CREDIT_CARD.
  await db.executeQuery(
    db
      .updateTable('movements')
      .set((eb) => ({
        card_invoice_resource_id: eb
          .selectFrom('movement_legs')
          .innerJoin('resources', 'resources.id', 'movement_legs.resource_id')
          .select('movement_legs.resource_id')
          .whereRef('movement_legs.movement_id', '=', 'movements.id')
          .where('resources.type', '=', 'CREDIT_CARD')
          .limit(1)
          .as('card_invoice_resource_id'),
      }))
      .where('type', '=', 'TRANSFER')
      .where('description', 'like', 'Pagamento de fatura:%')
      .compile(),
  );

  await db.schema
    .createIndex('movements_card_invoice_idx')
    .on('movements')
    .column('card_invoice_resource_id')
    .execute();
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropIndex('movements_card_invoice_idx').execute();
  await db.schema.alterTable('movements').dropColumn('card_invoice_resource_id').execute();
}
