import { Kysely } from 'kysely';
import { Adjustment } from '../../domain/entities/Adjustment';
import { Movement } from '../../domain/entities/Movement';
import { MovementLeg } from '../../domain/entities/MovementLeg';
import { MovementFilter, MovementRepository } from '../../application/ports/repositories';
import { LegForBalance } from '../../domain/services/BalanceCalculator';
import { MovementStatus } from '../../domain/value-objects/enums';
import { Database } from '../db/types';
import { mapAdjustment, mapMovement, mapMovementLeg, toIso } from './mappers';

export class KyselyMovementRepository implements MovementRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Grava o Movement e todas as suas legs. Chamado sempre de dentro de um
   * UnitOfWork.run(...) — este método por si só não abre transação; a atomicidade vem de
   * `this.db` já ser a transação corrente (ver SqliteUnitOfWork).
   */
  async createWithLegs(movement: Movement, legs: MovementLeg[]): Promise<void> {
    await this.db
      .insertInto('movements')
      .values({
        id: movement.id,
        nucleus_id: movement.nucleusId,
        type: movement.type,
        status: movement.status,
        date: movement.date,
        description: movement.description,
        category_id: movement.categoryId,
        created_by_person_id: movement.createdByPersonId,
        responsible_person_id: movement.responsiblePersonId,
        payment_method: movement.paymentMethod,
        invoice_due_date: movement.invoiceDueDate,
        client_operation_id: movement.clientOperationId,
        created_at: toIso(movement.createdAt),
        updated_at: toIso(movement.updatedAt),
        cancelled_at: movement.cancelledAt ? toIso(movement.cancelledAt) : null,
        cancelled_reason: movement.cancelledReason,
      })
      .execute();

    if (legs.length === 0) {
      throw new Error('Integridade violada: toda Movement precisa de ao menos uma MovementLeg.');
    }

    await this.db
      .insertInto('movement_legs')
      .values(
        legs.map((leg) => ({
          id: leg.id,
          movement_id: leg.movementId,
          resource_id: leg.resourceId,
          amount_cents: leg.amountCents,
          sequence: leg.sequence,
        })),
      )
      .execute();
  }

  async findByClientOperationId(nucleusId: string, clientOperationId: string): Promise<Movement | null> {
    const row = await this.db
      .selectFrom('movements')
      .selectAll()
      .where('nucleus_id', '=', nucleusId)
      .where('client_operation_id', '=', clientOperationId)
      .executeTakeFirst();
    return row ? mapMovement(row) : null;
  }

  async findById(id: string): Promise<Movement | null> {
    const row = await this.db.selectFrom('movements').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? mapMovement(row) : null;
  }

  async list(filter: MovementFilter): Promise<Movement[]> {
    let query = this.db.selectFrom('movements').selectAll().where('nucleus_id', '=', filter.nucleusId);
    if (filter.type) query = query.where('type', '=', filter.type);
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.personId) query = query.where('responsible_person_id', '=', filter.personId);
    if (filter.categoryId) query = query.where('category_id', '=', filter.categoryId);
    if (filter.dateFrom) query = query.where('date', '>=', filter.dateFrom);
    if (filter.dateTo) query = query.where('date', '<=', filter.dateTo);

    if (filter.resourceId) {
      const movementIds = this.db
        .selectFrom('movement_legs')
        .select('movement_id')
        .where('resource_id', '=', filter.resourceId);
      query = query.where('id', 'in', movementIds);
    }

    const rows = await query.orderBy('date', 'desc').orderBy('created_at', 'desc').execute();
    return rows.map(mapMovement);
  }

  async listLegsByMovementIds(movementIds: string[]): Promise<MovementLeg[]> {
    if (movementIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('movement_legs')
      .selectAll()
      .where('movement_id', 'in', movementIds)
      .execute();
    return rows.map(mapMovementLeg);
  }

  async listLegsByNucleus(nucleusId: string): Promise<MovementLeg[]> {
    const rows = await this.db
      .selectFrom('movement_legs')
      .innerJoin('movements', 'movements.id', 'movement_legs.movement_id')
      .select([
        'movement_legs.id as id',
        'movement_legs.movement_id as movement_id',
        'movement_legs.resource_id as resource_id',
        'movement_legs.amount_cents as amount_cents',
        'movement_legs.sequence as sequence',
      ])
      .where('movements.nucleus_id', '=', nucleusId)
      .execute();
    return rows.map(mapMovementLeg);
  }

  async listLegsForBalance(nucleusId: string): Promise<LegForBalance[]> {
    const rows = await this.db
      .selectFrom('movement_legs')
      .innerJoin('movements', 'movements.id', 'movement_legs.movement_id')
      .select([
        'movement_legs.resource_id as resource_id',
        'movement_legs.amount_cents as amount_cents',
        'movements.status as status',
      ])
      .where('movements.nucleus_id', '=', nucleusId)
      .execute();
    return rows.map((row) => ({
      resourceId: row.resource_id,
      amountCents: row.amount_cents,
      movementStatus: row.status as MovementStatus,
    }));
  }

  async updateStatus(
    movementId: string,
    status: MovementStatus,
    cancelledAt: Date | null,
    cancelledReason: string | null,
  ): Promise<void> {
    await this.db
      .updateTable('movements')
      .set({
        status,
        cancelled_at: cancelledAt ? toIso(cancelledAt) : null,
        cancelled_reason: cancelledReason,
        updated_at: toIso(new Date()),
      })
      .where('id', '=', movementId)
      .execute();
  }

  async createAdjustmentRecord(adjustment: Adjustment): Promise<void> {
    await this.db
      .insertInto('adjustments')
      .values({
        id: adjustment.id,
        movement_id: adjustment.movementId,
        resource_id: adjustment.resourceId,
        reason: adjustment.reason,
        created_by_person_id: adjustment.createdByPersonId,
        created_at: toIso(adjustment.createdAt),
      })
      .execute();
  }

  async listAdjustmentsByNucleus(nucleusId: string): Promise<Adjustment[]> {
    const rows = await this.db
      .selectFrom('adjustments')
      .innerJoin('movements', 'movements.id', 'adjustments.movement_id')
      .select([
        'adjustments.id as id',
        'adjustments.movement_id as movement_id',
        'adjustments.resource_id as resource_id',
        'adjustments.reason as reason',
        'adjustments.created_by_person_id as created_by_person_id',
        'adjustments.created_at as created_at',
      ])
      .where('movements.nucleus_id', '=', nucleusId)
      .orderBy('adjustments.created_at', 'desc')
      .execute();
    return rows.map(mapAdjustment);
  }
}
