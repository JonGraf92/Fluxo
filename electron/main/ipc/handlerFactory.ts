import { z } from 'zod';
import { RepositoryContext } from '../../../src/application/ports/RepositoryContext';
import { UnitOfWork } from '../../../src/application/ports/UnitOfWork';
import { DomainError, ForbiddenError } from '../../../src/domain/errors/DomainError';
import { FluxoErrorDto } from '../../../src/shared/ipc-contract';

/**
 * Este arquivo NÃO importa 'electron' de propósito. `ipcMain.handle` é só o adaptador de
 * transporte — toda a lógica de validação, derivação de identidade e autorização de
 * núcleo mora aqui, como funções puras, para poder ser testada diretamente com um banco
 * de teste real, sem precisar de um runtime Electron (ver ADR D-024/D-025 e
 * tests/security/ipc-identity-spoofing.test.ts).
 */

export interface IpcContext {
  repos: RepositoryContext;
  uow: UnitOfWork;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: FluxoErrorDto };

export interface AuthContext {
  /** SEMPRE derivado de local_identity no processo main — nunca do payload do renderer. */
  personId: string;
}

/**
 * A pessoa "atual" do Fluxo é sempre a da identidade local desta instalação — nunca um
 * valor enviado pelo renderer. Isto é o que impede um renderer malicioso ou comprometido
 * de "se passar por outra pessoa" ao registrar uma movimentação (ADR D-024).
 */
export async function requireCurrentPerson(repos: RepositoryContext): Promise<string> {
  const identity = await repos.localIdentity.get();
  if (!identity) {
    throw new ForbiddenError('Nenhuma identidade local configurada. Complete o onboarding primeiro.');
  }
  return identity.personId;
}

/**
 * Autorização de contexto/núcleo (ADR D-025): a pessoa atual precisa ter Membership no
 * núcleo referenciado pelo payload. Sem isso, nada impediria um payload (malicioso, ou
 * apenas um bug) referenciar um nucleusId que não é o da instalação.
 */
export async function assertNucleusAccess(repos: RepositoryContext, personId: string, nucleusId: string): Promise<void> {
  const membership = await repos.memberships.findByPersonAndNucleus(personId, nucleusId);
  if (!membership) {
    throw new ForbiddenError('Você não tem acesso a este núcleo financeiro.');
  }
}

function mapError(channel: string, error: unknown): IpcResult<never> {
  if (error instanceof DomainError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  // eslint-disable-next-line no-console
  console.error(`Erro inesperado no canal ${channel}:`, error);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro inesperado.' } };
}

/**
 * Canal público: não exige identidade local configurada. Só existem dois casos de uso
 * legítimos para isto — `app:getState` (é assim que o renderer descobre se precisa fazer
 * onboarding) e `onboarding:complete` (é o que cria a identidade). Todo o resto passa por
 * `buildAuthenticatedHandler`.
 */
export function buildPublicHandler<Schema extends z.ZodTypeAny, Result>(
  channel: string,
  schema: Schema,
  fn: (payload: z.infer<Schema>) => Promise<Result>,
): (rawPayload: unknown) => Promise<IpcResult<Result>> {
  return async (rawPayload) => {
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: parsed.error.issues.map((i) => i.message).join('; ') },
      };
    }
    try {
      const data = await fn(parsed.data);
      return { ok: true, data };
    } catch (error) {
      return mapError(channel, error);
    }
  };
}

/**
 * Canal autenticado — usado por todo o resto da aplicação. Sempre:
 * 1. valida o payload com Zod (schemas de mutação usam `.strict()`, então qualquer campo
 *    extra e inesperado no payload — como um `createdByPersonId` forjado — é REJEITADO,
 *    não apenas ignorado silenciosamente);
 * 2. deriva `personId` da identidade local, nunca do payload — mesmo que o schema
 *    aceitasse tal campo, `fn` nunca o recebe: só recebe `auth.personId`;
 * 3. exige e confirma o acesso ao núcleo ANTES de chamar `fn`.
 *
 * DIRETRIZ DE PROJETO — FALHAR FECHADO (fail-closed): a autorização NÃO pode depender da
 * presença de um campo no payload. A versão anterior fazia
 * `if (typeof maybeNucleusId === 'string') assertNucleusAccess(...)`: um canal cujo schema
 * esquecesse `nucleusId` simplesmente NÃO era autorizado, e passava em silêncio. Um
 * esquecimento virava uma brecha. Hoje a ausência do campo exige um autorizador explícito,
 * e sem ele a operação é RECUSADA.
 *
 * O mesmo padrão existia no invariante contábil (`LedgerInvariants`), onde recurso
 * desconhecido escapava da checagem de sinal. Mesma classe de falha, em dois lugares.
 */
export function buildAuthenticatedHandler<Schema extends z.ZodTypeAny, Result>(
  ctx: IpcContext,
  channel: string,
  schema: Schema,
  fn: (payload: z.infer<Schema>, auth: AuthContext) => Promise<Result>,
  options?: {
    /** Canais cujo payload legitimamente não tem `nucleusId` declaram como autorizar. */
    authorize?: (payload: z.infer<Schema>, personId: string) => Promise<void>;
  },
): (rawPayload: unknown) => Promise<IpcResult<Result>> {
  return async (rawPayload) => {
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: parsed.error.issues.map((i) => i.message).join('; ') },
      };
    }
    try {
      const personId = await requireCurrentPerson(ctx.repos);

      const maybeNucleusId = (parsed.data as Record<string, unknown> | undefined)?.['nucleusId'];
      if (typeof maybeNucleusId === 'string') {
        await assertNucleusAccess(ctx.repos, personId, maybeNucleusId);
      } else if (options?.authorize) {
        await options.authorize(parsed.data, personId);
      } else {
        // Nem nucleusId no payload, nem autorizador declarado: recusa. Este é o ramo que
        // faltava — antes, ausência do campo significava "sem verificação", não "sem acesso".
        // eslint-disable-next-line no-console
        console.error(`Canal autenticado ${channel} não declara nucleusId nem authorize().`);
        return { ok: false, error: { code: 'FORBIDDEN', message: 'Operação não autorizada.' } };
      }

      const data = await fn(parsed.data, { personId });
      return { ok: true, data };
    } catch (error) {
      return mapError(channel, error);
    }
  };
}
