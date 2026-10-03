import { Category } from '../../../src/domain/entities/Category';
import { Resource } from '../../../src/domain/entities/Resource';
import {
  CategoryDto,
  MovementDto,
  ResourceDto,
} from '../../../src/shared/ipc-contract';
import { MovementWithLegs } from '../../../src/application/use-cases/movement/ListMovements';

export function toResourceDto(resource: Resource): ResourceDto {
  return {
    id: resource.id,
    nucleusId: resource.nucleusId,
    name: resource.name,
    type: resource.type,
    benefitSubtype: resource.benefitSubtype,
    statementDueDay: resource.statementDueDay,
    statementClosingDay: resource.statementClosingDay,
    liquidityDays: resource.liquidityDays,
    initialBalanceCents: resource.initialBalanceCents,
    archived: resource.archived,
  };
}

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    nucleusId: category.nucleusId,
    name: category.name,
    kind: category.kind,
    isSystem: category.isSystem,
  };
}

export function toMovementDto(entry: MovementWithLegs): MovementDto {
  const { movement, legs } = entry;
  return {
    id: movement.id,
    nucleusId: movement.nucleusId,
    type: movement.type,
    status: movement.status,
    date: movement.date,
    description: movement.description,
    categoryId: movement.categoryId,
    responsiblePersonId: movement.responsiblePersonId,
    paymentMethod: movement.paymentMethod,
    invoiceDueDate: movement.invoiceDueDate,
    cancelledAt: movement.cancelledAt ? movement.cancelledAt.toISOString() : null,
    cancelledReason: movement.cancelledReason,
    legs: legs.map((leg) => ({ id: leg.id, resourceId: leg.resourceId, amountCents: leg.amountCents })),
  };
}
