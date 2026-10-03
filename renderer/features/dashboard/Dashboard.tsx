import React from 'react';
import type { DashboardSummaryDto } from '../../../src/shared/ipc-contract';
import { EmptyState } from '../../design-system/EmptyState';
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

export function Dashboard({ session, refreshToken, onChanged }: DashboardProps) {
  const { resources, categories, members, reload: reloadNucleusData } = useNucleusData(session.nucleusId, refreshToken);
  const [summary, setSummary] = React.useState<DashboardSummaryDto | null>(null);
  const [localRefresh, setLocalRefresh] = React.useState(0);

  const loadSummary = React.useCallback(async () => {
    const result = await api().dashboard.getSummary({
      nucleusId: session.nucleusId,
      periodDateFrom: firstDayOfMonthIso(),
      periodDateTo: todayIsoDate(),
      recentMovementsLimit: 8,
    });
    setSummary(result);
  }, [session.nucleusId]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 960 }}>
      <div>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>Painel</h2>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Visão geral do mês corrente.</p>
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
            <SummaryCard label="Faturas a pagar" valueCents={summary.creditOutstandingCents} />
            <SummaryCard label="Entradas no mês" valueCents={summary.periodIncomeCents} />
            <SummaryCard label="Saídas no mês" valueCents={summary.periodExpenseCents} />
          </div>

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
