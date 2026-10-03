import React from 'react';
import type { CategoryDto, MemberDto, ResourceDto } from '../../../src/shared/ipc-contract';
import { Button } from '../../design-system/Button';
import { CurrencyInput } from '../../design-system/CurrencyInput';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api, newOperationId } from '../../services/api';
import { formatCentsToBRL, todayIsoDate } from '../../services/money';
import { firstEligibleInvoiceDueDate } from '../../../src/domain/services/CreditInvoiceCycle';

function nextInvoiceDueDate(dueDay = 10): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear() + Math.floor(month / 12);
  const dueMonth = month % 12;
  const lastDay = new Date(year, dueMonth + 1, 0).getDate();
  return String(year).padStart(4, '0') + '-' + String(dueMonth + 1).padStart(2, '0') + '-' + String(Math.min(dueDay, lastDay)).padStart(2, '0');
}
import type { AppSession } from '../../app/App';

interface BaseModalProps {
  session: AppSession;
  resources: ResourceDto[];
  categories: CategoryDto[];
  members: MemberDto[];
  onClose: () => void;
  onCreated: () => void;
  initialFromResourceId?: string;
  initialToResourceId?: string;
}

function resourceLabel(resource: ResourceDto): string {
  const nature = resource.type === 'BENEFIT' ? (resource.benefitSubtype ?? 'Benefício') : resource.type === 'CASH' ? 'Dinheiro físico' : resource.type === 'CREDIT_CARD' ? 'Cartão de crédito' : resource.type === 'APPLICATION' ? 'Aplica\u00e7\u00f5es' : 'Conta';
  return `${resource.name} — ${nature}`;
}

/** ENTRADA — seção 22. Ordem rápida: valor → descrição → categoria → recurso → data. */
export function NewIncomeModal({ session, resources, categories, members, onClose, onCreated }: BaseModalProps) {
  const { show } = useToast();
  const [amountCents, setAmountCents] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [resourceId, setResourceId] = React.useState(resources[0]?.id ?? '');
  const [responsiblePersonId, setResponsiblePersonId] = React.useState(session.personId);
  const [date, setDate] = React.useState(todayIsoDate());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const incomeCategories = categories.filter((c) => c.kind === 'INCOME');
  const incomeResources = resources.filter((r) => r.type !== 'CREDIT_CARD');

  async function submit() {
    if (!amountCents || amountCents <= 0) return setError('Informe um valor maior que zero.');
    if (!description.trim()) return setError('Descreva a entrada.');
    if (!resourceId) return setError('Escolha o recurso.');
    setSubmitting(true);
    setError(null);
    try {
      await api().movements.createIncome({
        nucleusId: session.nucleusId,
        resourceId,
        categoryId: categoryId || null,
        responsiblePersonId,
        amountCents,
        description: description.trim(),
        date,
        clientOperationId: newOperationId(),
      });
      show('Entrada registrada.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a entrada.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Nova entrada"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CurrencyInput label="Valor" valueCents={amountCents} onChangeCents={setAmountCents} />
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Salário" autoFocus />
        <Select
          label="Categoria"
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
          options={incomeCategories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Responsável"
          value={responsiblePersonId}
          onChange={setResponsiblePersonId}
          options={members.map((member) => ({ value: member.id, label: member.displayName }))}
        />
        <Select
          label="Recurso"
          value={resourceId}
          onChange={setResourceId}
          options={incomeResources.map((r) => ({ value: r.id, label: resourceLabel(r) }))}
        />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {!resources.some((resource) => resource.type === 'BENEFIT') && (
          <p className="field-hint">
            Para lançar VR/VA sem misturar com dinheiro, cadastre antes um recurso do tipo Benefício em Recursos.
          </p>
        )}
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}

/** SAÍDA — seção 23. Mesma ordem rápida: valor → descrição → categoria → recurso → data. */
export function NewExpenseModal({ session, resources, categories, members, onClose, onCreated }: BaseModalProps) {
  const { show } = useToast();
  const [amountCents, setAmountCents] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [resourceId, setResourceId] = React.useState(resources.find((r) => r.type === 'MONEY_ACCOUNT' || r.type === 'CASH')?.id ?? '');
  const [responsiblePersonId, setResponsiblePersonId] = React.useState(session.personId);
  const [paymentMethod, setPaymentMethod] = React.useState<'DEBIT' | 'PIX' | 'BENEFIT' | 'CREDIT'>('DEBIT');
  const [invoiceDueDate, setInvoiceDueDate] = React.useState(nextInvoiceDueDate());
  const [date, setDate] = React.useState(todayIsoDate());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE');
  const validResources = resources.filter((resource) => {
    if (paymentMethod === 'BENEFIT') return resource.type === 'BENEFIT';
    if (paymentMethod === 'CREDIT') return resource.type === 'CREDIT_CARD';
    return resource.type === 'MONEY_ACCOUNT' || resource.type === 'CASH';
  });

  React.useEffect(() => {
    if (paymentMethod !== 'CREDIT') return;
    const card = resources.find((resource) => resource.id === resourceId && resource.type === 'CREDIT_CARD');
    if (card?.statementClosingDay && card.statementDueDay) {
      setInvoiceDueDate(firstEligibleInvoiceDueDate(date, card.statementClosingDay, card.statementDueDay));
    }
  }, [paymentMethod, resourceId, date, resources]);

  function changePaymentMethod(value: string) {
    const next = value as typeof paymentMethod;
    setPaymentMethod(next);
    const candidates = resources.filter((resource) => {
      if (next === 'BENEFIT') return resource.type === 'BENEFIT';
      if (next === 'CREDIT') return resource.type === 'CREDIT_CARD';
      return resource.type === 'MONEY_ACCOUNT' || resource.type === 'CASH';
    });
    setResourceId(candidates[0]?.id ?? '');
    if (next === 'CREDIT' && candidates[0]?.statementDueDay && candidates[0]?.statementClosingDay) setInvoiceDueDate(firstEligibleInvoiceDueDate(date, candidates[0].statementClosingDay, candidates[0].statementDueDay));
  }

  async function submit() {
    if (!amountCents || amountCents <= 0) return setError('Informe um valor maior que zero.');
    if (!description.trim()) return setError('Descreva a saída.');
    if (!resourceId) return setError(paymentMethod === 'CREDIT' ? 'Cadastre e escolha o cartão de crédito.' : paymentMethod === 'BENEFIT' ? 'Cadastre e escolha um benefício VR/VA.' : 'Escolha a conta de onde sairá o pagamento.');
    if (paymentMethod === 'CREDIT' && !invoiceDueDate) return setError('Escolha a fatura desta compra.');
    setSubmitting(true);
    setError(null);
    try {
      await api().movements.createExpense({
        nucleusId: session.nucleusId,
        resourceId,
        categoryId: categoryId || null,
        responsiblePersonId,
        amountCents,
        description: description.trim(),
        date,
        paymentMethod,
        invoiceDueDate: paymentMethod === 'CREDIT' ? invoiceDueDate : null,
        clientOperationId: newOperationId(),
      });
      show('Saída registrada.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a saída.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Nova saída"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CurrencyInput label="Valor" valueCents={amountCents} onChangeCents={setAmountCents} />
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Supermercado" autoFocus />
        <Select
          label="Categoria"
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
          options={expenseCategories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Responsável"
          value={responsiblePersonId}
          onChange={setResponsiblePersonId}
          options={members.map((member) => ({ value: member.id, label: member.displayName }))}
        />
        <Select
          label="Forma de pagamento"
          value={paymentMethod}
          onChange={changePaymentMethod}
          options={[
            { value: 'DEBIT', label: 'Cartão de débito' },
            { value: 'PIX', label: 'PIX' },
            { value: 'BENEFIT', label: 'Cartão VR/VA' },
            { value: 'CREDIT', label: 'Cartão de crédito' },
          ]}
        />
        <Select
          label={paymentMethod === 'CREDIT' ? 'Cartão' : paymentMethod === 'BENEFIT' ? 'Benefício' : 'Conta de saída'}
          value={resourceId}
          onChange={setResourceId}
          placeholder="Selecione"
          options={validResources.map((r) => ({ value: r.id, label: resourceLabel(r) }))}
        />
        {paymentMethod === 'CREDIT' && (
          <Input
            label="Fatura desta compra (vencimento)"
            type="date"
            value={invoiceDueDate}
            onChange={(event) => setInvoiceDueDate(event.target.value)}
            hint="Escolha manualmente a fatura. O app sugere o dia 10 do próximo mês."
          />
        )}
        {paymentMethod === 'CREDIT' && <p className="field-hint">O dia de fechamento do cartão define o corte. Compras feitas depois do corte são previstas para a fatura seguinte; compras não podem ser lançadas em faturas já consolidadas.</p>}
        <Input label="Data da compra" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {!resources.some((resource) => resource.type === 'BENEFIT') && (
          <p className="field-hint">
            Para lançar VR/VA sem misturar com dinheiro, cadastre antes um recurso do tipo Benefício em Recursos.
          </p>
        )}
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}

/**
 * TRANSFERÊNCIA — seção 20. Nunca tem categoria. O domínio (TransferPolicy) garante que
 * as duas pontas sejam da mesma natureza e se cancelem no patrimônio total.
 */
export function NewTransferModal({ session, resources, onClose, onCreated, initialFromResourceId, initialToResourceId }: BaseModalProps) {
  const transferableResources = resources.filter((resource) => resource.type !== 'CREDIT_CARD');
  const { show } = useToast();
  const [amountCents, setAmountCents] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState('Transferência');
  const [fromResourceId, setFromResourceId] = React.useState(initialFromResourceId ?? resources[0]?.id ?? '');
  const [toResourceId, setToResourceId] = React.useState(initialToResourceId ?? resources[1]?.id ?? '');
  const [balances, setBalances] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    let active = true;
    void api().dashboard.getSummary({ nucleusId: session.nucleusId, periodDateFrom: todayIsoDate(), periodDateTo: todayIsoDate(), recentMovementsLimit: 0 }).then((summary) => {
      if (active) setBalances(Object.fromEntries(summary.resources.map((item) => [item.resource.id, item.balanceCents])));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session.nucleusId]);
  const applicationTransfer = resources.find((resource) => resource.id === fromResourceId)?.type === 'APPLICATION' || resources.find((resource) => resource.id === toResourceId)?.type === 'APPLICATION';
  const sourceBalance = balances[fromResourceId];
  const insufficient = applicationTransfer && amountCents != null && sourceBalance !== undefined && sourceBalance < amountCents;
  const [date, setDate] = React.useState(todayIsoDate());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!amountCents || amountCents <= 0) return setError('Informe um valor maior que zero.');
    if (!fromResourceId || !toResourceId) return setError('Escolha origem e destino.');
    if (fromResourceId === toResourceId) return setError('Origem e destino precisam ser diferentes.');
    setSubmitting(true);
    setError(null);
    try {
      await api().movements.createTransfer({
        nucleusId: session.nucleusId,
        fromResourceId,
        toResourceId,
        amountCents,
        description: description.trim() || 'Transferência',
        date,
        clientOperationId: newOperationId(),
      });
      show('Transferência registrada.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a transferência.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Transferência"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting || insufficient || (applicationTransfer && sourceBalance === undefined)}>
            {submitting ? 'Salvando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CurrencyInput label="Valor" valueCents={amountCents} onChangeCents={setAmountCents} />
        <Select
          label="De"
          value={fromResourceId}
          onChange={setFromResourceId}
          options={transferableResources.map((r) => ({ value: r.id, label: resourceLabel(r) }))}
        />
        {applicationTransfer && <p className="field-hint">Saldo disponível na origem: {sourceBalance === undefined ? 'consultando…' : formatCentsToBRL(sourceBalance)}</p>}
        {insufficient && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>Saldo insuficiente na origem. Reduza o valor ou escolha outra conta.</p>}
        <Select
          label="Para"
          value={toResourceId}
          onChange={setToResourceId}
          options={resources.map((r) => ({ value: r.id, label: resourceLabel(r) }))}
        />
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="field-hint">
          Uma transferência nunca aparece como despesa nem altera o patrimônio total do núcleo — só move dinheiro
          entre recursos de mesma natureza.
        </p>
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}

/** AJUSTE — seção 18. Excepcional: sempre exige motivo; o efeito vira uma MovementLeg auditada. */
export function NewAdjustmentModal({ session, resources, onClose, onCreated }: BaseModalProps) {
  const adjustableResources = resources.filter((resource) => resource.type !== 'CREDIT_CARD');
  const { show } = useToast();
  const [resourceId, setResourceId] = React.useState(resources[0]?.id ?? '');
  const [currentBalanceCents, setCurrentBalanceCents] = React.useState<number | null>(null);
  const [newBalanceCents, setNewBalanceCents] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');
  const [date, setDate] = React.useState(todayIsoDate());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      setLoadingBalance(true);
      const summary = await api().dashboard.getSummary({
        nucleusId: session.nucleusId,
        periodDateFrom: '1970-01-01',
        periodDateTo: todayIsoDate(),
      });
      if (cancelled) return;
      const found = summary.resources.find((r) => r.resource.id === resourceId);
      setCurrentBalanceCents(found ? found.balanceCents : null);
      setLoadingBalance(false);
    }
    if (resourceId) void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [resourceId, session.nucleusId]);

  async function submit() {
    if (newBalanceCents === null) return setError('Informe o saldo correto.');
    if (!reason.trim()) return setError('Todo ajuste precisa de um motivo.');
    if (currentBalanceCents !== null && newBalanceCents === currentBalanceCents) {
      return setError('O novo saldo é igual ao saldo atual — não há efeito para ajustar.');
    }
    setSubmitting(true);
    setError(null);
    try {
      await api().movements.createAdjustment({
        nucleusId: session.nucleusId,
        resourceId,
        newBalanceCents,
        reason: reason.trim(),
        date,
        clientOperationId: newOperationId(),
      });
      show('Ajuste registrado.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o ajuste.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Ajuste de saldo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting || loadingBalance}>
            {submitting ? 'Salvando…' : 'Confirmar ajuste'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select
          label="Recurso"
          value={resourceId}
          onChange={setResourceId}
          options={adjustableResources.map((r) => ({ value: r.id, label: resourceLabel(r) }))}
        />
        <div className="field">
          <span className="field-label">Saldo calculado pelo Fluxo</span>
          <span className="tabular" style={{ fontSize: 16 }}>
            {loadingBalance || currentBalanceCents === null ? '—' : formatCentsToBRL(currentBalanceCents)}
          </span>
        </div>
        <CurrencyInput label="Saldo correto (conferido por você)" valueCents={newBalanceCents} onChangeCents={setNewBalanceCents} allowNegative />
        <Input label="Motivo do ajuste" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Conferência do extrato" />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    </Modal>
  );
}
