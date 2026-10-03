import { v4 as uuid } from 'uuid';
import { Resource, validateNewResource } from '../../../domain/entities/Resource';
import { ResourceOwnership } from '../../../domain/entities/ResourceOwnership';
import { DomainError } from '../../../domain/errors/DomainError';
import { Money } from '../../../domain/value-objects/Money';
import { BenefitSubtype, ResourceType } from '../../../domain/value-objects/enums';
import { UnitOfWork } from '../../ports/UnitOfWork';

export interface CreateResourceInput {
  nucleusId: string;
  name: string;
  type: ResourceType;
  benefitSubtype?: BenefitSubtype | null;
  statementDueDay?: number | null;
  statementClosingDay?: number | null;
  liquidityDays?: number | null;
  initialBalanceCents: number;
  ownerPersonId: string;
}

export interface CreateResourceResult {
  resource: Resource;
  ownership: ResourceOwnership;
}

/**
 * Cria um recurso com sua posição inicial (imutável a partir daqui — ADR D-020) e a
 * relação de propriedade. Valida ADR D-017: o proprietário precisa ter Membership válida
 * no mesmo núcleo do recurso — nunca dono de um recurso de um núcleo ao qual não pertence.
 */
export class CreateResource {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateResourceInput): Promise<CreateResourceResult> {
    const initialBalance = Money.fromCents(input.initialBalanceCents);

    validateNewResource({
      nucleusId: input.nucleusId,
      name: input.name,
      type: input.type,
      benefitSubtype: input.benefitSubtype ?? null,
      statementDueDay: input.statementDueDay ?? null,
      statementClosingDay: input.statementClosingDay ?? null,
      liquidityDays: input.liquidityDays ?? null,
      initialBalance,
    });

    return this.uow.run(async (repos) => {
      const membership = await repos.memberships.findByPersonAndNucleus(input.ownerPersonId, input.nucleusId);
      if (!membership) {
        throw new DomainError(
          'OWNERSHIP_REQUIRES_MEMBERSHIP',
          'A pessoa proprietária precisa pertencer ao núcleo financeiro deste recurso.',
        );
      }

      const now = new Date();
      const resource: Resource = {
        id: uuid(),
        nucleusId: input.nucleusId,
        name: input.name.trim(),
        type: input.type,
        benefitSubtype: input.benefitSubtype ?? null,
        statementDueDay: input.statementDueDay ?? null,
        statementClosingDay: input.statementClosingDay ?? null,
        liquidityDays: input.liquidityDays ?? null,
        initialBalanceCents: initialBalance.toCents(),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      await repos.resources.create(resource);

      const ownership: ResourceOwnership = {
        id: uuid(),
        resourceId: resource.id,
        personId: input.ownerPersonId,
        ownershipType: 'OWNER',
        createdAt: now,
      };
      await repos.resourceOwnership.create(ownership);

      return { resource, ownership };
    });
  }
}
