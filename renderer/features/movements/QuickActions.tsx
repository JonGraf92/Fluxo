import React from 'react';
import type { CategoryDto, MemberDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { Button } from '../../design-system/Button';
import type { AppSession } from '../../app/App';
import { NewAdjustmentModal, NewExpenseModal, NewIncomeModal, NewTransferModal } from './NewMovementModals';

type ActiveModal = 'income' | 'expense' | 'transfer' | 'adjustment' | null;

interface QuickActionsProps {
  session: AppSession;
  resources: ResourceDto[];
  categories: CategoryDto[];
  members: MemberDto[];
  onChanged: () => void;
}

/** Seção 30 — as quatro ações precisam estar sempre à mão, sem fricção. */
export function QuickActions({ session, resources, categories, members, onChanged }: QuickActionsProps) {
  const [active, setActive] = React.useState<ActiveModal>(null);
  const hasResources = resources.length > 0;
  const transferableResources = resources.filter((resource) => resource.type !== 'CREDIT_CARD');
  const hasTwoResources = transferableResources.length > 1;

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button onClick={() => setActive('income')} disabled={!hasResources}>
          + Nova entrada
        </Button>
        <Button variant="secondary" onClick={() => setActive('expense')} disabled={!hasResources}>
          − Nova saída
        </Button>
        <Button variant="secondary" onClick={() => setActive('transfer')} disabled={!hasTwoResources}>
          ⇄ Transferência
        </Button>
        <Button variant="ghost" onClick={() => setActive('adjustment')} disabled={!hasResources}>
          ⚙ Ajuste
        </Button>
      </div>

      {active === 'income' && (
        <NewIncomeModal
          session={session}
          resources={resources}
          categories={categories}
          members={members}
          onClose={() => setActive(null)}
          onCreated={onChanged}
        />
      )}
      {active === 'expense' && (
        <NewExpenseModal
          session={session}
          resources={resources}
          categories={categories}
          members={members}
          onClose={() => setActive(null)}
          onCreated={onChanged}
        />
      )}
      {active === 'transfer' && (
        <NewTransferModal
          session={session}
          resources={resources}
          categories={categories}
          members={members}
          onClose={() => setActive(null)}
          onCreated={onChanged}
        />
      )}
      {active === 'adjustment' && (
        <NewAdjustmentModal
          session={session}
          resources={resources}
          categories={categories}
          members={members}
          onClose={() => setActive(null)}
          onCreated={onChanged}
        />
      )}
    </>
  );
}
