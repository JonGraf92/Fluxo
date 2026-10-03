import { v4 as uuid } from 'uuid';
import { Category } from '../../../domain/entities/Category';
import { DomainError } from '../../../domain/errors/DomainError';
import { CategoryKind } from '../../../domain/value-objects/enums';
import { UnitOfWork } from '../../ports/UnitOfWork';

export interface CreateCategoryInput {
  nucleusId: string;
  name: string;
  kind: CategoryKind;
}

/** Categorias são simples e editáveis (seção 21) — sem limite artificial de quantidade. */
export class CreateCategory {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    if (!input.name.trim()) {
      throw new DomainError('CATEGORY_NAME_REQUIRED', 'A categoria precisa de um nome.');
    }
    return this.uow.run(async (repos) => {
      const category: Category = {
        id: uuid(),
        nucleusId: input.nucleusId,
        name: input.name.trim(),
        kind: input.kind,
        isSystem: false,
        createdAt: new Date(),
      };
      await repos.categories.create(category);
      return category;
    });
  }
}
