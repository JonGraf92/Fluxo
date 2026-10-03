import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { newId } from './shared';

export class CloseCreditInvoice {
  constructor(private readonly uow: UnitOfWork) {}
  async execute(input: { nucleusId: string; cardResourceId: string; invoiceDueDate: string }): Promise<{ closed: boolean }> {
    return this.uow.run(async (repos) => {
      const card = await repos.resources.findById(input.cardResourceId);
      if (!card || card.nucleusId !== input.nucleusId) throw new NotFoundError('Cartão', input.cardResourceId);
      if (card.type !== 'CREDIT_CARD') throw new DomainError('RESOURCE_NOT_CREDIT_CARD', 'O recurso selecionado não é um cartão de crédito.');
      const movements = await repos.movements.list({ nucleusId: input.nucleusId, status: 'CONFIRMED' });
      const purchaseMovements = movements.filter((movement) => movement.type === 'EXPENSE' && movement.paymentMethod === 'CREDIT' && movement.invoiceDueDate === input.invoiceDueDate);
      const legs = await repos.movements.listLegsByMovementIds(purchaseMovements.map((movement) => movement.id));
      const total = legs.filter((leg) => leg.resourceId === card.id).reduce((sum, leg) => sum + leg.amountCents, 0);
      if (total <= 0) throw new DomainError('INVOICE_EMPTY', 'Não há compras nesta fatura para consolidar.');
      const current = await repos.creditInvoices.findByCardAndDueDate(card.id, input.invoiceDueDate);
      if (current?.status === 'CLOSED' || current?.status === 'PAID') throw new DomainError('INVOICE_ALREADY_CLOSED', 'Esta fatura já foi consolidada.');
      const now = new Date().toISOString();
      const record = { id: current?.id ?? newId(), nucleusId: input.nucleusId, cardResourceId: card.id, dueDate: input.invoiceDueDate, status: 'CLOSED' as const, closedAt: now, paidAt: null, paymentResourceId: null, paymentMovementId: null };
      if (current) await repos.creditInvoices.update(record);
      else await repos.creditInvoices.create(record);
      return { closed: true };
    });
  }
}
