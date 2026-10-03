/**
 * Estrutura mínima de contexto da instalação — ver ADR D-013.
 * Sem autenticação real: uma única linha por instalação, ligando o processo local a uma
 * Person. Não confundir com um sistema de login.
 *
 * ID fixo e conhecido (não um UUID aleatório) de propósito — ver ADR D-026: isso faz com
 * que uma segunda tentativa de criar a identidade local colida com a PRIMARY KEY da
 * tabela `local_identity` e seja rejeitada pelo próprio SQLite, além da verificação
 * explícita feita em `CompleteOnboarding`. Duas camadas de garantia para o mesmo invariante.
 */
export const LOCAL_IDENTITY_SINGLETON_ID = 'local-identity-singleton';

export interface LocalIdentity {
  readonly id: string;
  readonly personId: string;
  readonly installedAt: Date;
}
