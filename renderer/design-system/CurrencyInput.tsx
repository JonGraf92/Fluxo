import React from 'react';
import { parseBrazilianCurrencyToCents } from '../../src/shared/money-parsing';
import { formatCentsToBRL } from '../services/money';

interface CurrencyInputProps {
  label: string;
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
  error?: string;
  hint?: string;
  allowNegative?: boolean;
}

/**
 * Campo de valor monetário. Trabalha internamente com string livre (o usuário digita
 * "1250,00") e delega a conversão ao parser canônico compartilhado — nunca reimplementa
 * a lógica de parsing aqui (ver correção de hardening V1.0.1: havia uma implementação
 * inline divergente e ambígua neste componente).
 */
export function CurrencyInput({ label, valueCents, onChangeCents, error, hint, allowNegative }: CurrencyInputProps) {
  const [text, setText] = React.useState(valueCents !== null ? formatCentsToBRL(Math.abs(valueCents)).replace('R$', '').trim() : '');
  const [parseError, setParseError] = React.useState<string | null>(null);

  function handleChange(raw: string) {
    setText(raw);
    if (raw.trim() === '') {
      setParseError(null);
      onChangeCents(null);
      return;
    }
    const cents = parseBrazilianCurrencyToCents(raw);
    if (cents === null) {
      setParseError('Use o formato 1.250,00 (ou apenas 1250,00).');
      onChangeCents(null);
      return;
    }
    if (cents < 0 && !allowNegative) {
      setParseError('Este valor não pode ser negativo.');
      onChangeCents(null);
      return;
    }
    setParseError(null);
    onChangeCents(cents);
  }

  const effectiveError = error ?? parseError ?? undefined;

  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-ink-muted)',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          R$
        </span>
        <input
          className={['input', effectiveError ? 'input-error' : ''].filter(Boolean).join(' ')}
          style={{ paddingLeft: 34, textAlign: 'right' }}
          inputMode="decimal"
          placeholder="0,00"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>
      {effectiveError ? <span className="field-error">{effectiveError}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
