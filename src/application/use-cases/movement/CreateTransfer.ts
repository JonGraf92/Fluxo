import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { planTransfer } from '../../../domain/services/TransferPolicy';
import { Money } from '../../../domain/value-objects/Money';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog, buildLegs, buildMovement } from './shared';

export interface CreateTransferInput {
  nucleusId: string;
  fromResourceId: string;
  toResourceId: string;
  amountCents: number;
  description: string;
  date: string;
  createdByPersonId: string;
  clientOperationId: string;
}

export interface CreateTransferResult {
  movementId: string;
  wasAlreadyCreated: boolean;
}

/**
 * TRANSFERÊNCIA — seção 20 / Regra 4: transferência ≠ despesa. Este caso de uso é o mais
 * sensível do sistema: gera SEMPRE duas legs (origem negativa, destino positiva) dentro de
 * uma única transação atômica. `category_id` é sempre null — uma transferência nunca é
 * classificável como entrada ou saída.
 *
 * Se a gravação da segunda leg falhar por qualquer motivo, o UnitOfWork desfaz TUDO
 * (inclusive o Movement e a primeira leg) — nunca fica "meia transferência" (cenário 59).
 */
export class CreateTransfer {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateTransferInput): Promise<CreateTransferResult> {
    return this.uow.run(async (repos) => {
      const existing = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (existing) {
        return { movementId: existing.id, wasAlreadyCreated: true };
      }

      const [fromResource, toResource] = await Promise.all([
        repos.resources.findById(input.fromResourceId),
        repos.resources.findById(input.toResourceId),
      ]);

      if (!fromResource || fromResource.nucleusId !== input.nucleusId) {
        throw new NotFoundError('Recurso de origem', input.fromResourceId);
      }
      if (!toResource || toResource.nucleusId !== input.nucleusId) {
        throw new NotFoundError('Recurso de destino', input.toResourceId);
      }
      if (fromResource.archived || toResource.archived) {
        throw new DomainError('RESOURCE_ARCHIVED', 'Não é possível transferir de/para um recurso arquivado.');
      }

      // Recheck application liquidity inside the transaction; the UI balance may be stale.
      if (fromResource.type === 'APPLICATION' || toResource.type === 'APPLICATION') {
        const legsForBalance = await repos.movements.listLegsForBalance(input.nucleusId);
        const balance = calculateResourceBalance(fromResource.id, fromResource.initialBalanceCents, legsForBalance).toCents();
        if (balance < input.amountCents) {
          throw new DomainError('INSUFFICIENT_BALANCE', 'Saldo insuficiente no recurso de origem para concluir a transferência.');
        }
      }

      // Toda a validação de integridade da transferência (mesma natureza, recursos
      // distintos, valor positivo, as duas pontas se cancelando) vive no domínio.
      const plan = planTransfer({
        fromResourceId: input.fromResourceId,
        fromResourceType: fromResource.type,
        toResourceId: input.toResourceId,
        toResourceType: toResource.type,
        amount: Money.fromCents(input.amountCents),
      });

      const movement = buildMovement({
        nucleusId: input.nucleusId,
        type: 'TRANSFER',
        status: 'CONFIRMED',
        date: input.date,
        description: input.description,
        categoryId: null, // nunca classificável como entrada/saída — Regra 4
        createdByPersonId: input.createdByPersonId,
        clientOperationId: input.clientOperationId,
      });

      const legs = buildLegs(movement.id, [plan.originLeg, plan.destinationLeg]);

      await repos.movements.createWithLegs(movement, legs);
      await repos.auditLogs.record(
        buildAuditLog({
          entityType: 'Movement',
          entityId: movement.id,
          action: 'CREATE_TRANSFER',
          actorPersonId: input.createdByPersonId,
          nucleusId: input.nucleusId,
          after: {
            type: 'TRANSFER',
            fromResourceId: input.fromResourceId,
            toResourceId: input.toResourceId,
            amountCents: input.amountCents,
          },
        }),
      );

      return { movementId: movement.id, wasAlreadyCreated: false };
    });
  }
}
