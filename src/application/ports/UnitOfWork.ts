import { RepositoryContext } from './RepositoryContext';

/**
 * Garante atomicidade (ADR D-012): tudo dentro de `fn` roda em uma única transação
 * SQLite. Se `fn` lançar qualquer erro (de domínio ou não), a transação inteira sofre
 * rollback — nunca fica um estado parcial (ex.: metade de uma transferência).
 */
export interface UnitOfWork {
  run<T>(fn: (repos: RepositoryContext) => Promise<T>): Promise<T>;
}
