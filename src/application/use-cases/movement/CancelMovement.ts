import { ForbiddenError, NotFoundError } from '../../../domain/errors/DomainError';
import { assertValidTransition, isCancellable } from '../../../domain/services/MovementLifecycle';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from './shared';

export interface CancelMovementInput {
  movementId: string;
  reason: string;
  actorPersonId: string;
}

/**
 * Cancelamento — seção 19/seção 40. NUNCA apaga a linha original; apenas muda o status
 * para CANCELLED. A partir daí, BalanceCalculator para de considerar suas legs
 * automaticamente (filtra por status=CONFIRMED) — o histórico permanece visível e auditável.
 *
 * Autorização de núcleo (ADR D-025): este é o único caso de uso de escrita cujo payload de
 * IPC não carrega um `nucleusId` diretamente (só `movementId`), então a checagem genérica
 * de `handleAuthenticated` não se aplica — a verificação é feita aqui, a partir do núcleo
 * real da movimentação sendo cancelada.
 */
export class CancelMovement {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CancelMovementInput): Promise<void> {
    if (!input.reason.trim()) {
      throw new Error('Todo cancelamento precisa de um motivo.');
    }

    await this.uow.run(async (repos) => {
      const movement = await repos.movements.findById(input.movementId);
      if (!movement) {
        throw new NotFoundError('Movimentação', input.movementId);
      }

      const membership = await repos.memberships.findByPersonAndNucleus(input.actorPersonId, movement.nucleusId);
      if (!membership) {
        throw new ForbiddenError('Você não tem acesso ao núcleo financeiro desta movimentação.');
      }

      if (!isCancellable(movement.status)) {
        assertValidTransition(movement.status, 'CANCELLED'); // lança DomainError explicativo
      }

      await repos.movements.updateStatus(movement.id, 'CANCELLED', new Date(), input.reason);

      await repos.auditLogs.record(
        buildAuditLog({
          entityType: 'Movement',
          entityId: movement.id,
          action: 'CANCEL',
          actorPersonId: input.actorPersonId,
          nucleusId: movement.nucleusId,
          before: { status: movement.status },
          after: { status: 'CANCELLED', reason: input.reason },
        }),
      );
    });
  }
}
