import { AddNucleusMember } from '../../../../src/application/use-cases/person/AddNucleusMember';
import { CreateMemberSchema, CHANNELS, MemberDto, ListByNucleusSchema } from '../../../../src/shared/ipc-contract';
import { IpcContext, handleAuthenticated } from '../register';

export function registerMemberHandlers(ctx: IpcContext): void {
  handleAuthenticated<typeof CreateMemberSchema, MemberDto>(
    ctx,
    CHANNELS.memberCreate,
    CreateMemberSchema,
    async (payload) => {
      const person = await new AddNucleusMember(ctx.uow).execute(payload);
      return { id: person.id, displayName: person.displayName };
    },
  );
  handleAuthenticated<typeof ListByNucleusSchema, MemberDto[]>(
    ctx,
    CHANNELS.memberList,
    ListByNucleusSchema,
    async (payload) => {
      const people = await ctx.repos.persons.listByNucleus(payload.nucleusId);
      return people.map((person) => ({ id: person.id, displayName: person.displayName }));
    },
  );
}
