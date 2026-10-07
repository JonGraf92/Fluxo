import React from 'react';
import type { FinancingPlanDto } from '../../../src/shared/ipc-contract';
import type { FinancingAssetType, LoanInterestRatePeriod } from '../../../src/domain/entities/Financing';
import { allowedFinancingTerms, currentMonthInstallmentNearDate, FINANCING_ASSET_TYPES, financingDueDate, LOAN_FINANCING_TYPE, LOAN_MAX_TERM_MONTHS, loanCostSummary } from '../../../src/domain/entities/Financing';
import { formatBpsAsPercent, parsePercentToBps } from '../../../src/shared/percent-parsing';
import { Button } from '../../design-system/Button';
import { CurrencyInput } from '../../design-system/CurrencyInput';
import { Input } from '../../design-system/Input';
import { Modal } from '../../design-system/Modal';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api } from '../../services/api';
import { formatCentsToBRL, todayIsoDate } from '../../services/money';
import type { AppSession } from '../../app/App';
import { useNucleusData } from '../shared/useNucleusData';

const ASSET_LABELS: Record<FinancingAssetType, string> = { HOUSE: 'Casa', APARTMENT: 'Apartamento', LAND: 'Terreno', PROPERTY_CONSORTIUM: 'Consórcio imobiliário', CAR: 'Carro', MOTORCYCLE: 'Moto', TRUCK: 'Caminhão', JET_SKI: 'Jet Ski', VEHICLE_CONSORTIUM: 'Consórcio de veículo', LOAN: 'Empréstimo' };
const RATE_PERIOD_OPTIONS: { value: LoanInterestRatePeriod; label: string }[] = [{ value: 'MONTH', label: 'ao mês' }, { value: 'YEAR', label: 'ao ano' }];
const RATE_PERIOD_SHORT: Record<LoanInterestRatePeriod, string> = { MONTH: 'a.m.', YEAR: 'a.a.' };
const NON_LOAN_TYPES = FINANCING_ASSET_TYPES.filter((value) => value !== LOAN_FINANCING_TYPE);

/** Resumo do empréstimo a partir do que foi digitado: última parcela, total e custo. */
function LoanSummaryHint({ principalAmountCents, installmentAmountCents, termMonths, firstDueDate }: { principalAmountCents: number | null; installmentAmountCents: number | null; termMonths: number; firstDueDate: string }) {
  if (!principalAmountCents || !installmentAmountCents || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > LOAN_MAX_TERM_MONTHS || !firstDueDate) return null;
  const summary = loanCostSummary({ principalAmountCents, installmentAmountCents, termMonths, firstDueDate });
  return <>
    <p className="field-hint">Última parcela vence em {summary.lastDueDate} · total a pagar {formatCentsToBRL(summary.totalPayableCents)} · juros e encargos {formatCentsToBRL(summary.costCents)}</p>
    {summary.costCents < 0 && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>A soma das parcelas está menor que o valor emprestado. Confira o valor da parcela e a quantidade.</p>}
  </>;
}

function CreatePlanModal({ session, resources, members, onClose, onCreated }: { session: AppSession; resources: ReturnType<typeof useNucleusData>['resources']; members: ReturnType<typeof useNucleusData>['members']; onClose: () => void; onCreated: () => void }) {
  const { show } = useToast();
  const [assetType, setAssetType] = React.useState<FinancingAssetType>('HOUSE');
  const [description, setDescription] = React.useState('');
  const descriptionPlaceholder: Record<FinancingAssetType, string> = {
    HOUSE: 'Ex.: Financiamento da casa', APARTMENT: 'Ex.: Financiamento do apartamento', LAND: 'Ex.: Financiamento do terreno', PROPERTY_CONSORTIUM: 'Ex.: Consórcio imobiliário',
    CAR: 'Ex.: Financiamento do carro', MOTORCYCLE: 'Ex.: Financiamento da moto', TRUCK: 'Ex.: Financiamento do caminhão', JET_SKI: 'Ex.: Financiamento do Jet Ski', VEHICLE_CONSORTIUM: 'Ex.: Consórcio de veículo',
    LOAN: 'Ex.: Empréstimo pessoal',
  };
  const isLoan = assetType === LOAN_FINANCING_TYPE;
  const [term, setTerm] = React.useState('240');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [principal, setPrincipal] = React.useState<number | null>(null);
  const [rateText, setRateText] = React.useState('');
  const [ratePeriod, setRatePeriod] = React.useState<LoanInterestRatePeriod>('MONTH');
  const rateBps = parsePercentToBps(rateText);
  const [firstDueDate, setFirstDueDate] = React.useState(todayIsoDate());
  const [resourceId, setResourceId] = React.useState(resources.find((item) => item.type === 'MONEY_ACCOUNT' || item.type === 'CASH')?.id ?? '');
  const [personId, setPersonId] = React.useState(session.personId);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmingCurrentInstallment, setConfirmingCurrentInstallment] = React.useState(false);
  const terms = allowedFinancingTerms(assetType);
  const currentMonthInstallment = currentMonthInstallmentNearDate(firstDueDate, Number(term), todayIsoDate());
  // No empréstimo a quantidade é digitada; corrigir a cada tecla apagaria o que o usuário escreve.
  React.useEffect(() => { if (!isLoan && !terms.includes(Number(term))) setTerm(String(terms[0])); }, [isLoan, terms, term]);
  /** Devolve a mensagem do primeiro campo faltando ou inválido, ou `null` se dá para enviar. */
  function validationMessage(): string | null {
    if (!description.trim() || !amount || !resourceId || !personId) return 'Preencha a descrição, o valor da parcela, a conta e a pessoa responsável.';
    if (!isLoan) return null;
    if (!principal) return 'Informe o valor emprestado.';
    if (!Number.isInteger(Number(term)) || Number(term) < 1 || Number(term) > LOAN_MAX_TERM_MONTHS) return `Informe a quantidade de parcelas, de 1 a ${LOAN_MAX_TERM_MONTHS}.`;
    if (rateBps === null) return 'Informe a taxa de juros no formato 1,99 (use 0 se não houver juros).';
    return null;
  }
  async function createPlan(currentMonthInstallmentPaid?: boolean) {
    const invalid = validationMessage();
    if (invalid || !amount) return setError(invalid);
    setSaving(true); setError(null);
    try {
      await api().financings.create({
        nucleusId: session.nucleusId, assetType, description: description.trim(), termMonths: Number(term), installmentAmountCents: amount, firstDueDate, paymentResourceId: resourceId, responsiblePersonId: personId,
        ...(currentMonthInstallment !== null ? { currentMonthInstallmentPaid } : {}),
        ...(isLoan && principal && rateBps !== null ? { loan: { principalAmountCents: principal, interestRateBps: rateBps, interestRatePeriod: ratePeriod } } : {}),
      });
      show(isLoan ? 'Empréstimo criado. O valor emprestado ficou registrado; nenhum saldo foi alterado.' : 'Financiamento criado. Parcelas anteriores foram reconhecidas; pagamentos já feitos não alteraram novamente o saldo.'); onCreated(); onClose();
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o plano.'); }
    finally { setSaving(false); }
  }
  async function submit() {
    const invalid = validationMessage();
    if (invalid) return setError(invalid);
    if (currentMonthInstallment !== null) { setConfirmingCurrentInstallment(true); return; }
    await createPlan();
  }
  function changeAssetType(value: FinancingAssetType) {
    setAssetType(value);
    // 240 é o prazo inicial de imóvel; para empréstimo o campo é livre e começa em 12.
    if (value === LOAN_FINANCING_TYPE) setTerm('12');
  }
  return <Modal title={isLoan ? 'Novo empréstimo' : 'Novo financiamento'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? 'Salvando…' : 'Criar previsões'}</Button></>}><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Select label="Tipo" value={assetType} onChange={(value) => changeAssetType(value as FinancingAssetType)} options={FINANCING_ASSET_TYPES.map((value) => ({ value, label: ASSET_LABELS[value] }))} />
    <Input label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={descriptionPlaceholder[assetType]} />
    {isLoan && <CurrencyInput label="Valor emprestado" valueCents={principal} onChangeCents={setPrincipal} hint="Fica registrado para consulta. Não altera o saldo de nenhuma conta." />}
    {isLoan
      ? <Input label="Quantidade de parcelas" type="number" min={1} max={LOAN_MAX_TERM_MONTHS} step={1} value={term} onChange={(event) => setTerm(event.target.value)} />
      : <Select label="Prazo" value={term} onChange={setTerm} options={terms.map((value) => ({ value: String(value), label: `${value} meses` }))} />}
    <CurrencyInput label={isLoan ? 'Valor da parcela' : 'Valor previsto da parcela'} valueCents={amount} onChangeCents={setAmount} />
    {isLoan && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}><Input label="Taxa de juros (%)" inputMode="decimal" value={rateText} onChange={(event) => setRateText(event.target.value)} placeholder="1,99" /></div>
      <div style={{ minWidth: 130 }}><Select label="Período da taxa" value={ratePeriod} onChange={(value) => setRatePeriod(value as LoanInterestRatePeriod)} options={RATE_PERIOD_OPTIONS} /></div>
    </div>}
    <Input label="Vencimento da primeira parcela" type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} />
    {isLoan && <LoanSummaryHint principalAmountCents={principal} installmentAmountCents={amount} termMonths={Number(term)} firstDueDate={firstDueDate} />}
    {currentMonthInstallment !== null && <p className="field-hint">Há uma parcela com vencimento em até sete dias da data de cadastro ({financingDueDate(firstDueDate, currentMonthInstallment)}). Você confirmará se ela já foi paga.</p>}
    <Select label="Conta padrão para pagamento" value={resourceId} onChange={setResourceId} options={resources.filter((item) => item.type === 'MONEY_ACCOUNT' || item.type === 'CASH').map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione uma conta" />
    <Select label="Responsável" value={personId} onChange={setPersonId} options={members.map((item) => ({ value: item.id, label: item.displayName }))} />
    <p className="field-hint">As parcelas serão previsões. Nenhuma saída será lançada até você confirmar o pagamento.</p>{error && <span className="field-error">{error}</span>}
  </div>{confirmingCurrentInstallment && currentMonthInstallment !== null && <Modal title="Parcela deste mês" onClose={() => setConfirmingCurrentInstallment(false)} footer={<><Button variant="secondary" onClick={() => { setConfirmingCurrentInstallment(false); void createPlan(false); }}>Não, ainda não paguei</Button><Button onClick={() => { setConfirmingCurrentInstallment(false); void createPlan(true); }}>Sim, já paguei</Button></>}><p>A parcela {currentMonthInstallment}, com vencimento em {financingDueDate(firstDueDate, currentMonthInstallment)}, já foi paga?</p><p style={{ marginBottom: 0, color: 'var(--color-ink-muted)', fontSize: 13 }}>Parcelas anteriores à data de cadastro serão consideradas pagas automaticamente, sem lançar saídas novamente.</p></Modal>}</Modal>;
}

function EditPlanModal({ session, plan, onClose, onSaved }: { session: AppSession; plan: FinancingPlanDto; onClose: () => void; onSaved: () => void }) {
  const { show } = useToast();
  const [assetType, setAssetType] = React.useState<FinancingAssetType>(plan.assetType);
  const [description, setDescription] = React.useState(plan.description);
  const [amount, setAmount] = React.useState<number | null>(plan.installmentAmountCents);
  // Empréstimo não vira financiamento nem o contrário (ADR D-036): o tipo fica fixo.
  const isLoan = plan.assetType === LOAN_FINANCING_TYPE;
  const [principal, setPrincipal] = React.useState<number | null>(plan.loan?.principalAmountCents ?? null);
  const [rateText, setRateText] = React.useState(plan.loan ? formatBpsAsPercent(plan.loan.interestRateBps).replace('%', '') : '');
  const [ratePeriod, setRatePeriod] = React.useState<LoanInterestRatePeriod>(plan.loan?.interestRatePeriod ?? 'MONTH');
  const rateBps = parsePercentToBps(rateText);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  async function save() {
    if (!description.trim() || !amount) return setError('Informe uma descrição e um valor de parcela maior que zero.');
    if (isLoan && !principal) return setError('Informe o valor emprestado.');
    if (isLoan && rateBps === null) return setError('Informe a taxa de juros no formato 1,99 (use 0 se não houver juros).');
    setSaving(true); setError(null);
    try {
      await api().financings.update({
        nucleusId: session.nucleusId, planId: plan.id, assetType, description: description.trim(), installmentAmountCents: amount,
        ...(isLoan && principal && rateBps !== null ? { loan: { principalAmountCents: principal, interestRateBps: rateBps, interestRatePeriod: ratePeriod } } : {}),
      });
      show(`${isLoan ? 'Empréstimo' : 'Financiamento'} atualizado. As parcelas pagas e seus lançamentos foram preservados.`); onSaved(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o plano.'); }
    finally { setSaving(false); }
  }
  return <Modal title={isLoan ? 'Editar empréstimo' : 'Editar financiamento'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button></>}><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {!isLoan && <Select label="Tipo" value={assetType} onChange={(value) => setAssetType(value as FinancingAssetType)} options={NON_LOAN_TYPES.map((value) => ({ value, label: ASSET_LABELS[value] }))} />}
    <Input label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} />
    {isLoan && <CurrencyInput label="Valor emprestado" valueCents={principal} onChangeCents={setPrincipal} hint="Fica registrado para consulta. Não altera o saldo de nenhuma conta." />}
    <CurrencyInput label="Valor previsto das parcelas futuras" valueCents={amount} onChangeCents={setAmount} hint="Os valores das parcelas já pagas não serão alterados." />
    {isLoan && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}><Input label="Taxa de juros (%)" inputMode="decimal" value={rateText} onChange={(event) => setRateText(event.target.value)} placeholder="1,99" /></div>
      <div style={{ minWidth: 130 }}><Select label="Período da taxa" value={ratePeriod} onChange={(value) => setRatePeriod(value as LoanInterestRatePeriod)} options={RATE_PERIOD_OPTIONS} /></div>
    </div>}
    {error && <span className="field-error">{error}</span>}
  </div></Modal>;
}

function PayInstallmentModal({ session, plan, installment, resources, onClose, onPaid }: { session: AppSession; plan: FinancingPlanDto; installment: FinancingPlanDto['installments'][number]; resources: ReturnType<typeof useNucleusData>['resources']; onClose: () => void; onPaid: () => void }) {
  const { show } = useToast();
  const payResources = resources.filter((item) => item.type === 'MONEY_ACCOUNT' || item.type === 'CASH');
  const [resourceId, setResourceId] = React.useState(installment.paymentResourceId);
  // Valor fixo no valor da parcela: a baixa quita a parcela pelo valor cheio. O campo era
  // editavel e sugeria que qualquer valor era aceito — mas o sistema marcava a parcela como
  // PAID de qualquer forma, entao digitar um valor menor quitava a divida inteira.
  const amount = installment.amountCents;
  const [date, setDate] = React.useState(todayIsoDate());
  const [method, setMethod] = React.useState<'DEBIT' | 'PIX'>('DEBIT');
  const [approved, setApproved] = React.useState(false);
  const [balances, setBalances] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { let active = true; void api().dashboard.getSummary({ nucleusId: session.nucleusId, periodDateFrom: '2000-01-01', periodDateTo: todayIsoDate(), recentMovementsLimit: 0 }).then((summary) => { if (active) setBalances(Object.fromEntries(summary.resources.map((item) => [item.resource.id, item.balanceCents]))); }); return () => { active = false; }; }, [session.nucleusId]);
  const balance = balances[resourceId];
  const insufficient = balance !== undefined && amount !== null && amount > balance;
  async function submit() {
    if (!approved) return setError('Confirme que deseja baixar esta parcela e atualizar o saldo.');
    if (!amount || !resourceId) return setError('Confira o valor e a conta.');
    if (balance === undefined) return setError('Aguarde a conferência do saldo da conta.');
    if (amount > balance) return setError('A conta não tem saldo suficiente.');
    setSaving(true); setError(null);
    try { await api().financings.payInstallment({ nucleusId: session.nucleusId, installmentId: installment.id, paymentResourceId: resourceId, paymentMethod: method, paidAmountCents: amount, paidAt: date }); show('Parcela baixada e saída registrada.'); onPaid(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível baixar a parcela.'); }
    finally { setSaving(false); }
  }
  return <Modal title={`Confirmar parcela ${installment.installmentNumber}/${plan.termMonths}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={saving || insufficient || !approved || balance === undefined}>{saving ? 'Salvando…' : 'Confirmar pagamento'}</Button></>}><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <p style={{ margin: 0 }}>{plan.description} · vencimento {installment.dueDate}</p>
    <Select label="Conta de saída" value={resourceId} onChange={setResourceId} options={payResources.map((item) => ({ value: item.id, label: item.name }))} />
    <p className="field-hint">Valor da parcela: {formatCentsToBRL(amount)} · Saldo disponível: {balance === undefined ? 'consultando…' : formatCentsToBRL(balance)}</p>
    {insufficient && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>Saldo insuficiente nesta conta. Escolha outra conta para baixar a parcela.</p>}
    <Select label="Forma de pagamento" value={method} onChange={(value) => setMethod(value as 'DEBIT' | 'PIX')} options={[{ value: 'DEBIT', label: 'Cartão de débito' }, { value: 'PIX', label: 'PIX' }]} />
    <Input label="Data do pagamento" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />Confirmo que o pagamento foi realizado e autorizo atualizar o saldo.</label>
    {error && <span className="field-error">{error}</span>}
  </div></Modal>;
}

export function FinancingsScreen({ session, refreshToken, onChanged }: { session: AppSession; refreshToken: number; onChanged: () => void }) {
  const { resources, members } = useNucleusData(session.nucleusId, refreshToken);
  const [plans, setPlans] = React.useState<FinancingPlanDto[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<{ plan: FinancingPlanDto; installment: FinancingPlanDto['installments'][number] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cancelTarget, setCancelTarget] = React.useState<FinancingPlanDto | null>(null);
  const [editTarget, setEditTarget] = React.useState<FinancingPlanDto | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FinancingPlanDto | null>(null);
  const { show } = useToast();
  const reload = React.useCallback(async () => { setLoading(true); try { setPlans(await api().financings.list(session.nucleusId)); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os financiamentos.'); } finally { setLoading(false); } }, [session.nucleusId]);
  React.useEffect(() => { void reload(); }, [reload, refreshToken]);
  async function cancel() { if (!cancelTarget) return; await api().financings.cancel({ nucleusId: session.nucleusId, planId: cancelTarget.id }); show('Previsões futuras canceladas.'); setCancelTarget(null); await reload(); onChanged(); }
  async function deletePlan() { if (!deleteTarget) return; try { await api().financings.delete({ nucleusId: session.nucleusId, planId: deleteTarget.id }); show('Financiamento excluído. Os lançamentos de pagamento permanecem no histórico.'); setDeleteTarget(null); await reload(); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir o financiamento.'); } }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><h2 style={{ margin: 0, fontSize: 22 }}>Financiamentos e empréstimos</h2><p style={{ margin: '4px 0 0', color: 'var(--color-ink-muted)' }}>Acompanhe as parcelas previstas e confirme cada pagamento.</p></div><Button onClick={() => setCreating(true)}>Novo financiamento ou empréstimo</Button></div>
    {loading ? <p>Carregando previsões…</p> : plans.length === 0 ? <p>Nenhum financiamento cadastrado.</p> : plans.map((plan) => { const paid = plan.installments.filter((item) => item.status === 'PAID').length; const next = plan.installments.find((item) => item.status === 'PENDING'); return <section key={plan.id} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><h3 style={{ margin: '0 0 6px' }}>{plan.description}</h3><p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>{ASSET_LABELS[plan.assetType]} · {plan.termMonths} {plan.loan ? 'parcelas' : 'meses'} · {formatCentsToBRL(plan.installmentAmountCents)} por parcela · {paid}/{plan.termMonths} pagas</p>{plan.loan && <p style={{ margin: '4px 0 0', color: 'var(--color-ink-muted)' }}>Emprestado {formatCentsToBRL(plan.loan.principalAmountCents)} · taxa {formatBpsAsPercent(plan.loan.interestRateBps)} {RATE_PERIOD_SHORT[plan.loan.interestRatePeriod]} · última parcela em {financingDueDate(plan.firstDueDate, plan.termMonths)}</p>}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => setEditTarget(plan)}>Editar</Button>{plan.status === 'ACTIVE' && <Button variant="ghost" onClick={() => setCancelTarget(plan)}>Cancelar previsões</Button>}{paid === 0 && plan.status !== 'COMPLETED' && <Button variant="ghost" onClick={() => setDeleteTarget(plan)}>Excluir</Button>}</div></div>
      {plan.status === 'ACTIVE' && next && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: 12, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}><span>Próxima: parcela {next.installmentNumber}/{plan.termMonths} · vence {next.dueDate} · {formatCentsToBRL(next.amountCents)}</span><Button onClick={() => setPayTarget({ plan, installment: next })}>Confirmar pagamento</Button></div>}
      <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer' }}>Ver parcelas</summary><div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>{plan.installments.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}><span>{item.installmentNumber}. {item.dueDate} · {item.status === 'PAID' ? 'paga' : 'prevista'}</span><span>{formatCentsToBRL(item.paidAmountCents ?? item.amountCents)}</span></div>)}</div></details>
    </section>; })}
    {error && <p role="alert" className="field-error">{error}</p>}
    {creating && <CreatePlanModal session={session} resources={resources} members={members} onClose={() => setCreating(false)} onCreated={() => { void reload(); onChanged(); }} />}
    {editTarget && <EditPlanModal session={session} plan={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { void reload(); onChanged(); }} />}
    {payTarget && <PayInstallmentModal session={session} plan={payTarget.plan} installment={payTarget.installment} resources={resources} onClose={() => setPayTarget(null)} onPaid={() => { void reload(); onChanged(); }} />}
    {cancelTarget && <Modal title="Cancelar previsões?" onClose={() => setCancelTarget(null)} footer={<><Button variant="secondary" onClick={() => setCancelTarget(null)}>Voltar</Button><Button variant="danger" onClick={() => void cancel()}>Cancelar previsões futuras</Button></>}><p>As parcelas já pagas ficam no histórico. As parcelas futuras deixam de aparecer como pendentes.</p></Modal>}
    {deleteTarget && <Modal title="Excluir financiamento?" onClose={() => setDeleteTarget(null)} footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Manter financiamento</Button><Button variant="danger" onClick={() => void deletePlan()}>Excluir financiamento</Button></>}><p>As previsões serão encerradas e o financiamento sairá da lista. O registro permanece no histórico para auditoria.</p><p>Se alguma parcela já foi paga, use <strong>Cancelar previsões</strong>: assim as saídas já registradas continuam explicadas no histórico.</p><p><strong>{deleteTarget.description}</strong> · {ASSET_LABELS[deleteTarget.assetType]}</p></Modal>}
  </div>;
}
