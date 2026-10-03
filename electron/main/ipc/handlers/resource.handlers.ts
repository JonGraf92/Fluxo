import { CreateResource } from '../../../../src/application/use-cases/resource/CreateResource';
import { UpdateResource } from '../../../../src/application/use-cases/resource/UpdateResource';
import { SetResourceArchived } from '../../../../src/application/use-cases/resource/SetResourceArchived';
import { CHANNELS, CreateResourceSchema, ListResourcesSchema, ResourceDto, SetResourceArchivedSchema, UpdateResourceSchema } from '../../../../src/shared/ipc-contract';
import { toResourceDto } from '../dto';
import { IpcContext, handleAuthenticated } from '../register';

export function registerResourceHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof CreateResourceSchema, ResourceDto>(
    ctx,
    CHANNELS.resourceCreate,
    CreateResourceSchema,
    async (payload, auth) => {
      // ownerPersonId nunca vem do payload (ADR D-024) — é sempre a pessoa da identidade
      // local desta instalação, que também já foi confirmada como membro deste núcleo
      // pelo próprio handleAuthenticated antes de chegarmos aqui.
      const result = await new CreateResource(ctx.uow).execute({
        nucleusId: payload.nucleusId,
        name: payload.name,
        type: payload.type,
        benefitSubtype: payload.benefitSubtype ?? null,
        statementDueDay: payload.statementDueDay ?? null,
        statementClosingDay: payload.statementClosingDay ?? null,
        liquidityDays: payload.liquidityDays ?? null,
        initialBalanceCents: payload.initialBalanceCents,
        ownerPersonId: auth.personId,
      });
      return toResourceDto(result.resource);
    },
  );

  handleAuthenticated<typeof UpdateResourceSchema, { updated: boolean }>(ctx, CHANNELS.resourceUpdate, UpdateResourceSchema, async (payload, auth) => {
    await new UpdateResource(ctx.uow).execute({ ...payload, actorPersonId: auth.personId });
    return { updated: true };
  });

  handleAuthenticated<typeof SetResourceArchivedSchema, { archived: boolean }>(ctx, CHANNELS.resourceSetArchived, SetResourceArchivedSchema, async (payload, auth) => {
    await new SetResourceArchived(ctx.uow).execute({ ...payload, actorPersonId: auth.personId });
    return { archived: payload.archived };
  });

  handleAuthenticated<typeof ListResourcesSchema, ResourceDto[]>(
    ctx,
    CHANNELS.resourceList,
    ListResourcesSchema,
    async (payload) => {
      const resources = await ctx.repos.resources.listByNucleus(payload.nucleusId, { includeArchived: payload.includeArchived });
      return resources.map(toResourceDto);
    },
  );
}
