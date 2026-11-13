import React from 'react';
import type { DashboardSummaryDto } from '../../../src/shared/ipc-contract';
import { EmptyState } from '../../design-system/EmptyState';
import { Input } from '../../design-system/Input';
import { api } from '../../services/api';
import { firstDayOfMonthIso, formatCentsToBRL, todayIsoDate } from '../../services/money';
import type { AppSession } from '../../app/App';
import { MovementsTable } from '../movements/MovementsTable';
import { QuickActions } from '../movements/QuickActions';
import { useNucleusData } from '../shared/useNucleusData';

interface DashboardProps {
  session: AppSession;
  refreshToken: number;
  onChanged: () => void;
}

function SummaryCard({ label, valueCents, accent }: { label: string; valueCents: number; accent?: 'money' | 'benefit' }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 6 }}>{label}</div>
      <div
        className="tabular"
        style={{
          fontSize: 24,
          fontFamily: 'var(--font-display)',
          color: accent === 'money' ? 'var(--color-money)' : accent === 'benefit' ? 'var(--color-benefit)' : 'var(--color-ink)',
        }}
      >
        {formatCentsToBRL(valueCents)}
      </div>
    </div>
  );
}

/** Resultado do período em dinheiro e cartão, com benefício à parte (ADR D-023, D-037). */
function PeriodSection({ summary, categoryName, hasBenefit, children }: { summary: DashboardSummaryDto; categoryName: (id: string | null) => string; hasBenefit: boolean; children: React.ReactNode }) {
  const share = (cents: number) => (summary.periodExpenseCents > 0 ? `${Math.round((cents * 100) / summary.periodExpenseCents)}%` : '—');
  return (
    <>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Período</h3>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--space-3)' }}>{children}</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <SummaryCard label="Entradas" valueCents={summary.periodIncomeCents} />
          <SummaryCard label="Saídas (dinheiro e cartão)" valueCents={summary.periodExpenseCents} />
          <SummaryCard label="Resultado" valueCents={summary.periodIncomeCents - summary.periodExpenseCents} accent="money" />
        </div>
        {hasBenefit && (
          <p className="field-hint" style={{ marginTop: 8 }}>
            Benefícios (VR/VA) no período: recebido {formatCentsToBRL(summary.periodBenefitIncomeCents)} · gasto {formatCentsToBRL(summary.periodBenefitExpenseCents)}. Não entram no resultado acima.
          </p>
        )}
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Gastos por categoria no período</h3>
        {summary.expenseByCategory.length === 0 ? (
          <p style={{ color: 'var(--color-ink-muted)' }}>Nenhuma saída no período.</p>
        ) : (
          <table className="movement-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="col-amount">Dinheiro e cartão</th>
                {hasBenefit && <th className="col-amount">Benefício</th>}
                <th className="col-amount">% das saídas</th>
              </tr>
            </thead>
            <tbody>
              {summary.expenseByCategory.map((item) => (
                <tr key={item.categoryId ?? 'none'}>
                  <td>{categoryName(item.categoryId)}</td>
                  <td className="col-amount tabular">{formatCentsToBRL(item.amountCents)}</td>
                  {hasBenefit && <td className="col-amount tabular">{formatCentsToBRL(item.benefitAmountCents)}</td>}
                  <td className="col-amount tabular">{share(item.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function Dashboard({ session, refreshToken, onChanged }: DashboardProps) {
  const { resources, categories, members, reload: reloadNucleusData } = useNucleusData(session.nucleusId, refreshToken);
  const [summary, setSummary] = React.useState<DashboardSummaryDto | null>(null);
  const [localRefresh, setLocalRefresh] = React.useState(0);
  const [periodFrom, setPeriodFrom] = React.useState(firstDayOfMonthIso());
  const [periodTo, setPeriodTo] = React.useState(todayIsoDate());

  const loadSummary = React.useCallback(async () => {
    // Campo de data vazio ou período invertido: mantém o último resumo em vez de falhar.
    if (!periodFrom || !periodTo || periodFrom > periodTo) return;
    const result = await api().dashboard.getSummary({
      nucleusId: session.nucleusId,
      periodDateFrom: periodFrom,
      periodDateTo: periodTo,
      recentMovementsLimit: 8,
    });
    setSummary(result);
  }, [session.nucleusId, periodFrom, periodTo]);

  React.useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshToken, localRefresh]);

  function handleChanged() {
    setLocalRefresh((t) => t + 1);
    void reloadNucleusData();
    onChanged();
  }

  if (!summary) {
    return <p style={{ color: 'var(--color-ink-muted)' }}>Carregando painel…</p>;
  }

  const moneyResources = summary.resources.filter((r) => r.resource.type === 'MONEY_ACCOUNT' || r.resource.type === 'CASH');
  const applicationResources = summary.resources.filter((r) => r.resource.type === 'APPLICATION');
  const benefitResources = summary.resources.filter((r) => r.resource.type === 'BENEFIT');
  const creditResources = summary.resources.filter((r) => r.resource.type === 'CREDIT_CARD');
  const categoryName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? '—' : 'Sem categoria');
  const hasBenefitInPeriod = summary.periodBenefitIncomeCents > 0 || summary.periodBenefitExpenseCents > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 960 }}>
      <div>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>Painel</h2>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Saldos de hoje e resultado do período escolhido.</p>
      </div>

      <QuickActions session={session} resources={resources} categories={categories} members={members} onChanged={handleChanged} />

      {resources.length === 0 ? (
        <EmptyState
          title="Nenhum recurso ainda"
          description="Cadastre um recurso em “Recursos” para começar a lançar entradas e saídas."
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <SummaryCard label="Dinheiro disponível" valueCents={summary.moneyTotalCents} accent="money" />
            <SummaryCard label="Aplicações" valueCents={summary.applicationTotalCents} />
            <SummaryCard label="Benefícios" valueCents={summary.benefitTotalCents} accent="benefit" />
            <SummaryCard label="Cartões a pagar" valueCents={summary.creditOutstandingCents} />
            {summary.financingOutstandingCents > 0 && (
              <SummaryCard label="Financiamentos e empréstimos a pagar" valueCents={summary.financingOutstandingCents} />
            )}
          </div>

          <PeriodSection summary={summary} categoryName={categoryName} hasBenefit={hasBenefitInPeriod}>
            <Input label="De" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            <Input label="Até" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </PeriodSection>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Saldo por recurso</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...moneyResources, ...applicationResources, ...benefitResources, ...creditResources].map((r) => (
                <div
                  key={r.resource.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`nature-dot ${r.resource.type === 'BENEFIT' ? 'nature-dot-benefit' : 'nature-dot-money'}`} />
                    {r.resource.name}
                  </span>
                  <span className="tabular">{formatCentsToBRL(r.balanceCents)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Movimentações recentes</h3>
            <MovementsTable movements={summary.recentMovements} resources={resources} categories={categories} members={members} />
          </div>
        </>
      )}
    </div>
  );
}
