import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { runMigrations } from '../src/infrastructure/db/migrate';
import { Database as DbSchema } from '../src/infrastructure/db/types';

/**
 * Varredura de integridade do ledger.
 *
 * Confere, sobre os dados REAIS de um banco, as invariantes que o LedgerInvariants garante
 * na escrita. Serve para duas coisas:
 *   1. validar bancos criados ANTES das correcoes da Fase 1 (que podem conter violacoes);
 *   2. servir de verificacao periodica de saude do banco do usuario.
 *
 * Uso: node scripts/integrity-scan.mjs [caminho-do-banco]
 * Sem argumento, cria um banco temporario migrado e escaneia (util para smoke test).
 */

const dbPath = process.argv[2] ?? ':memory:';

const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');
const db = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: sqlite }) });

await runMigrations(db);

const findings = [];
function report(severity, codigo, detalhe) {
  findings.push({ severity, codigo, detalhe });
}

// 1) Movimento sem nenhuma partida (viola D-018).
const semLegs = await db
  .selectFrom('movements as m')
  .leftJoin('movement_legs as l', 'l.movement_id', 'm.id')
  .select(['m.id', 'm.type', 'm.description'])
  .where('l.id', 'is', null)
  .execute();
for (const row of semLegs) {
  report('CRITICO', 'MOVIMENTO_SEM_PARTIDAS', `${row.type} "${row.description}" (${row.id})`);
}

// 2) Partida de valor zero.
const legsZero = await db.selectFrom('movement_legs').selectAll().where('amount_cents', '=', 0).execute();
for (const row of legsZero) {
  report('ALTO', 'PARTIDA_ZERO', `leg ${row.id} do movimento ${row.movement_id}`);
}

// 3) Transferencia entre ATIVOS cujas pontas nao se cancelam.
//    Liquidacao de passivo (pagamento de fatura) tem duas pontas negativas e NAO entra aqui.
const transferencias = await db
  .selectFrom('movements')
  .select(['id', 'description', 'type'])
  .where('type', '=', 'TRANSFER')
  .execute();

for (const movement of transferencias) {
  const legs = await db
    .selectFrom('movement_legs as l')
    .innerJoin('resources as r', 'r.id', 'l.resource_id')
    .select(['l.amount_cents', 'r.type as resource_type'])
    .where('l.movement_id', '=', movement.id)
    .execute();

  if (legs.length !== 2) {
    report('ALTO', 'TRANSFERENCIA_SEM_DUAS_PONTAS', `"${movement.description}" (${movement.id}) tem ${legs.length} partida(s)`);
    continue;
  }

  const envolvePassivo = legs.some((leg) => leg.resource_type === 'CREDIT_CARD');
  const soma = legs.reduce((acc, leg) => acc + leg.amount_cents, 0);

  if (envolvePassivo) {
    const ambasNegativas = legs.every((leg) => leg.amount_cents < 0);
    const valoresIguais = legs[0].amount_cents === legs[1].amount_cents;
    if (!ambasNegativas || !valoresIguais) {
      report('ALTO', 'LIQUIDACAO_PASSIVO_INCONSISTENTE', `"${movement.description}" (${movement.id}): valores ${legs.map((l) => l.amount_cents).join(' e ')}`);
    }
  } else if (soma !== 0) {
    report('CRITICO', 'TRANSFERENCIA_NAO_ZERA', `"${movement.description}" (${movement.id}): soma ${soma}`);
  }
}

// 4) Saida em recurso de dinheiro/beneficio com sinal invertido.
const despesas = await db
  .selectFrom('movements as m')
  .innerJoin('movement_legs as l', 'l.movement_id', 'm.id')
  .innerJoin('resources as r', 'r.id', 'l.resource_id')
  .select(['m.id', 'm.description', 'm.payment_method', 'l.amount_cents', 'r.type as resource_type'])
  .where('m.type', '=', 'EXPENSE')
  .execute();

for (const row of despesas) {
  const ehCartao = row.resource_type === 'CREDIT_CARD';
  if (ehCartao && row.amount_cents < 0) {
    report('ALTO', 'COMPRA_CARTAO_COM_SINAL_INVERTIDO', `"${row.description}" (${row.id}): ${row.amount_cents}`);
  }
  if (!ehCartao && row.amount_cents > 0 && row.payment_method !== 'CREDIT') {
    report('CRITICO', 'SAIDA_CREDITANDO_RECURSO', `"${row.description}" (${row.id}): ${row.amount_cents} em ${row.resource_type}`);
  }
}

// 5) Saldo inicial negativo em recurso de dinheiro (nao deveria existir).
const iniciaisNegativos = await db
  .selectFrom('resources')
  .selectAll()
  .where('initial_balance_cents', '<', 0)
  .execute();
for (const row of iniciaisNegativos) {
  report('MEDIO', 'SALDO_INICIAL_NEGATIVO', `${row.name} (${row.id}): ${row.initial_balance_cents}`);
}

// 6) Fatura marcada PAID sem movimento de pagamento vinculado.
const faturasPagas = await db
  .selectFrom('credit_invoices')
  .selectAll()
  .where('status', '=', 'PAID')
  .execute();
for (const row of faturasPagas) {
  if (!row.payment_movement_id) {
    report('ALTO', 'FATURA_PAGA_SEM_MOVIMENTO', `fatura ${row.id} (venc. ${row.due_date})`);
  }
}

// 7) Pagamento de fatura antigo identificado apenas por texto e sem referencia estrutural
//    (o backfill da migration 0011 deveria ter resolvido todos).
const pagamentosSemRef = await db
  .selectFrom('movements')
  .selectAll()
  .where('type', '=', 'TRANSFER')
  .where('description', 'like', 'Pagamento de fatura:%')
  .where('card_invoice_resource_id', 'is', null)
  .execute();
for (const row of pagamentosSemRef) {
  report('MEDIO', 'PAGAMENTO_SEM_REFERENCIA_ESTRUTURAL', `"${row.description}" (${row.id})`);
}

const ordem = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 };
findings.sort((a, b) => ordem[a.severity] - ordem[b.severity]);

console.log('');
console.log('=== VARREDURA DE INTEGRIDADE DO LEDGER ===');
console.log(`banco: ${dbPath}`);
console.log(`movimentos: ${(await db.selectFrom('movements').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()).n}`);
console.log(`partidas:   ${(await db.selectFrom('movement_legs').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()).n}`);
console.log('');

if (findings.length === 0) {
  console.log('OK — nenhuma violacao encontrada.');
} else {
  for (const f of findings) {
    console.log(`[${f.severity}] ${f.codigo}: ${f.detalhe}`);
  }
  console.log('');
  console.log(`TOTAL: ${findings.length} achado(s).`);
}

await db.destroy();
process.exit(findings.some((f) => f.severity === 'CRITICO') ? 1 : 0);
