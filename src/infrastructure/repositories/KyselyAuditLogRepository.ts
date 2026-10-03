import { Kysely } from 'kysely';
import { AuditLog } from '../../domain/entities/AuditLog';
import { AuditLogRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';
import { mapAuditLog, toIso } from './mappers';

export class KyselyAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async record(entry: AuditLog): Promise<void> {
    await this.db
      .insertInto('audit_logs')
      .values({
        id: entry.id,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor_person_id: entry.actorPersonId,
        nucleus_id: entry.nucleusId,
        occurred_at: toIso(entry.occurredAt),
        before_json: entry.beforeJson,
        after_json: entry.afterJson,
      })
      .execute();
  }

  async listByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const rows = await this.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('occurred_at', 'desc')
      .execute();
    return rows.map(mapAuditLog);
  }
}
