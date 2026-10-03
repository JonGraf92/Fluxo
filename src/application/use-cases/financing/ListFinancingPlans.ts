import { FinancingPlanWithInstallments } from '../../../domain/entities/Financing';
import { RepositoryContext } from '../../ports/RepositoryContext';

export class ListFinancingPlans {
  constructor(private readonly repos: RepositoryContext) {}
  execute(nucleusId: string): Promise<FinancingPlanWithInstallments[]> {
    return this.repos.financings.listByNucleus(nucleusId);
  }
}
