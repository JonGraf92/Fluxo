import React from 'react';
import type { OpenCreditInvoiceDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api, newOperationId } from '../../services/api';
import { formatCentsToBRL, todayIsoDate } from '../../services/money';
import type { AppSession } from '../../app/App';

export function InvoicePaymentModal({ session, resources, onClose, onCreated, cardResourceId }: { session: AppSession; resources: ResourceDto[]; onClose: () => void; onCreated: () => void; cardResourceId?: string }) {
  const { show } = useToast();
  const [invoices, setInvoices] = React.useState<OpenCreditInvoiceDto[]>([]);
  const [invoiceKey, setInvoiceKey] = React.useState('');
  const [paymentResourceId, setPaymentResourceId] = React.useState(resources.find((r) => r.type === 'MONEY_ACCOUNT' || r.type === 'CASH')?.id ?? '');
  const [date, setDate] = React.useState(todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [availableBalanceCents, setAvailableBalanceCents] = React.useState<number | null>(null);
  const moneyResources = resources.filter((r) => r.type === 'MONEY_ACCOUNT' || r.type === 'CASH');
  const keyOf = (invoice: OpenCreditInvoiceDto) => invoice.cardResourceId + ':' + invoice.dueDate;
  const selected = invoices.find((invoice) => keyOf(invoice) === invoiceKey);
  React.useEffect(() => {
    let active = true;
    if (!paymentResourceId) { setAvailableBalanceCents(null); return () => { active = false; }; }
    void api().dashboard.getSummary({ nucleusId: session.nucleusId, periodDateFrom: '2000-01-01', periodDateTo: todayIsoDate(), recentMovementsLimit: 0 }).then((summary) => {
      if (active) setAvailableBalanceCents(summary.resources.find((item) => item.resource.id === paymentResourceId)?.balanceCents ?? 0);
    }).catch(() => { if (active) setAvailableBalanceCents(null); });
    return () => { active = false; };
  }, [session.nucleusId, paymentResourceId]);
  const insufficientBalance = selected?.status === 'CLOSED' && selected.amountCents > 0 && availableBalanceCents !== null && availableBalanceCents < selected.amountCents;

  const reloadInvoices = React.useCallback(async () => {
    setLoading(true);
    try {
      const listed = await api().creditInvoices.listOpen(session.nucleusId);
      const items = cardResourceId ? listed.filter((item) => item.cardResourceId === cardResourceId) : listed;
      setInvoices(items);
      setInvoiceKey((current) => items.some((item) => keyOf(item) === current) ? current : items[0] ? keyOf(items[0]) : '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar as faturas.');
    } finally { setLoading(false); }
  }, [session.nucleusId, cardResourceId]);
  React.useEffect(() => { void reloadInvoices(); }, [reloadInvoices]);

  async function submit() {
    if (!selected) return setError('Selecione uma fatura.');
    if (selected.status === 'PAID') return;
    if (selected.status === 'CLOSED' && !paymentResourceId) return setError('Escolha a conta usada no pagamento.');
    setSubmitting(true);
    setError(null);
    try {
      if (selected.status === 'OPEN') {
        await api().creditInvoices.close({ nucleusId: session.nucleusId, cardResourceId: selected.cardResourceId, invoiceDueDate: selected.dueDate });
        show('Fatura consolidada. Registre o pagamento quando ele acontecer.');
        await reloadInvoices();
      } else {
        await api().creditInvoices.pay({ nucleusId: session.nucleusId, cardResourceId: selected.cardResourceId, invoiceDueDate: selected.dueDate, paymentResourceId, date, clientOperationId: newOperationId() });
        show('Pagamento registrado. Os saldos do cartao e da conta foram atualizados.');
        onCreated();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar a fatura.');
    } finally { setSubmitting(false); }
  }

  const action = selected?.status === 'OPEN' ? 'Fechar / consolidar fatura' : selected?.status === 'CLOSED' ? 'Registrar pagamento' : 'Fatura paga';
  return <Modal title="Faturas do cartao" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><Button onClick={submit} disabled={submitting || loading || !selected || selected.status === 'PAID' || insufficientBalance || (selected.status === 'CLOSED' && availableBalanceCents === null)}>{submitting ? 'Salvando...' : action}</Button></>}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loading ? <p>Carregando faturas...</p> : invoices.length === 0 ? <p>Nao ha faturas registradas. Compras no credito aparecem aqui apos o lancamento.</p> : <>
        <Select label="Fatura" value={invoiceKey} onChange={setInvoiceKey} options={invoices.map((invoice) => ({ value: keyOf(invoice), label: invoice.cardName + ' - vencimento ' + invoice.dueDate + ' - ' + formatCentsToBRL(invoice.amountCents) + ' - ' + (invoice.status === 'OPEN' ? 'aberta' : invoice.status === 'CLOSED' ? 'fechada' : 'paga') }))} />
        {selected?.status === 'CLOSED' && <>
          <Select label="Pagar com" value={paymentResourceId} onChange={setPaymentResourceId} placeholder="Selecione a conta" options={moneyResources.map((resource) => ({ value: resource.id, label: resource.name }))} />
          <Input label="Data do pagamento" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <p className="field-hint">Saldo disponível: {availableBalanceCents === null ? 'consultando…' : formatCentsToBRL(availableBalanceCents)} · Valor da fatura: {formatCentsToBRL(selected.amountCents)}</p>
          {insufficientBalance && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>Saldo insuficiente nesta conta. Escolha outra conta ou aguarde haver saldo antes de registrar o pagamento.</p>}
        </>}
        {selected?.status === 'PAID' && <p>Pagamento registrado em {selected.paidAt ?? 'data nao informada'}.</p>}
      </>}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  </Modal>;
}
