import { Kysely } from 'kysely';
import { CreditInvoiceRecord, CreditInvoiceRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';

export class KyselyCreditInvoiceRepository implements CreditInvoiceRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async findByCardAndDueDate(cardResourceId: string, dueDate: string): Promise<CreditInvoiceRecord | null> {
    const row = await this.db.selectFrom('credit_invoices').selectAll().where('card_resource_id', '=', cardResourceId).where('due_date', '=', dueDate).executeTakeFirst();
    return row ? this.map(row) : null;
  }
  async listByNucleus(nucleusId: string): Promise<CreditInvoiceRecord[]> {
    const rows = await this.db.selectFrom('credit_invoices').selectAll().where('nucleus_id', '=', nucleusId).execute();
    return rows.map((row) => this.map(row));
  }
  async create(record: CreditInvoiceRecord): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('credit_invoices').values({ id: record.id, nucleus_id: record.nucleusId, card_resource_id: record.cardResourceId, due_date: record.dueDate, status: record.status, closed_at: record.closedAt, paid_at: record.paidAt, payment_resource_id: record.paymentResourceId, payment_movement_id: record.paymentMovementId, created_at: now, updated_at: now }).execute();
  }
  async update(record: CreditInvoiceRecord): Promise<void> {
    await this.db.updateTable('credit_invoices').set({ status: record.status, closed_at: record.closedAt, paid_at: record.paidAt, payment_resource_id: record.paymentResourceId, payment_movement_id: record.paymentMovementId, updated_at: new Date().toISOString() }).where('id', '=', record.id).execute();
  }
  private map(row: { id: string; nucleus_id: string; card_resource_id: string; due_date: string; status: string; closed_at: string | null; paid_at: string | null; payment_resource_id: string | null; payment_movement_id: string | null }): CreditInvoiceRecord {
    return { id: row.id, nucleusId: row.nucleus_id, cardResourceId: row.card_resource_id, dueDate: row.due_date, status: row.status as CreditInvoiceRecord['status'], closedAt: row.closed_at, paidAt: row.paid_at, paymentResourceId: row.payment_resource_id, paymentMovementId: row.payment_movement_id };
  }
}
