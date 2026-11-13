import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { Money } from '../../../domain/value-objects/Money';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { RepositoryContext } from '../../ports/RepositoryContext';
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

export interface PayCreditInvoiceResult {
  movementId: string;
  wasAlreadyCreated: boolean;
  amountCents: number;
}

export class PayCreditInvoice {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: PayCreditInvoiceInput): Promise<PayCreditInvoiceResult> {
    return this.uow.run((repos) => payCreditInvoiceInRepositories(repos, input));
  }
}

/** Saldo devedor da fatura: compras confirmadas do ciclo menos pagamentos já feitos. */
export async function invoiceOutstandingCents(repos: RepositoryContext, nucleusId: string, cardId: string, invoiceDueDate: string): Promise<number> {
  const allMovements = await repos.movements.list({ nucleusId, status: 'CONFIRMED' });
  const legs = await repos.movements.listLegsByMovementIds(allMovements.map((movement) => movement.id));
  const byId = new Map(allMovements.map((movement) => [movement.id, movement]));
  let amountCents = 0;
  for (const leg of legs) {
    if (leg.resourceId !== cardId) continue;
    const movement = byId.get(leg.movementId);
    // Compras no cartao entram como EXPENSE com paymentMethod CREDIT.
    if (movement?.type === 'EXPENSE' && movement.paymentMethod === 'CREDIT' && movement.invoiceDueDate === invoiceDueDate) amountCents += leg.amountCents;
    // Pagamentos anteriores desta fatura sao identificados pela REFERENCIA ESTRUTURAL
    // (cardInvoiceResourceId), nunca por texto (ADR D-032): a descricao pode ser renomeada,
    // traduzida ou editada sem que o pagamento deixe de ser reconhecido.
    if (movement?.type === 'TRANSFER' && movement.cardInvoiceResourceId === cardId && movement.invoiceDueDate === invoiceDueDate) amountCents += leg.amountCents;
  }
  return amountCents;
}

/** Reúso transacional pelo pagamento em um passo (ADR D-040). */
export async function payCreditInvoiceInRepositories(repos: RepositoryContext, input: PayCreditInvoiceInput): Promise<PayCreditInvoiceResult> {
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
      const amountCents = await invoiceOutstandingCents(repos, input.nucleusId, card.id, input.invoiceDueDate);
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
        paymentMethod: null, invoiceDueDate: input.invoiceDueDate,
        cardInvoiceResourceId: card.id, clientOperationId: input.clientOperationId,
      });
      await repos.movements.createWithLegs(movement, buildLegs(movement.id, [
        { resourceId: source.id, amountCents: amount.negate().toCents() },
        { resourceId: card.id, amountCents: amount.negate().toCents() },
      ]));
      // Quitacao CONDICIONAL: o `where status = 'CLOSED'` vive dentro do UPDATE, entao duas
      // operacoes concorrentes com clientOperationId distintos nao conseguem debitar o caixa
      // duas vezes. Antes, a leitura do status (linha 30) e a escrita ficavam separadas no
      // tempo e ambas passavam pela validacao — o caixa saia debitado em dobro.
      const invoicesUpdated = await repos.creditInvoices.markPaid(invoice.id, input.date, source.id, movement.id);
      if (invoicesUpdated !== 1) {
        throw new DomainError(
          'INVOICE_STATE_CHANGED',
          'Esta fatura foi paga por outra operacao enquanto este pagamento era processado. Nenhum valor foi debitado; atualize a tela.',
        );
      }
      await repos.auditLogs.record(buildAuditLog({ entityType: 'Movement', entityId: movement.id, action: 'PAY_CREDIT_INVOICE', actorPersonId: input.createdByPersonId, nucleusId: input.nucleusId, after: { cardResourceId: card.id, paymentResourceId: source.id, invoiceDueDate: input.invoiceDueDate, amountCents } }));
      return { movementId: movement.id, wasAlreadyCreated: false, amountCents };
}
