import React from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function Select({ label, value, onChange, options, placeholder, error, disabled }: SelectProps) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select
        className={['select', error ? 'input-error' : ''].filter(Boolean).join(' ')}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
