import { DomainError, NotFoundError } from '../../../domain/errors/DomainError';
import { UnitOfWork } from '../../ports/UnitOfWork';
import { buildAuditLog } from '../movement/shared';

/**
 * Remove um financiamento EXCLUINDO apenas as previsoes — o plano nao e apagado do banco.
 *
 * A versao anterior fazia DELETE fisico em `financing_installments` e `financing_plans`,
 * o que viola a regra do projeto de que historico confirmado nunca e apagado (o mesmo
 * principio que sustenta o cancelamento auditavel de movimentos, ADR D-010). Pior: o
 * DELETE nao checava status, entao um plano COMPLETED — com parcelas efetivamente pagas e
 * dinheiro ja debitado da conta — podia ser apagado, deixando as despesas orfas no extrato,
 * sem previsao que as explicasse.
 *
 * Agora o plano e marcado como DELETED (soft delete) e permanece consultavel para auditoria.
 * Planos ja concluidos sao recusados, espelhando o que CancelFinancingPlan ja fazia.
 */
export class DeleteFinancingPlan {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: { nucleusId: string; planId: string; actorPersonId: string }): Promise<void> {
    await this.uow.run(async (repos) => {
      const plan = await repos.financings.findPlanById(input.planId);
      if (!plan || plan.nucleusId !== input.nucleusId) throw new NotFoundError('Financiamento', input.planId);
      if (plan.status === 'COMPLETED') {
        throw new DomainError('FINANCING_ALREADY_COMPLETED', 'Este financiamento já foi concluído e não pode ser excluído.');
      }
      if (plan.status === 'DELETED') return;

      const installments = await repos.financings.listInstallments(plan.id);
      const paidCount = installments.filter((item) => item.status === 'PAID').length;
      // Parcelas ja pagas representam dinheiro efetivamente debitado da conta. Excluir o
      // plano deixaria essas despesas sem origem identificavel no historico.
      if (paidCount > 0) {
        throw new DomainError(
          'FINANCING_HAS_PAID_INSTALLMENTS',
          `Este financiamento tem ${paidCount} parcela(s) já paga(s). Cancele as previsões em vez de excluir, para preservar o histórico das saídas já registradas.`,
        );
      }

      await repos.financings.setPlanStatus(plan.id, 'DELETED');
      await repos.auditLogs.record(buildAuditLog({
        entityType: 'FinancingPlan', entityId: plan.id, action: 'DELETE_FINANCING_PLAN',
        actorPersonId: input.actorPersonId, nucleusId: input.nucleusId,
        before: { assetType: plan.assetType, description: plan.description, status: plan.status, installmentCount: installments.length, paidCount },
        after: { status: 'DELETED' },
      }));
    });
  }
}
