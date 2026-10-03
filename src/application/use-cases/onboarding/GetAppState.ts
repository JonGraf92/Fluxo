import { RepositoryContext } from '../../ports/RepositoryContext';

export interface AppState {
  isOnboarded: boolean;
  personId: string | null;
  nucleusId: string | null;
}

/**
 * Usado no boot da aplicação para decidir entre mostrar o onboarding (seção 29) ou ir
 * direto ao dashboard. `isOnboarded` é verdadeiro quando existe uma LocalIdentity e ao
 * menos um núcleo com essa pessoa como OWNER.
 */
export class GetAppState {
  constructor(private readonly repos: RepositoryContext) {}

  async execute(): Promise<AppState> {
    const identity = await this.repos.localIdentity.get();
    if (!identity) {
      return { isOnboarded: false, personId: null, nucleusId: null };
    }
    const nuclei = await this.repos.nuclei.listAll();
    const owned = nuclei.length > 0 ? nuclei[0] : null;
    return {
      isOnboarded: owned !== null,
      personId: identity.personId,
      nucleusId: owned?.id ?? null,
    };
  }
}
