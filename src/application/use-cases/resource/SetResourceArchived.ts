import { NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

export class SetResourceArchived {
  constructor(private readonly uow: UnitOfWork) {}
  async execute(input: { nucleusId: string; resourceId: string; archived: boolean; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const resource = await repos.resources.findById(input.resourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) throw new NotFoundError('Recurso', input.resourceId);
      if (resource.archived === input.archived) return;
      await repos.resources.updateNameAndArchived(resource.id, resource.name, input.archived, new Date());
      await repos.auditLogs.record(buildAuditLog({ entityType: 'Resource', entityId: resource.id, action: input.archived ? 'ARCHIVE_RESOURCE' : 'RESTORE_RESOURCE', actorPersonId: input.actorPersonId, nucleusId: input.nucleusId, before: { archived: resource.archived }, after: { archived: input.archived } }));
    });
  }
}
