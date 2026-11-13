import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { closeCreditInvoiceInRepositories } from './CloseCreditInvoice';
import { invoiceOutstandingCents, payCreditInvoiceInRepositories, PayCreditInvoiceResult } from './PayCreditInvoice';
import { buildAuditLog, buildLegs, buildMovement } from './shared';

export type InvoiceDifferenceKind = 'CHARGES' | 'UNRECORDED_PURCHASE';

export interface SettleCreditInvoiceInput {
  nucleusId: string;
  cardResourceId: string;
  invoiceDueDate: string;
  paymentResourceId: string;
  date: string;
  /** Valor efetivamente pago ao banco. */
  paidAmountCents: number;
  /** Obrigatório quando o valor pago é maior que o total lançado na fatura. */
  differenceKind?: InvoiceDifferenceKind;
  createdByPersonId: string;
  clientOperationId: string;
}

const brl = (cents: number) => 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');

/**
 * Pagar a fatura em um passo (ADR D-040): consolida e paga na MESMA transação.
 *
 * - Valor pago menor que o lançado: recusado (pagamento parcial não é suportado).
 * - Valor pago maior: a diferença vira uma compra no próprio cartão, nesta fatura,
 *   classificada como juros e encargos ou como compra não lançada.
 * - A trava contra pagamento em dobro continua sendo a transição condicional de
 *   payCreditInvoiceInRepositories (ADR D-031). Qualquer falha desfaz tudo.
 */
export class SettleCreditInvoice {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: SettleCreditInvoiceInput): Promise<PayCreditInvoiceResult> {
    return this.uow.run(async (repos) => {
      // Antes de qualquer escrita: reenvio da mesma operação não lança a diferença de novo.
      const previous = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (previous) return { movementId: previous.id, wasAlreadyCreated: true, amountCents: 0 };

      const card = await repos.resources.findById(input.cardResourceId);
      if (!card || card.nucleusId !== input.nucleusId) throw new NotFoundError('Cartão', input.cardResourceId);
      if (card.type !== 'CREDIT_CARD') throw new DomainError('RESOURCE_NOT_CREDIT_CARD', 'O recurso selecionado não é um cartão de crédito.');
      const invoice = await repos.creditInvoices.findByCardAndDueDate(card.id, input.invoiceDueDate);
      if (invoice?.status === 'PAID') throw new DomainError('INVOICE_ALREADY_PAID', 'Esta fatura já foi paga.');

      const outstanding = await invoiceOutstandingCents(repos, input.nucleusId, card.id, input.invoiceDueDate);
      if (outstanding <= 0) throw new DomainError('INVOICE_EMPTY', 'Não há compras nesta fatura para pagar.');
      const difference = input.paidAmountCents - outstanding;
      if (difference < 0) {
        throw new DomainError('INVOICE_PARTIAL_NOT_SUPPORTED', `Pagamento parcial não é suportado. O total lançado nesta fatura é ${brl(outstanding)}.`);
      }
      if (difference > 0) {
        if (!input.differenceKind) {
          throw new DomainError('INVOICE_DIFFERENCE_UNCLASSIFIED', `O valor pago é ${brl(difference)} maior que o lançado. Informe se a diferença é de juros e encargos ou de uma compra não lançada.`);
        }
        const charges = input.differenceKind === 'CHARGES';
        // Categoria reconhecida pela chave, nunca pelo nome (ADR D-032).
        const category = charges ? (await repos.categories.listByNucleus(input.nucleusId)).find((item) => item.systemKey === 'CARD_CHARGES') : null;
        if (charges && !category) throw new DomainError('CARD_CHARGES_CATEGORY_MISSING', 'A categoria de juros e encargos não está disponível neste núcleo.');
        const movement = buildMovement({
          nucleusId: input.nucleusId, type: 'EXPENSE', status: 'CONFIRMED', date: input.date,
          description: (charges ? 'Juros e encargos da fatura: ' : 'Compra não lançada na fatura: ') + card.name,
          categoryId: category?.id ?? null, createdByPersonId: input.createdByPersonId,
          paymentMethod: 'CREDIT', invoiceDueDate: input.invoiceDueDate,
          clientOperationId: `${input.clientOperationId}:diferenca`,
        });
        await repos.movements.createWithLegs(movement, buildLegs(movement.id, [{ resourceId: card.id, amountCents: difference }]));
        await repos.auditLogs.record(buildAuditLog({
          entityType: 'Movement', entityId: movement.id, action: 'CREATE_EXPENSE', actorPersonId: input.createdByPersonId, nucleusId: input.nucleusId,
          after: { type: 'EXPENSE', resourceId: card.id, amountCents: difference, invoiceDifference: input.differenceKind, invoiceDueDate: input.invoiceDueDate },
        }));
      }

      if (!invoice || invoice.status === 'OPEN') {
        await closeCreditInvoiceInRepositories(repos, { nucleusId: input.nucleusId, cardResourceId: card.id, invoiceDueDate: input.invoiceDueDate });
      }
      const result = await payCreditInvoiceInRepositories(repos, input);
      if (result.amountCents !== input.paidAmountCents) {
        throw new DomainError('INVOICE_STATE_CHANGED', 'O total da fatura mudou durante o pagamento. Nada foi gravado; atualize a tela.');
      }
      return result;
    });
  }
}
