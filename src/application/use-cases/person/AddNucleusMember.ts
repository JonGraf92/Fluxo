import { v4 as uuid } from 'uuid';
import { DomainError } from '../../../domain/errors/DomainError';
import { Membership } from '../../../domain/entities/Membership';
import { Person } from '../../../domain/entities/Person';
import { UnitOfWork } from '../../ports/UnitOfWork';

export class AddNucleusMember {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: { nucleusId: string; displayName: string }): Promise<Person> {
    const displayName = input.displayName.trim();
    if (!displayName) throw new DomainError('PERSON_NAME_REQUIRED', 'Informe o nome da pessoa.');
    return this.uow.run(async (repos) => {
      const nucleus = await repos.nuclei.findById(input.nucleusId);
      if (!nucleus) throw new DomainError('NUCLEUS_NOT_FOUND', 'Núcleo financeiro não encontrado.');
      const current = await repos.persons.listByNucleus(input.nucleusId);
      if (current.some((person) => person.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase())) {
        throw new DomainError('MEMBER_ALREADY_EXISTS', 'Já existe uma pessoa com esse nome no núcleo.');
      }
      const now = new Date();
      const person: Person = { id: uuid(), displayName, createdAt: now };
      const membership: Membership = {
        id: uuid(),
        personId: person.id,
        nucleusId: input.nucleusId,
        role: 'MEMBER',
        createdAt: now,
      };
      await repos.persons.create(person);
      await repos.memberships.create(membership);
      return person;
    });
  }
}
