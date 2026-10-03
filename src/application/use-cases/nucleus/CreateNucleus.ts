import { v4 as uuid } from 'uuid';
import { Category } from '../../../domain/entities/Category';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../../domain/entities/Category';
import { FinancialNucleus } from '../../../domain/entities/FinancialNucleus';
import { Membership } from '../../../domain/entities/Membership';
import { DomainError } from '../../../domain/errors/DomainError';
import { NucleusType } from '../../../domain/value-objects/enums';
import { UnitOfWork } from '../../ports/UnitOfWork';

export interface CreateNucleusInput {
  name: string;
  type?: NucleusType;
  ownerPersonId: string;
}

export interface CreateNucleusResult {
  nucleus: FinancialNucleus;
  ownerMembership: Membership;
  categories: Category[];
}

/**
 * Cria o núcleo, a Membership(OWNER) do criador (ADR D-016: única fonte de verdade sobre
 * quem é dono) e as categorias padrão (seção 21) — tudo em uma única transação.
 */
export class CreateNucleus {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateNucleusInput): Promise<CreateNucleusResult> {
    if (!input.name.trim()) {
      throw new DomainError('NUCLEUS_NAME_REQUIRED', 'O núcleo financeiro precisa de um nome.');
    }

    return this.uow.run(async (repos) => {
      const person = await repos.persons.findById(input.ownerPersonId);
      if (!person) {
        throw new DomainError('PERSON_NOT_FOUND', 'Pessoa proprietária não encontrada.');
      }

      const now = new Date();
      const nucleus: FinancialNucleus = {
        id: uuid(),
        name: input.name.trim(),
        type: input.type ?? 'INDIVIDUAL',
        createdAt: now,
        updatedAt: now,
      };
      await repos.nuclei.create(nucleus);

      const ownerMembership: Membership = {
        id: uuid(),
        personId: input.ownerPersonId,
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

      return { nucleus, ownerMembership, categories };
    });
  }
}
