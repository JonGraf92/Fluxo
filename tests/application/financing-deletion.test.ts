import { afterEach, describe, expect, it } from 'vitest';
import { CancelFinancingPlan } from '../../src/application/use-cases/financing/CancelFinancingPlan';
import { CreateFinancingPlan } from '../../src/application/use-cases/financing/CreateFinancingPlan';
import { DeleteFinancingPlan } from '../../src/application/use-cases/financing/DeleteFinancingPlan';
import { PayFinancingInstallment } from '../../src/application/use-cases/financing/PayFinancingInstallment';
import { createTestDb, TestDb } from '../testDb';
import { seedPersonAndNucleus, seedResource } from '../seed';

function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function futureFirstDueDate(): string {
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() + 2);
  return localIso(date);
}

/**
 * Excluir um financiamento nao pode apagar historico ja confirmado. A versao anterior fazia
 * DELETE fisico em financing_plans e financing_installments sem checar status, entao um plano
 * com parcelas pagas — dinheiro ja debitado da conta — desaparecia, deixando as despesas
 * orfas no extrato, sem previsao que as explicasse.
 */
describe('Exclusao de financiamento preserva o historico', () => {
  let db: TestDb;
  afterEach(() => db?.close());

  it('nao apaga o plano do banco: marca como DELETED e mantem as parcelas', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });
    const firstDueDate = futureFirstDueDate();
    const { planId } = await new CreateFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, assetType: 'CAR', description: 'Carro a excluir', termMonths: 12, installmentAmountCents: 1000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id });

    await new DeleteFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, planId, actorPersonId: person.id });

    // Some da listagem normal…
    expect((await db.repos.financings.listByNucleus(nucleus.id)).find((item) => item.plan.id === planId)).toBeUndefined();
    // …mas continua no banco, recuperavel e com as parcelas intactas.
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('DELETED');
    expect(await db.repos.financings.listInstallments(planId)).toHaveLength(12);

    const audit = db.raw.prepare("SELECT action, after_json FROM audit_logs WHERE entity_id = ? ORDER BY occurred_at DESC LIMIT 1").get(planId) as { action: string; after_json: string };
    expect(audit.action).toBe('DELETE_FINANCING_PLAN');
    expect(JSON.parse(audit.after_json).status).toBe('DELETED');
  });

  it('recusa excluir plano com parcelas ja pagas e orienta a cancelar', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });
    const firstDueDate = futureFirstDueDate();
    const { planId } = await new CreateFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, assetType: 'CAR', description: 'Carro pago', termMonths: 12, installmentAmountCents: 1000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id });
    const record = (await db.repos.financings.listByNucleus(nucleus.id)).find((item) => item.plan.id === planId)!;
    await new PayFinancingInstallment(db.uow).execute({ nucleusId: nucleus.id, installmentId: record.installments[0]!.id, paymentResourceId: account.id, paymentMethod: 'PIX', paidAmountCents: 1000, paidAt: firstDueDate, actorPersonId: person.id });

    // A despesa do pagamento existe no extrato; apagar o plano deixaria essa saida sem origem.
    expect((await db.repos.movements.list({ nucleusId: nucleus.id })).filter((item) => item.type === 'EXPENSE')).toHaveLength(1);
    await expect(new DeleteFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, planId, actorPersonId: person.id })).rejects.toMatchObject({ code: 'FINANCING_HAS_PAID_INSTALLMENTS' });
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('ACTIVE');
  });

  it('recusa excluir plano COMPLETED, espelhando o que o cancelamento ja fazia', async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    const account = await seedResource(db, nucleus.id, person.id, { initialBalanceCents: 100000 });
    const firstDueDate = futureFirstDueDate();
    const { planId } = await new CreateFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, assetType: 'CAR', description: 'Carro completo', termMonths: 12, installmentAmountCents: 1000, firstDueDate, paymentResourceId: account.id, responsiblePersonId: person.id, createdByPersonId: person.id });

    // Quita as 12 parcelas para o plano virar COMPLETED.
    for (let index = 0; index < 12; index += 1) {
      const installments = await db.repos.financings.listInstallments(planId);
      const pending = installments.find((item) => item.status === 'PENDING');
      if (!pending) break;
      await new PayFinancingInstallment(db.uow).execute({ nucleusId: nucleus.id, installmentId: pending.id, paymentResourceId: account.id, paymentMethod: 'PIX', paidAmountCents: 1000, paidAt: firstDueDate, actorPersonId: person.id });
    }
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('COMPLETED');

    await expect(new DeleteFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, planId, actorPersonId: person.id })).rejects.toMatchObject({ code: 'FINANCING_ALREADY_COMPLETED' });
    await expect(new CancelFinancingPlan(db.uow).execute({ nucleusId: nucleus.id, planId, actorPersonId: person.id })).rejects.toMatchObject({ code: 'FINANCING_ALREADY_COMPLETED' });
    expect((await db.repos.financings.findPlanById(planId))?.status).toBe('COMPLETED');
  });
});
