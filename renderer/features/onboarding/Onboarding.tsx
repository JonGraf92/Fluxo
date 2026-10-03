import React from 'react';
import { Button } from '../../design-system/Button';
import { CurrencyInput } from '../../design-system/CurrencyInput';
import { Input } from '../../design-system/Input';
import { api } from '../../services/api';
import type { AppSession } from '../../app/App';

type Step = 'welcome' | 'profile' | 'nucleus' | 'resource' | 'balance';

const STEPS: Step[] = ['welcome', 'profile', 'nucleus', 'resource', 'balance'];

export function Onboarding({ onComplete }: { onComplete: (session: AppSession) => void }) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const step = STEPS[stepIndex];

  const [displayName, setDisplayName] = React.useState('');
  const [nucleusName, setNucleusName] = React.useState('Minhas finanças');
  const [resourceName, setResourceName] = React.useState('Conta principal');
  const [initialBalanceCents, setInitialBalanceCents] = React.useState<number | null>(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function goNext() {
    setError(null);
    if (step === 'profile' && !displayName.trim()) {
      setError('Informe seu nome para continuar.');
      return;
    }
    if (step === 'nucleus' && !nucleusName.trim()) {
      setError('Dê um nome ao seu núcleo financeiro.');
      return;
    }
    if (step === 'resource' && !resourceName.trim()) {
      setError('Dê um nome ao seu primeiro recurso.');
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    if (initialBalanceCents === null) {
      setError('Informe o saldo inicial (pode ser zero).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api().onboarding.complete({
        personDisplayName: displayName.trim(),
        nucleusName: nucleusName.trim(),
        firstResourceName: resourceName.trim(),
        firstResourceInitialBalanceCents: initialBalanceCents,
      });
      onComplete({ personId: result.personId, nucleusId: result.nucleusId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, padding: 'var(--space-6)' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 style={{ fontSize: 28 }}>Fluxo</h1>
          <p style={{ color: 'var(--color-ink-muted)', margin: '4px 0 0' }}>Seu dinheiro. Em movimento.</p>
        </div>

        {step === 'welcome' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Bem-vindo(a)</h2>
            <p style={{ color: 'var(--color-ink-muted)' }}>
              O Fluxo guarda seus dados só neste dispositivo. Nada é enviado para a internet. Vamos configurar o
              essencial — leva menos de um minuto.
            </p>
          </div>
        )}

        {step === 'profile' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Como podemos te chamar?</h2>
            <Input
              label="Seu nome"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex.: Ana"
              autoFocus
            />
          </div>
        )}

        {step === 'nucleus' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Como se chama seu núcleo financeiro?</h2>
            <Input
              label="Nome do núcleo"
              value={nucleusName}
              onChange={(e) => setNucleusName(e.target.value)}
              hint="Pode ser algo simples como “Minhas finanças”. Dá para mudar depois."
              autoFocus
            />
          </div>
        )}

        {step === 'resource' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Qual o seu primeiro recurso?</h2>
            <Input
              label="Nome do recurso"
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              hint="Ex.: “Conta principal”, “Carteira”. Você poderá adicionar outros depois."
              autoFocus
            />
          </div>
        )}

        {step === 'balance' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Qual o saldo atual desse recurso?</h2>
            <CurrencyInput
              label="Saldo inicial"
              valueCents={initialBalanceCents}
              onChangeCents={setInitialBalanceCents}
              hint="Essa é a posição inicial no Fluxo — depois de criado, ela não muda mais; qualquer correção futura vira um ajuste auditado."
            />
          </div>
        )}

        {error ? (
          <p className="field-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
          {stepIndex > 0 && (
            <Button variant="secondary" onClick={goBack} disabled={submitting}>
              Voltar
            </Button>
          )}
          {step !== 'balance' ? (
            <Button onClick={goNext} block>
              Continuar
            </Button>
          ) : (
            <Button onClick={finish} disabled={submitting} block>
              {submitting ? 'Entrando…' : 'Entrar no Fluxo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
