import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, id, className, ...rest }, ref) => {
    const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
    return (
      <div className="field">
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={['input', error ? 'input-error' : '', className].filter(Boolean).join(' ')}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {error ? (
          <span id={`${inputId}-error`} className="field-error">
            {error}
          </span>
        ) : hint ? (
          <span id={`${inputId}-hint`} className="field-hint">
            {hint}
          </span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
