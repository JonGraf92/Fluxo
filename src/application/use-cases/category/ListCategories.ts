import { Category } from '../../../domain/entities/Category';
import { RepositoryContext } from '../../ports/RepositoryContext';

export class ListCategories {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(nucleusId: string): Promise<Category[]> {
    return this.repos.categories.listByNucleus(nucleusId);
  }
}
