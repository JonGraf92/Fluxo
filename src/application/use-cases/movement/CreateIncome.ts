import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { planIncomeLeg } from '../../../domain/services/LegFactory';
import { Money } from '../../../domain/value-objects/Money';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog, buildLegs, buildMovement } from './shared';

export interface CreateIncomeInput {
  nucleusId: string;
  resourceId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  date: string; // YYYY-MM-DD
  createdByPersonId: string;
  responsiblePersonId?: string;
  clientOperationId: string;
}

export interface CreateIncomeResult {
  movementId: string;
  wasAlreadyCreated: boolean;
}

/** ENTRADA — seção 22. Sempre gera exatamente 1 MovementLeg positiva (ADR D-018). */
export class CreateIncome {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateIncomeInput): Promise<CreateIncomeResult> {
    const description = input.description.trim();
    if (!description) throw new DomainError('MOVEMENT_DESCRIPTION_REQUIRED', 'Informe uma descrição para o lançamento.');
    return this.uow.run(async (repos) => {
      // Idempotência (ADR D-011): reenvio do mesmo client_operation_id não duplica.
      const existing = await repos.movements.findByClientOperationId(input.nucleusId, input.clientOperationId);
      if (existing) {
        return { movementId: existing.id, wasAlreadyCreated: true };
      }

      const resource = await repos.resources.findById(input.resourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) {
        throw new NotFoundError('Recurso', input.resourceId);
      }
      if (resource.archived) {
        throw new DomainError('RESOURCE_ARCHIVED', 'Não é possível lançar em um recurso arquivado.');
      }

      if (input.categoryId) {
        const category = await repos.categories.findById(input.categoryId);
        if (!category || category.nucleusId !== input.nucleusId) {
          throw new NotFoundError('Categoria', input.categoryId);
        }
        if (category.kind !== 'INCOME') {
          throw new DomainError('CATEGORY_KIND_MISMATCH', 'Esta categoria não é de entrada.');
        }
      }

      const responsiblePersonId = input.responsiblePersonId ?? input.createdByPersonId;
      if (!(await repos.memberships.findByPersonAndNucleus(responsiblePersonId, input.nucleusId))) {
        throw new DomainError('MEMBER_NOT_IN_NUCLEUS', 'A pessoa responsável não pertence a este núcleo.');
      }

      if (resource.type === 'CREDIT_CARD') throw new DomainError('INCOME_CREDIT_CARD_NOT_ALLOWED', 'Não é possível registrar entrada em um cartão de crédito.');
      const amount = Money.fromCents(input.amountCents);
      const legPlan = planIncomeLeg(input.resourceId, amount);

      const movement = buildMovement({
        nucleusId: input.nucleusId,
        type: 'INCOME',
        status: 'CONFIRMED',
        date: input.date,
        description,
        categoryId: input.categoryId,
        createdByPersonId: input.createdByPersonId,
        responsiblePersonId,
        clientOperationId: input.clientOperationId,
      });
      const legs = buildLegs(movement.id, [legPlan]);

      await repos.movements.createWithLegs(movement, legs);
      await repos.auditLogs.record(
        buildAuditLog({
          entityType: 'Movement',
          entityId: movement.id,
          action: 'CREATE_INCOME',
          actorPersonId: input.createdByPersonId,
          nucleusId: input.nucleusId,
          after: { type: 'INCOME', resourceId: input.resourceId, amountCents: input.amountCents },
        }),
      );

      return { movementId: movement.id, wasAlreadyCreated: false };
    });
  }
}
