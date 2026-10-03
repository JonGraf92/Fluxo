import React from 'react';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api } from '../../services/api';
import type { AppSession } from '../../app/App';
import { useNucleusData } from '../shared/useNucleusData';

interface CategoriesScreenProps {
  session: AppSession;
  refreshToken: number;
  onChanged: () => void;
}

function NewCategoryModal({
  session,
  onClose,
  onCreated,
}: {
  session: AppSession;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { show } = useToast();
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError('Dê um nome à categoria.');
    setSubmitting(true);
    setError(null);
    try {
      await api().categories.create({ nucleusId: session.nucleusId, name: name.trim(), kind });
      show('Categoria criada.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Nova categoria"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar categoria'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Farmácia" autoFocus />
        <Select
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as 'INCOME' | 'EXPENSE')}
          options={[
            { value: 'EXPENSE', label: 'Saída' },
            { value: 'INCOME', label: 'Entrada' },
          ]}
        />
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}

export function CategoriesScreen({ session, refreshToken, onChanged }: CategoriesScreenProps) {
  const { categories, reload } = useNucleusData(session.nucleusId, refreshToken);
  const [showNew, setShowNew] = React.useState(false);

  const incomeCategories = categories.filter((c) => c.kind === 'INCOME');
  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE');

  function handleCreated() {
    void reload();
    onChanged();
  }

  function renderList(list: typeof categories) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((c) => (
          <div
            key={c.id}
            style={{
              padding: '8px 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{c.name}</span>
            {c.isSystem ? <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>padrão</span> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Categorias</h2>
          <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Simples e editáveis — adicione as que fizerem sentido para você.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>Nova categoria</Button>
      </div>

      <div>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Entradas</h3>
        {renderList(incomeCategories)}
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Saídas</h3>
        {renderList(expenseCategories)}
      </div>

      {showNew && <NewCategoryModal session={session} onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  );
}
