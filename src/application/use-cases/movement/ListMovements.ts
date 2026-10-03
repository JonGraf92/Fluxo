import { Movement } from '../../../domain/entities/Movement';
import { MovementLeg } from '../../../domain/entities/MovementLeg';
import { MovementFilter } from '../../ports/repositories';
import { RepositoryContext } from '../../ports/RepositoryContext';

export interface MovementWithLegs {
  movement: Movement;
  legs: MovementLeg[];
}

/** Leitura simples — não precisa de transação, só de uma foto consistente do banco. */
export class ListMovements {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(filter: MovementFilter): Promise<MovementWithLegs[]> {
    const movements = await this.repos.movements.list(filter);
    const legs = await this.repos.movements.listLegsByMovementIds(movements.map((m) => m.id));
    const legsByMovement = new Map<string, MovementLeg[]>();
    for (const leg of legs) {
      const list = legsByMovement.get(leg.movementId) ?? [];
      list.push(leg);
      legsByMovement.set(leg.movementId, list);
    }
    return movements.map((movement) => ({
      movement,
      legs: legsByMovement.get(movement.id) ?? [],
    }));
  }
}
