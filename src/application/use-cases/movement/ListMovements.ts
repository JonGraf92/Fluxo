import { Movement } from '../../../domain/entities/Movement';
import { MovementLeg } from '../../../domain/entities/MovementLeg';
import { MovementFilter } from '../../ports/repositories';
import { RepositoryContext } from '../../ports/RepositoryContext';

export interface MovementWithLegs {
  movement: Movement;
  legs: MovementLeg[];
}

/** Junta cada movimento às suas partidas. Usado pela listagem e pelo painel. */
export async function attachLegs(repos: RepositoryContext, movements: Movement[]): Promise<MovementWithLegs[]> {
  const legs = await repos.movements.listLegsByMovementIds(movements.map((m) => m.id));
  const legsByMovement = new Map<string, MovementLeg[]>();
  for (const leg of legs) {
    const list = legsByMovement.get(leg.movementId) ?? [];
    list.push(leg);
    legsByMovement.set(leg.movementId, list);
  }
  return movements.map((movement) => ({ movement, legs: legsByMovement.get(movement.id) ?? [] }));
}

/** Leitura simples — não precisa de transação, só de uma foto consistente do banco. */
export class ListMovements {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(filter: MovementFilter): Promise<MovementWithLegs[]> {
    return attachLegs(this.repos, await this.repos.movements.list(filter));
  }
}
