/** Wrapper fino sobre window.fluxo — único ponto de acesso do renderer ao backend. */
export const api = () => window.fluxo;

export function newOperationId(): string {
  return crypto.randomUUID();
}
