import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { Money } from '../../../domain/value-objects/Money';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog, buildLegs, buildMovement } from './shared';

export interface PayCreditInvoiceInput {
  nucleusId: string;
  cardResourceId: string;
  invoiceDueDate: string;
  paymentResourceId: string;
  date: string;
  createdByPersonId: string;
  clientOperationId: string;
}

export class PayCreditInvoice {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: PayCreditInvoiceInput): Promise<{ movementId: string; wasAlreadyCreated: boolean; amountCents: number }> {
    return this.uow.run(async (repos) => {
      const previous = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (previous) return { movementId: previous.id, wasAlreadyCreated: true, amountCents: 0 };
      const card = await repos.resources.findById(input.cardResourceId);
      const source = await repos.resources.findById(input.paymentResourceId);
      if (!card || card.nucleusId !== input.nucleusId) throw new NotFoundError('Cartão', input.cardResourceId);
      if (!source || source.nucleusId !== input.nucleusId) throw new NotFoundError('Conta', input.paymentResourceId);
      if (card.type !== 'CREDIT_CARD') throw new DomainError('RESOURCE_NOT_CREDIT_CARD', 'O recurso selecionado não é um cartão de crédito.');
      const invoice = await repos.creditInvoices.findByCardAndDueDate(card.id, input.invoiceDueDate);
      if (!invoice || invoice.status !== 'CLOSED') throw new DomainError('INVOICE_MUST_BE_CLOSED', 'Consolide a fatura antes de registrar o pagamento.');
      if (source.type !== 'MONEY_ACCOUNT' && source.type !== 'CASH') throw new DomainError('PAYMENT_SOURCE_INVALID', 'A fatura deve ser paga com uma conta ou dinheiro físico.');
      if (source.archived || card.archived) throw new DomainError('RESOURCE_ARCHIVED', 'Não é possível usar um recurso arquivado.');
      const [allMovements, resources] = await Promise.all([
        repos.movements.list({ nucleusId: input.nucleusId, status: 'CONFIRMED' }),
        repos.resources.listByNucleus(input.nucleusId),
      ]);
      const cardIds = new Set(resources.filter((resource) => resource.type === 'CREDIT_CARD').map((resource) => resource.id));
      const legs = await repos.movements.listLegsByMovementIds(allMovements.map((movement) => movement.id));
      const byId = new Map(allMovements.map((movement) => [movement.id, movement]));
      let amountCents = 0;
      for (const leg of legs) {
        const movement = byId.get(leg.movementId);
        if (movement?.type === 'EXPENSE' && movement.paymentMethod === 'CREDIT' && movement.invoiceDueDate === input.invoiceDueDate && leg.resourceId === card.id) amountCents += leg.amountCents;
        if (movement?.type === 'TRANSFER' && movement.description.startsWith('Pagamento de fatura:') && movement.invoiceDueDate === input.invoiceDueDate && cardIds.has(leg.resourceId) && leg.resourceId === card.id) amountCents += leg.amountCents;
      }
      if (amountCents <= 0) throw new DomainError('INVOICE_ALREADY_PAID', 'Esta fatura não tem saldo pendente.');
      const balanceLegs = await repos.movements.listLegsForBalance(input.nucleusId);
      const availableBalance = calculateResourceBalance(source.id, source.initialBalanceCents, balanceLegs).toCents();
      if (availableBalance < amountCents) {
        throw new DomainError('INSUFFICIENT_BALANCE', 'Saldo insuficiente na conta selecionada para pagar esta fatura.');
      }
      const amount = Money.fromCents(amountCents);
      const movement = buildMovement({
        nucleusId: input.nucleusId, type: 'TRANSFER', status: 'CONFIRMED', date: input.date,
        description: 'Pagamento de fatura: ' + card.name, categoryId: null, createdByPersonId: input.createdByPersonId,
        paymentMethod: null, invoiceDueDate: input.invoiceDueDate, clientOperationId: input.clientOperationId,
      });
      await repos.movements.createWithLegs(movement, buildLegs(movement.id, [
        { resourceId: source.id, amountCents: amount.negate().toCents() },
        { resourceId: card.id, amountCents: amount.negate().toCents() },
      ]));
      await repos.creditInvoices.update({ ...invoice, status: 'PAID', paidAt: input.date, paymentResourceId: source.id, paymentMovementId: movement.id });
      await repos.auditLogs.record(buildAuditLog({ entityType: 'Movement', entityId: movement.id, action: 'PAY_CREDIT_INVOICE', actorPersonId: input.createdByPersonId, nucleusId: input.nucleusId, after: { cardResourceId: card.id, paymentResourceId: source.id, invoiceDueDate: input.invoiceDueDate, amountCents } }));
      return { movementId: movement.id, wasAlreadyCreated: false, amountCents };
    });
  }
}
