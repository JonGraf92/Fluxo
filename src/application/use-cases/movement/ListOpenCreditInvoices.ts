import { RepositoryContext } from '../../ports/RepositoryContext';

export interface OpenCreditInvoice {
  cardResourceId: string;
  cardName: string;
  dueDate: string;
  amountCents: number;
  status: 'OPEN' | 'CLOSED' | 'PAID';
  paidAt: string | null;
}

export class ListOpenCreditInvoices {
  constructor(private readonly repos: RepositoryContext) {}
  async execute(nucleusId: string): Promise<OpenCreditInvoice[]> {
    const [resources, movements, invoiceRecords] = await Promise.all([
      this.repos.resources.listByNucleus(nucleusId),
      this.repos.movements.list({ nucleusId, status: 'CONFIRMED' }),
      this.repos.creditInvoices.listByNucleus(nucleusId),
    ]);
    const cards = new Map(resources.filter((resource) => resource.type === 'CREDIT_CARD').map((card) => [card.id, card]));
    const invoices = new Map<string, OpenCreditInvoice>();
    const legs = await this.repos.movements.listLegsByMovementIds(movements.map((movement) => movement.id));
    const movementsById = new Map(movements.map((movement) => [movement.id, movement]));
    const invoiceStates = new Map(invoiceRecords.map((invoice) => [invoice.cardResourceId + ':' + invoice.dueDate, invoice]));
    for (const leg of legs) {
      const movement = movementsById.get(leg.movementId);
      if (!movement || movement.type !== 'EXPENSE' || movement.paymentMethod !== 'CREDIT' || !movement.invoiceDueDate) continue;
      const card = cards.get(leg.resourceId);
      if (!card) continue;
      const key = card.id + ':' + movement.invoiceDueDate;
      const state = invoiceStates.get(key);
      const invoice = invoices.get(key) ?? { cardResourceId: card.id, cardName: card.name, dueDate: movement.invoiceDueDate, amountCents: 0, status: state?.status ?? 'OPEN', paidAt: state?.paidAt ?? null };
      invoice.amountCents += leg.amountCents;
      invoices.set(key, invoice);
    }
    return [...invoices.values()].filter((invoice) => invoice.amountCents > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }
}
