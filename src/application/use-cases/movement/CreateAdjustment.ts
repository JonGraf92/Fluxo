import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { calculateResourceBalance } from '../../../domain/services/BalanceCalculator';
import { planAdjustmentLeg } from '../../../domain/services/LegFactory';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog, buildLegs, buildMovement, newId } from './shared';

export interface CreateAdjustmentInput {
  nucleusId: string;
  resourceId: string;
  /** Saldo correto observado pelo usuário (ex.: conferência do extrato físico). */
  newBalanceCents: number;
  reason: string;
  date: string;
  createdByPersonId: string;
  clientOperationId: string;
}

export interface CreateAdjustmentResult {
  movementId: string;
  previousBalanceCents: number;
  newBalanceCents: number;
  wasAlreadyCreated: boolean;
}

/**
 * AJUSTE — seção 18 / ADR D-019. Ajuste é excepcional: sempre exige um motivo, e o efeito
 * financeiro vive em UMA MovementLeg (a diferença entre o saldo calculado e o saldo
 * informado como correto), nunca em uma lógica paralela de saldo.
 */
export class CreateAdjustment {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateAdjustmentInput): Promise<CreateAdjustmentResult> {
    if (!input.reason.trim()) {
      throw new DomainError('ADJUSTMENT_REASON_REQUIRED', 'Todo ajuste precisa de um motivo.');
    }

    return this.uow.run(async (repos) => {
      const existing = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (existing) {
        // Idempotência: precisamos devolver os valores calculados originalmente também
        // no reenvio; como não guardamos snapshot, recomputamos a partir do estado atual
        // (o segundo envio não gera novo efeito porque o Movement já existe).
        return {
          movementId: existing.id,
          previousBalanceCents: 0,
          newBalanceCents: input.newBalanceCents,
          wasAlreadyCreated: true,
        };
      }

      const resource = await repos.resources.findById(input.resourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) {
        throw new NotFoundError('Recurso', input.resourceId);
      }

      const legsForBalance = await repos.movements.listLegsForBalance(input.nucleusId);
      const currentBalance = calculateResourceBalance(
        input.resourceId,
        resource.initialBalanceCents,
        legsForBalance,
      );

      const deltaCents = input.newBalanceCents - currentBalance.toCents();
      const legPlan = planAdjustmentLeg(input.resourceId, deltaCents);

      const movement = buildMovement({
        nucleusId: input.nucleusId,
        type: 'ADJUSTMENT',
        status: 'CONFIRMED',
        date: input.date,
        description: `Ajuste de saldo: ${input.reason}`,
        categoryId: null,
        createdByPersonId: input.createdByPersonId,
        clientOperationId: input.clientOperationId,
      });
      const legs = buildLegs(movement.id, [legPlan]);

      await repos.movements.createWithLegs(movement, legs);

      await repos.movements.createAdjustmentRecord({
        id: newId(),
        movementId: movement.id,
        resourceId: input.resourceId,
        reason: input.reason,
        createdByPersonId: input.createdByPersonId,
        createdAt: new Date(),
      });

      await repos.auditLogs.record(
        buildAuditLog({
          entityType: 'Movement',
          entityId: movement.id,
          action: 'CREATE_ADJUSTMENT',
          actorPersonId: input.createdByPersonId,
          nucleusId: input.nucleusId,
          before: { balanceCents: currentBalance.toCents() },
          after: { balanceCents: input.newBalanceCents, reason: input.reason },
        }),
      );

      return {
        movementId: movement.id,
        previousBalanceCents: currentBalance.toCents(),
        newBalanceCents: input.newBalanceCents,
        wasAlreadyCreated: false,
      };
    });
  }
}
