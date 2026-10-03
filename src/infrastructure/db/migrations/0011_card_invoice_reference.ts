import { Migration } from 'kysely';
import { sql } from 'kysely';

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

  // Backfill do historico em SQL direto. So TRANSFER com a descricao legada identifica
  // pagamento de fatura; o cartao e a leg do proprio movimento cujo recurso e CREDIT_CARD.
  // Feito em SQL puro (e nao com o query builder) porque a subquery correlacionada precisa
  // referenciar a tabela externa, o que o builder nao expressa de forma confiavel aqui.
  await sql`
    UPDATE movements
       SET card_invoice_resource_id = (
             SELECT ml.resource_id
               FROM movement_legs ml
               JOIN resources r ON r.id = ml.resource_id
              WHERE ml.movement_id = movements.id
                AND r.type = 'CREDIT_CARD'
              LIMIT 1
           )
     WHERE type = 'TRANSFER'
       AND description LIKE 'Pagamento de fatura:%'
  `.execute(db);

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
