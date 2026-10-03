import { CreateNucleus } from '../src/application/use-cases/nucleus/CreateNucleus';
import { CreatePerson } from '../src/application/use-cases/person/CreatePerson';
import { CreateResource } from '../src/application/use-cases/resource/CreateResource';
import { BenefitSubtype, ResourceType } from '../src/domain/value-objects/enums';
import { TestDb } from './testDb';

export async function seedPersonAndNucleus(db: TestDb) {
  const person = await new CreatePerson(db.uow).execute({ displayName: 'Ana' });
  const { nucleus, categories } = await new CreateNucleus(db.uow).execute({
    name: 'Minhas finanças',
    ownerPersonId: person.id,
  });
  return { person, nucleus, categories };
}

export async function seedResource(
  db: TestDb,
  nucleusId: string,
  ownerPersonId: string,
  overrides: Partial<{ name: string; type: ResourceType; benefitSubtype: BenefitSubtype | null; initialBalanceCents: number }> = {},
) {
  const { resource } = await new CreateResource(db.uow).execute({
    nucleusId,
    name: overrides.name ?? 'Conta principal',
    type: overrides.type ?? 'MONEY_ACCOUNT',
    benefitSubtype: overrides.benefitSubtype ?? null,
    initialBalanceCents: overrides.initialBalanceCents ?? 0,
    ownerPersonId,
  });
  return resource;
}
