import { v4 as uuid } from 'uuid';
import { DomainError } from '../../../domain/errors/DomainError';
import { Person } from '../../../domain/entities/Person';
import { UnitOfWork } from '../../ports/UnitOfWork';

export interface CreatePersonInput {
  displayName: string;
}

export class CreatePerson {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreatePersonInput): Promise<Person> {
    if (!input.displayName.trim()) {
      throw new DomainError('PERSON_NAME_REQUIRED', 'Informe um nome.');
    }
    return this.uow.run(async (repos) => {
      const person: Person = { id: uuid(), displayName: input.displayName.trim(), createdAt: new Date() };
      await repos.persons.create(person);
      return person;
    });
  }
}
