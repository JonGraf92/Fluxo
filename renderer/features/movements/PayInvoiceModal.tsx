import React from 'react';
import type { OpenCreditInvoiceDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { Button } from '../../design-system/Button';
import { CurrencyInput } from '../../design-system/CurrencyInput';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api, newOperationId } from '../../services/api';
import { formatCentsToBRL, todayIsoDate } from '../../services/money';
import type { AppSession } from '../../app/App';

/** Pagar a fatura em um passo: o app consolida e paga na mesma operação (ADR D-040). */
export function PayInvoiceModal({ session, resources, invoice, onClose, onPaid }: { session: AppSession; resources: ResourceDto[]; invoice: OpenCreditInvoiceDto; onClose: () => void; onPaid: () => void }) {
  const { show } = useToast();
  const accounts = resources.filter((resource) => resource.type === 'MONEY_ACCOUNT' || resource.type === 'CASH');
  // Sugestão: a conta do último pagamento deste cartão, se ainda estiver ativa.
  const suggested = accounts.find((account) => account.id === invoice.suggestedPaymentResourceId) ?? accounts[0];
  const [paymentResourceId, setPaymentResourceId] = React.useState(suggested?.id ?? '');
  const [paidCents, setPaidCents] = React.useState<number | null>(invoice.amountCents);
  const [date, setDate] = React.useState(todayIsoDate());
  const [differenceKind, setDifferenceKind] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Um id por abertura do diálogo: clicar duas vezes em "Pagar" não paga duas vezes.
  const [operationId] = React.useState(newOperationId);
  const difference = (paidCents ?? 0) - invoice.amountCents;

  async function submit() {
    if (!paidCents) return setError('Informe o valor pago.');
    if (!paymentResourceId) return setError('Escolha a conta usada no pagamento.');
    if (difference < 0) return setError(`Pagamento parcial não é suportado. O total lançado é ${formatCentsToBRL(invoice.amountCents)}.`);
    if (difference > 0 && !differenceKind) return setError('Informe o que é a diferença.');
    setSubmitting(true);
    setError(null);
    try {
      await api().creditInvoices.settle({
        nucleusId: session.nucleusId, cardResourceId: invoice.cardResourceId, invoiceDueDate: invoice.dueDate, paymentResourceId, date, paidAmountCents: paidCents,
        ...(difference > 0 ? { differenceKind: differenceKind as 'CHARGES' | 'UNRECORDED_PURCHASE' } : {}),
        clientOperationId: operationId,
      });
      show('Fatura paga. Os saldos do cartão e da conta foram atualizados.');
      onPaid();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pagar a fatura.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Pagar fatura: ${invoice.cardName}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => void submit()} disabled={submitting}>{submitting ? 'Pagando…' : 'Pagar fatura'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0 }}>Vencimento {invoice.dueDate.split('-').reverse().join('/')} · total lançado {formatCentsToBRL(invoice.amountCents)}</p>
        <CurrencyInput label="Valor pago" valueCents={paidCents} onChangeCents={setPaidCents} hint="Já vem com o total lançado. Altere só se o banco cobrou outro valor." />
        {difference > 0 && (
          <Select
            label={`Diferença de ${formatCentsToBRL(difference)}`}
            value={differenceKind}
            onChange={setDifferenceKind}
            placeholder="O que é essa diferença?"
            options={[{ value: 'CHARGES', label: 'Juros e encargos' }, { value: 'UNRECORDED_PURCHASE', label: 'Compra que não lancei' }]}
          />
        )}
        {difference < 0 && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>O valor está menor que o total lançado. Pagamento parcial não é suportado: se uma compra foi lançada a mais, cancele-a antes.</p>}
        <Select label="Pagar com" value={paymentResourceId} onChange={setPaymentResourceId} placeholder="Selecione a conta" options={accounts.map((account) => ({ value: account.id, label: account.name }))} />
        <Input label="Data do pagamento" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        {invoice.status === 'OPEN' && <p className="field-hint">A fatura será consolidada junto com o pagamento. Compras lançadas depois vão para a fatura seguinte.</p>}
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}
