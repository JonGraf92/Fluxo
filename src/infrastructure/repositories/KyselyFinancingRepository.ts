import { Kysely } from 'kysely';
import { FinancingInstallment, FinancingPlan, FinancingPlanWithInstallments, FinancingAssetType } from '../../domain/entities/Financing';
import { FinancingRepository } from '../../application/ports/repositories';
import { Database } from '../db/types';

export class KyselyFinancingRepository implements FinancingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(plan: FinancingPlan, installments: FinancingInstallment[]): Promise<void> {
    await this.db.insertInto('financing_plans').values({
      id: plan.id,
      nucleus_id: plan.nucleusId,
      category_id: plan.categoryId,
      asset_type: plan.assetType,
      description: plan.description,
      term_months: plan.termMonths,
      installment_amount_cents: plan.installmentAmountCents,
      first_due_date: plan.firstDueDate,
      payment_resource_id: plan.paymentResourceId,
      responsible_person_id: plan.responsiblePersonId,
      created_by_person_id: plan.createdByPersonId,
      status: plan.status,
      created_at: plan.createdAt.toISOString(),
    }).execute();

    if (installments.length) {
      await this.db.insertInto('financing_installments').values(installments.map((installment) => ({
        id: installment.id,
        plan_id: installment.planId,
        installment_number: installment.installmentNumber,
        due_date: installment.dueDate,
        amount_cents: installment.amountCents,
        paid_amount_cents: installment.paidAmountCents,
        status: installment.status,
        paid_at: installment.paidAt,
        payment_movement_id: installment.paymentMovementId,
        payment_resource_id: installment.paymentResourceId,
      }))).execute();
    }
  }

  async findPlanById(planId: string): Promise<FinancingPlan | null> {
    const row = await this.db.selectFrom('financing_plans').selectAll().where('id', '=', planId).executeTakeFirst();
    return row ? this.mapPlan(row) : null;
  }

  async findInstallmentById(installmentId: string): Promise<FinancingInstallment | null> {
    const row = await this.db.selectFrom('financing_installments').selectAll().where('id', '=', installmentId).executeTakeFirst();
    return row ? this.mapInstallment(row) : null;
  }

  async listInstallments(planId: string): Promise<FinancingInstallment[]> {
    const rows = await this.db.selectFrom('financing_installments').selectAll().where('plan_id', '=', planId).orderBy('installment_number').execute();
    return rows.map((row) => this.mapInstallment(row));
  }

  async listByNucleus(nucleusId: string): Promise<FinancingPlanWithInstallments[]> {
    const plans = await this.db.selectFrom('financing_plans').selectAll().where('nucleus_id', '=', nucleusId).orderBy('first_due_date').execute();
    if (!plans.length) return [];
    const installments = await this.db.selectFrom('financing_installments').selectAll().where('plan_id', 'in', plans.map((plan) => plan.id)).orderBy('due_date').execute();
    const byPlan = new Map<string, FinancingInstallment[]>();
    for (const row of installments) {
      const values = byPlan.get(row.plan_id) ?? [];
      values.push(this.mapInstallment(row));
      byPlan.set(row.plan_id, values);
    }
    return plans.map((plan) => ({ plan: this.mapPlan(plan), installments: byPlan.get(plan.id) ?? [] }));
  }

  async markInstallmentPaid(installmentId: string, paidAmountCents: number, paidAt: string, movementId: string, paymentResourceId: string): Promise<void> {
    await this.db.updateTable('financing_installments').set({
      status: 'PAID',
      paid_amount_cents: paidAmountCents,
      paid_at: paidAt,
      payment_movement_id: movementId,
      payment_resource_id: paymentResourceId,
    }).where('id', '=', installmentId).where('status', '=', 'PENDING').execute();
  }

  async setPlanStatus(planId: string, status: FinancingPlan['status']): Promise<void> {
    await this.db.updateTable('financing_plans').set({ status }).where('id', '=', planId).execute();
  }

  async updateDetails(planId: string, values: Pick<FinancingPlan, 'assetType' | 'description' | 'installmentAmountCents'>): Promise<void> {
    await this.db.updateTable('financing_plans').set({
      asset_type: values.assetType, description: values.description, installment_amount_cents: values.installmentAmountCents,
    }).where('id', '=', planId).execute();
    await this.db.updateTable('financing_installments').set({ amount_cents: values.installmentAmountCents })
      .where('plan_id', '=', planId).where('status', '=', 'PENDING').execute();
  }

  async deletePlan(planId: string): Promise<void> {
    await this.db.deleteFrom('financing_installments').where('plan_id', '=', planId).execute();
    await this.db.deleteFrom('financing_plans').where('id', '=', planId).execute();
  }

  private mapPlan(row: Database['financing_plans']): FinancingPlan {
    return {
      id: row.id,
      nucleusId: row.nucleus_id,
      categoryId: row.category_id,
      assetType: row.asset_type as FinancingAssetType,
      description: row.description,
      termMonths: row.term_months,
      installmentAmountCents: row.installment_amount_cents,
      firstDueDate: row.first_due_date,
      paymentResourceId: row.payment_resource_id,
      responsiblePersonId: row.responsible_person_id,
      createdByPersonId: row.created_by_person_id,
      status: row.status as FinancingPlan['status'],
      createdAt: new Date(row.created_at),
    };
  }

  private mapInstallment(row: Database['financing_installments']): FinancingInstallment {
    return {
      id: row.id,
      planId: row.plan_id,
      installmentNumber: row.installment_number,
      dueDate: row.due_date,
      amountCents: row.amount_cents,
      paidAmountCents: row.paid_amount_cents,
      status: row.status as FinancingInstallment['status'],
      paidAt: row.paid_at,
      paymentMovementId: row.payment_movement_id,
      paymentResourceId: row.payment_resource_id,
    };
  }
}
