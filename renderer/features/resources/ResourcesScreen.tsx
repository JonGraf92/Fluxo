import React from 'react';
import type { ResourceDto } from '../../../src/shared/ipc-contract';
import { InvoicePaymentModal } from '../movements/InvoicePaymentModal';
import { NewTransferModal } from '../movements/NewMovementModals';
import { Button } from '../../design-system/Button';
import { CurrencyInput } from '../../design-system/CurrencyInput';
import { EmptyState } from '../../design-system/EmptyState';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api } from '../../services/api';
import { formatCentsToBRL } from '../../services/money';
import type { AppSession } from '../../app/App';
import { useNucleusData } from '../shared/useNucleusData';

interface ResourcesScreenProps {
  session: AppSession;
  refreshToken: number;
  onChanged: () => void;
}

const TYPE_OPTIONS = [
  { value: 'MONEY_ACCOUNT', label: 'Conta de dinheiro' },
  { value: 'CASH', label: 'Dinheiro físico' },
  { value: 'APPLICATION', label: 'Aplica\u00e7\u00f5es' },
  { value: 'BENEFIT', label: 'Benefício (VR/VA)' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

function NewResourceModal({
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
  const [type, setType] = React.useState<'MONEY_ACCOUNT' | 'CASH' | 'APPLICATION' | 'BENEFIT' | 'CREDIT_CARD'>('MONEY_ACCOUNT');
  const [benefitSubtype, setBenefitSubtype] = React.useState<'VR' | 'VA'>('VR');
  const [statementDueDay, setStatementDueDay] = React.useState('10');
  const [statementClosingDay, setStatementClosingDay] = React.useState('5');
  const [liquidityDays, setLiquidityDays] = React.useState('');
  const [initialBalanceCents, setInitialBalanceCents] = React.useState<number | null>(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError('Dê um nome ao recurso.');
    if (initialBalanceCents === null) return setError('Informe o saldo inicial (pode ser zero).');
    if (type === 'APPLICATION' && (!/^\d+$/.test(liquidityDays) || Number(liquidityDays) > 36500)) return setError('Informe um prazo inteiro entre 0 e 36.500 dias.');
    setSubmitting(true);
    setError(null);
    try {
      await api().resources.create({
        nucleusId: session.nucleusId,
        name: name.trim(),
        type,
        benefitSubtype: type === 'BENEFIT' ? benefitSubtype : null,
        statementDueDay: type === 'CREDIT_CARD' ? Number(statementDueDay) : null,
        statementClosingDay: type === 'CREDIT_CARD' ? Number(statementClosingDay) : null,
        liquidityDays: type === 'APPLICATION' ? Number(liquidityDays) : null,
        initialBalanceCents,
      });
      show('Recurso criado.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o recurso.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Novo recurso"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar recurso'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta Nubank" autoFocus />
        <Select label="Tipo" value={type} onChange={(v) => setType(v as typeof type)} options={TYPE_OPTIONS} />
        {type === 'CREDIT_CARD' && (
          <>
            <Input label="Dia de fechamento da fatura (corte)" type="number" min={1} max={31} value={statementClosingDay} onChange={(event) => setStatementClosingDay(event.target.value)} hint="Compras ap\u00f3s esse dia entram no ciclo seguinte." />
            <Input label="Dia de vencimento da fatura" type="number" min={1} max={31} value={statementDueDay} onChange={(event) => setStatementDueDay(event.target.value)} />
          </>
        )}
        {type === 'APPLICATION' && (
          <Input label="Prazo de liquidez (dias)" type="number" min={0} max={36500} step={1} value={liquidityDays} onChange={(event) => setLiquidityDays(event.target.value)} hint="Informe em quantos dias o valor fica dispon\u00edvel. Use 0 para liquidez imediata." />
        )}
        {type === 'BENEFIT' && (
          <Select
            label="Subtipo"
            value={benefitSubtype}
            onChange={(v) => setBenefitSubtype(v as 'VR' | 'VA')}
            options={[
              { value: 'VR', label: 'VR — Vale Refeição' },
              { value: 'VA', label: 'VA — Vale Alimentação' },
            ]}
          />
        )}
        <CurrencyInput
          label="Saldo inicial"
          valueCents={initialBalanceCents}
          onChangeCents={setInitialBalanceCents}
          hint="Posição inicial na data de hoje. Não pode ser editada depois — correções futuras viram um ajuste auditado."
        />
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}

function EditResourceModal({ session, resource, onClose, onSaved }: { session: AppSession; resource: ResourceDto; onClose: () => void; onSaved: () => void }) {
  const { show } = useToast();
  const [name, setName] = React.useState(resource.name);
  const [initialBalanceCents, setInitialBalanceCents] = React.useState<number | null>(resource.initialBalanceCents);
  const [liquidityDays, setLiquidityDays] = React.useState(resource.liquidityDays == null ? '' : String(resource.liquidityDays));
  const [statementClosingDay, setStatementClosingDay] = React.useState(resource.statementClosingDay == null ? '' : String(resource.statementClosingDay));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmBalanceChange, setConfirmBalanceChange] = React.useState(false);
  async function saveChanges() {
    setSaving(true);
    try {
      await api().resources.update({ nucleusId: session.nucleusId, resourceId: resource.id, name: name.trim(), initialBalanceCents: initialBalanceCents!, liquidityDays: resource.type === 'APPLICATION' ? Number(liquidityDays) : null, statementClosingDay: resource.type === 'CREDIT_CARD' ? Number(statementClosingDay) : null });
      show('Recurso atualizado.');
      onSaved();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar o recurso.'); }
    finally { setSaving(false); }
  }
  async function submit() {
    if (!name.trim()) return setError('Informe o nome do recurso.');
    if (initialBalanceCents === null) return setError('Informe o saldo inicial.');
    if (resource.type === 'APPLICATION' && (!/^\d+$/.test(liquidityDays) || Number(liquidityDays) > 36500)) return setError('Informe um prazo inteiro entre 0 e 36.500 dias.');
    if (resource.type === 'CREDIT_CARD' && (!/^\d+$/.test(statementClosingDay) || Number(statementClosingDay) < 1 || Number(statementClosingDay) > 31)) return setError('Informe o dia de fechamento entre 1 e 31.');
    if (initialBalanceCents !== resource.initialBalanceCents) { setConfirmBalanceChange(true); return; }
    await saveChanges();
  }
  return <Modal title="Editar recurso" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></>}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <CurrencyInput label="Saldo inicial" valueCents={initialBalanceCents} onChangeCents={setInitialBalanceCents} hint="O saldo atual será recalculado com base neste valor e no histórico de movimentações." />
      {resource.type === 'CREDIT_CARD' && <Input label="Dia de fechamento da fatura (corte)" type="number" min={1} max={31} value={statementClosingDay} onChange={(event) => setStatementClosingDay(event.target.value)} hint="Compras após esse dia entram no ciclo seguinte." />}
      {resource.type === 'APPLICATION' && <Input label="Prazo de liquidez (dias)" type="number" min={0} max={36500} step={1} value={liquidityDays} onChange={(event) => setLiquidityDays(event.target.value)} hint="Use 0 para liquidez imediata. O prazo ainda nao altera automaticamente o saldo." />}
      <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 12 }}>A alteração do saldo inicial será registrada no histórico do núcleo.</p>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
    {confirmBalanceChange && <Modal title="Confirmar saldo inicial" onClose={() => setConfirmBalanceChange(false)} footer={<><Button variant="secondary" onClick={() => setConfirmBalanceChange(false)}>Voltar</Button><Button onClick={() => { setConfirmBalanceChange(false); void saveChanges(); }} disabled={saving}>Confirmar alteração</Button></>}><p>Deseja alterar o saldo inicial de {formatCentsToBRL(resource.initialBalanceCents)} para {formatCentsToBRL(initialBalanceCents ?? 0)}?</p><p style={{ marginBottom: 0, color: 'var(--color-ink-muted)', fontSize: 13 }}>O saldo atual será recalculado e a alteração ficará registrada no histórico.</p></Modal>}
  </Modal>;
}

function natureLabel(resource: ResourceDto): string {
  if (resource.type === 'BENEFIT') return resource.benefitSubtype ?? 'Benefício';
  if (resource.type === 'CASH') return 'Dinheiro físico';
  if (resource.type === 'APPLICATION') return resource.liquidityDays == null ? 'Aplica\u00e7\u00f5es \u00b7 prazo n\u00e3o informado' : `Aplica\u00e7\u00f5es \u00b7 D+${resource.liquidityDays} dias`;
  if (resource.type === 'CREDIT_CARD') return 'Cartão de crédito';
  return 'Conta';
}

export function ResourcesScreen({ session, refreshToken, onChanged }: ResourcesScreenProps) {
  const { resources, categories, members, reload } = useNucleusData(session.nucleusId, refreshToken);
  const [allResources, setAllResources] = React.useState<ResourceDto[]>(resources);
  const [editingResource, setEditingResource] = React.useState<ResourceDto | null>(null);
  const [archivingResource, setArchivingResource] = React.useState<ResourceDto | null>(null);
  const [showNew, setShowNew] = React.useState(false);
  const [invoiceCardId, setInvoiceCardId] = React.useState<string | null>(null);
  const [transferPreset, setTransferPreset] = React.useState<{ from: string; to: string } | null>(null);
  const [balances, setBalances] = React.useState<Record<string, number>>({});
  const activeResources = allResources.filter((resource) => !resource.archived);
  const archivedResources = allResources.filter((resource) => resource.archived);

  const reloadAll = React.useCallback(async () => {
    const result = await api().resources.list(session.nucleusId, true);
    setAllResources(result);
  }, [session.nucleusId]);
  React.useEffect(() => { void reloadAll().catch(() => undefined); }, [reloadAll, refreshToken]);
  React.useEffect(() => {
    let active = true;
    void api().dashboard.getSummary({ nucleusId: session.nucleusId, periodDateFrom: '2000-01-01', periodDateTo: new Date().toISOString().slice(0, 10), recentMovementsLimit: 0 }).then((summary) => {
      if (active) setBalances(Object.fromEntries(summary.resources.map((item) => [item.resource.id, item.balanceCents])));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session.nucleusId, refreshToken]);
  const moneyResource = activeResources.find((resource) => resource.type === 'MONEY_ACCOUNT' || resource.type === 'CASH');

  function handleCreated() {
    void reload();
    void reloadAll();
    onChanged();
  }

  async function setResourceArchived(resource: ResourceDto, archived: boolean) {
    await api().resources.setArchived({ nucleusId: session.nucleusId, resourceId: resource.id, archived });
    await reloadAll();
    await reload();
    onChanged();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Recursos</h2>
          <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{'Contas, dinheiro f\u00edsico, aplica\u00e7\u00f5es e benef\u00edcios.'}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>Novo recurso</Button>
      </div>

      {activeResources.length === 0 ? (
        <EmptyState title="Nenhum recurso" description="Cadastre o primeiro recurso para começar a lançar movimentações." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeResources.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className={`nature-dot ${r.type === 'BENEFIT' ? 'nature-dot-benefit' : 'nature-dot-money'}`} />
                <span>
                  {r.name}
                  <span style={{ color: 'var(--color-ink-muted)', marginLeft: 8, fontSize: 12 }}>{natureLabel(r)}</span>
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {r.type === 'CREDIT_CARD' && <Button variant="secondary" onClick={() => setInvoiceCardId(r.id)}>Faturas</Button>}
                {r.type === 'APPLICATION' && <>
                  <Button variant="secondary" disabled={!moneyResource} onClick={() => moneyResource && setTransferPreset({ from: moneyResource.id, to: r.id })}>Aplicar</Button>
                  <Button variant="secondary" disabled={!moneyResource} onClick={() => moneyResource && setTransferPreset({ from: r.id, to: moneyResource.id })}>Resgatar</Button>
                </>}
                <Button variant="ghost" onClick={() => setEditingResource(r)}>Editar</Button>
                <Button variant="ghost" onClick={() => setArchivingResource(r)}>Excluir</Button>
                <span className="tabular" style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>
                  Saldo atual: {formatCentsToBRL(balances[r.id] ?? r.initialBalanceCents)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {archivedResources.length > 0 && <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ fontSize: 15, margin: '12px 0 0' }}>Recursos arquivados</h3>
        {archivedResources.map((resource) => <div key={resource.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-ink-muted)' }}>
          <span>{resource.name} — {natureLabel(resource)}</span>
          <Button variant="secondary" onClick={() => void setResourceArchived(resource, false)}>Reativar</Button>
        </div>)}
      </section>}

      {showNew && <NewResourceModal session={session} onClose={() => setShowNew(false)} onCreated={handleCreated} />}
      {invoiceCardId && <InvoicePaymentModal session={session} resources={activeResources} cardResourceId={invoiceCardId} onClose={() => setInvoiceCardId(null)} onCreated={handleCreated} />}
      {transferPreset && <NewTransferModal session={session} resources={activeResources} categories={categories} members={members} initialFromResourceId={transferPreset.from} initialToResourceId={transferPreset.to} onClose={() => setTransferPreset(null)} onCreated={() => { setTransferPreset(null); handleCreated(); }} />}
      {editingResource && <EditResourceModal session={session} resource={editingResource} onClose={() => setEditingResource(null)} onSaved={handleCreated} />}
      {archivingResource && <Modal title="Excluir recurso?" onClose={() => setArchivingResource(null)} footer={<><Button variant="secondary" onClick={() => setArchivingResource(null)}>Cancelar</Button><Button variant="danger" onClick={() => { void setResourceArchived(archivingResource, true).then(() => setArchivingResource(null)); }}>Excluir recurso</Button></>}>
        <p>O recurso saira da lista ativa e nao podera receber novos lancamentos. O historico e os saldos registrados serao preservados. Ele podera ser reativado depois.</p>
      </Modal>}
    </div>
  );
}
