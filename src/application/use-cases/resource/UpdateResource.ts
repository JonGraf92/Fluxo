import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

export class UpdateResource {
  constructor(private readonly uow: UnitOfWork) {}
  async execute(input: { nucleusId: string; resourceId: string; name: string; initialBalanceCents?: number; liquidityDays?: number | null; statementClosingDay?: number | null; actorPersonId: string }): Promise<void> {
    const name = input.name.trim();
    if (!name) throw new DomainError('RESOURCE_NAME_REQUIRED', 'Informe o nome do recurso.');
    if (input.initialBalanceCents !== undefined && !Number.isSafeInteger(input.initialBalanceCents)) throw new DomainError('RESOURCE_INITIAL_BALANCE_INVALID', 'Informe um saldo inicial válido em centavos.');
    if (input.liquidityDays != null && (!Number.isInteger(input.liquidityDays) || input.liquidityDays < 0 || input.liquidityDays > 36500)) {
      throw new DomainError('RESOURCE_LIQUIDITY_DAYS_INVALID', 'O prazo de liquidez precisa ser um número inteiro de 0 a 36.500 dias.');
    }
    if (input.statementClosingDay != null && (!Number.isInteger(input.statementClosingDay) || input.statementClosingDay < 1 || input.statementClosingDay > 31)) {
      throw new DomainError('RESOURCE_CARD_CLOSING_DAY_INVALID', 'O fechamento da fatura precisa ser um dia de 1 a 31.');
    }
    await this.uow.run(async (repos) => {
      const resource = await repos.resources.findById(input.resourceId);
      if (!resource || resource.nucleusId !== input.nucleusId) throw new NotFoundError('Recurso', input.resourceId);
      if (resource.archived) throw new DomainError('RESOURCE_ARCHIVED', 'Reative o recurso antes de editar o nome.');
      const liquidityDays = resource.type === 'APPLICATION' ? input.liquidityDays ?? resource.liquidityDays : null;
      if (resource.type === 'APPLICATION' && liquidityDays == null) {
        throw new DomainError('RESOURCE_LIQUIDITY_DAYS_REQUIRED', 'Informe o prazo de liquidez da aplicação em dias.');
      }
      if (resource.type !== 'APPLICATION' && input.liquidityDays != null) {
        throw new DomainError('RESOURCE_LIQUIDITY_DAYS_NOT_ALLOWED', 'Somente aplicações podem ter prazo de liquidez.');
      }
      const statementClosingDay = resource.type === 'CREDIT_CARD' ? input.statementClosingDay ?? resource.statementClosingDay : null;
      if (resource.type === 'CREDIT_CARD' && statementClosingDay == null) throw new DomainError('RESOURCE_CARD_CLOSING_DAY_REQUIRED', 'Informe o dia de fechamento da fatura.');
      if (resource.type !== 'CREDIT_CARD' && input.statementClosingDay != null) throw new DomainError('RESOURCE_CARD_CLOSING_DAY_NOT_ALLOWED', 'Somente cartões de crédito podem ter data de fechamento.');
      const initialBalanceCents = input.initialBalanceCents ?? resource.initialBalanceCents;
      await repos.resources.updateProperties(resource.id, name, initialBalanceCents, liquidityDays, statementClosingDay, new Date());
      await repos.auditLogs.record(buildAuditLog({ entityType: 'Resource', entityId: resource.id, action: 'UPDATE_RESOURCE', actorPersonId: input.actorPersonId, nucleusId: input.nucleusId, before: { name: resource.name, initialBalanceCents: resource.initialBalanceCents, liquidityDays: resource.liquidityDays, statementClosingDay: resource.statementClosingDay }, after: { name, initialBalanceCents, liquidityDays, statementClosingDay } }));
    });
  }
}
