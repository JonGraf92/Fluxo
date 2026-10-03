import { v4 as uuid } from 'uuid';
import { Category, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../../domain/entities/Category';
import { FinancialNucleus } from '../../../domain/entities/FinancialNucleus';
import { LocalIdentity, LOCAL_IDENTITY_SINGLETON_ID } from '../../../domain/entities/LocalIdentity';
import { Membership } from '../../../domain/entities/Membership';
import { Person } from '../../../domain/entities/Person';
import { Resource, validateNewResource } from '../../../domain/entities/Resource';
import { ResourceOwnership } from '../../../domain/entities/ResourceOwnership';
import { DomainError } from '../../../domain/errors/DomainError';
import { Money } from '../../../domain/value-objects/Money';
import { UnitOfWork } from '../../ports/UnitOfWork';

export interface CompleteOnboardingInput {
  personDisplayName: string;
  nucleusName: string;
  firstResourceName: string;
  firstResourceInitialBalanceCents: number;
}

export interface CompleteOnboardingResult {
  person: Person;
  nucleus: FinancialNucleus;
  resource: Resource;
}

/**
 * Fluxo de primeiro uso (seção 29): boas-vindas → perfil → núcleo → primeiro recurso →
 * saldo inicial → dashboard. Tudo gravado em UMA transação: ou o onboarding completo
 * acontece, ou nada é gravado (nunca deixamos a instalação num estado "meio configurado").
 *
 * Não chama os demais casos de uso (CreatePerson/CreateNucleus/CreateResource) porque cada
 * um deles abre sua própria transação — nested transactions não são o desenho deste
 * projeto (ADR D-012 é sobre uma transação por operação). Em vez disso, monta as mesmas
 * entidades diretamente, dentro de uma única `uow.run`.
 */
export class CompleteOnboarding {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
    if (!input.personDisplayName.trim()) {
      throw new DomainError('PERSON_NAME_REQUIRED', 'Informe um nome.');
    }
    if (!input.nucleusName.trim()) {
      throw new DomainError('NUCLEUS_NAME_REQUIRED', 'O núcleo financeiro precisa de um nome.');
    }

    const initialBalance = Money.fromCents(input.firstResourceInitialBalanceCents);
    validateNewResource({
      nucleusId: 'pending', // validado apenas quanto ao nome/tipo aqui; nucleusId real é preenchido abaixo
      name: input.firstResourceName,
      type: 'MONEY_ACCOUNT',
      initialBalance,
    });

    return this.uow.run(async (repos) => {
      // Guarda explícita do singleton (ADR D-026) — além da colisão de PRIMARY KEY que o
      // SQLite daria de qualquer forma, isto garante uma mensagem de erro clara e evita
      // qualquer trabalho parcial antes de detectar a segunda tentativa.
      const existingIdentity = await repos.localIdentity.get();
      if (existingIdentity) {
        throw new DomainError(
          'ALREADY_ONBOARDED',
          'O Fluxo já foi configurado neste dispositivo — não é possível repetir o onboarding.',
        );
      }

      const now = new Date();

      const person: Person = { id: uuid(), displayName: input.personDisplayName.trim(), createdAt: now };
      await repos.persons.create(person);

      const identity: LocalIdentity = { id: LOCAL_IDENTITY_SINGLETON_ID, personId: person.id, installedAt: now };
      await repos.localIdentity.create(identity);

      const nucleus: FinancialNucleus = {
        id: uuid(),
        name: input.nucleusName.trim(),
        type: 'INDIVIDUAL',
        createdAt: now,
        updatedAt: now,
      };
      await repos.nuclei.create(nucleus);

      const ownerMembership: Membership = {
        id: uuid(),
        personId: person.id,
        nucleusId: nucleus.id,
        role: 'OWNER',
        createdAt: now,
      };
      await repos.memberships.create(ownerMembership);

      const categories: Category[] = [
        ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
          id: uuid(),
          nucleusId: nucleus.id,
          name,
          kind: 'INCOME' as const,
          isSystem: true,
          createdAt: now,
        })),
        ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
          id: uuid(),
          nucleusId: nucleus.id,
          name,
          kind: 'EXPENSE' as const,
          isSystem: true,
          createdAt: now,
        })),
      ];
      await repos.categories.createMany(categories);

      const resource: Resource = {
        id: uuid(),
        nucleusId: nucleus.id,
        name: input.firstResourceName.trim(),
        type: 'MONEY_ACCOUNT',
        benefitSubtype: null,
        statementDueDay: null,
        statementClosingDay: null,
        liquidityDays: null,
        initialBalanceCents: initialBalance.toCents(),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      await repos.resources.create(resource);

      const ownership: ResourceOwnership = {
        id: uuid(),
        resourceId: resource.id,
        personId: person.id,
        ownershipType: 'OWNER',
        createdAt: now,
      };
      await repos.resourceOwnership.create(ownership);

      return { person, nucleus, resource };
    });
  }
}
