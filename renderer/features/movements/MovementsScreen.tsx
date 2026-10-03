import React from 'react';
import type { MovementDto } from '../../../src/shared/ipc-contract';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api } from '../../services/api';
import type { AppSession } from '../../app/App';
import { useNucleusData } from '../shared/useNucleusData';
import { MovementsTable } from './MovementsTable';
import { QuickActions } from './QuickActions';

interface MovementsScreenProps {
  session: AppSession;
  refreshToken: number;
  onChanged: () => void;
}

const TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Entrada' },
  { value: 'EXPENSE', label: 'Saída' },
  { value: 'TRANSFER', label: 'Transferência' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
];

export function MovementsScreen({ session, refreshToken, onChanged }: MovementsScreenProps) {
  const { resources, categories, members, reload: reloadNucleusData } = useNucleusData(session.nucleusId, refreshToken);
  const { show } = useToast();

  const [type, setType] = React.useState('');
  const [resourceId, setResourceId] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [movements, setMovements] = React.useState<MovementDto[]>([]);
  const [localRefresh, setLocalRefresh] = React.useState(0);
  const [toCancel, setToCancel] = React.useState<MovementDto | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');

  const loadMovements = React.useCallback(async () => {
    const result = await api().movements.list({
      nucleusId: session.nucleusId,
      type: (type || undefined) as MovementDto['type'] | undefined,
      resourceId: resourceId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    setMovements(result);
  }, [session.nucleusId, type, resourceId, dateFrom, dateTo]);

  React.useEffect(() => {
    void loadMovements();
  }, [loadMovements, refreshToken, localRefresh]);

  function handleChanged() {
    setLocalRefresh((t) => t + 1);
    void reloadNucleusData();
    onChanged();
  }

  async function confirmCancel() {
    if (!toCancel || !cancelReason.trim()) return;
    try {
      await api().movements.cancel({ movementId: toCancel.id, reason: cancelReason.trim() });
      show('Movimentação cancelada.');
      setToCancel(null);
      setCancelReason('');
      handleChanged();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível cancelar.', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>Movimentações</h2>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Histórico completo — cancelamentos ficam visíveis, nunca somem.</p>
      </div>

      <QuickActions session={session} resources={resources} categories={categories} members={members} onChanged={handleChanged} />

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 160 }}>
          <Select label="Tipo" value={type} onChange={setType} placeholder="Todos" options={TYPE_OPTIONS} />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            label="Recurso"
            value={resourceId}
            onChange={setResourceId}
            placeholder="Todos"
            options={resources.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>
        <Input label="De" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="Até" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <MovementsTable movements={movements} resources={resources} categories={categories} members={members} onCancel={(m) => setToCancel(m)} />

      {toCancel && (
        <Modal
          title="Cancelar movimentação"
          onClose={() => {
            setToCancel(null);
            setCancelReason('');
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setToCancel(null);
                  setCancelReason('');
                }}
              >
                Voltar
              </Button>
              <Button variant="danger" onClick={confirmCancel} disabled={!cancelReason.trim()}>
                Cancelar movimentação
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>
              “{toCancel.description}” permanece no histórico, marcado como cancelado — ele só deixa de entrar no
              saldo. Informe o motivo.
            </p>
            <Input label="Motivo do cancelamento" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          </div>
        </Modal>
      )}
    </div>
  );
}
