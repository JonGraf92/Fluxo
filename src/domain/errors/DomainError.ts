/**
 * Erro de domínio — sempre lançado com um código estável (para IPC/UI mapear mensagens)
 * e uma mensagem humana. Nunca ocultar um erro financeiro (seção 40): se uma operação
 * falha, ela deve lançar, nunca retornar um "sucesso" silencioso.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} não encontrado(a): ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}
