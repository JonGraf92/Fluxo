import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  block?: boolean;
}

export function Button({ variant = 'primary', block, className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, block ? 'btn-block' : '', className].filter(Boolean).join(' ');
  return <button className={classes} {...rest} />;
}
