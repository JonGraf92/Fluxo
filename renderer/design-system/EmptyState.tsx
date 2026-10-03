import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      <p style={{ margin: 0, marginBottom: action ? 12 : 0 }}>{description}</p>
      {action}
    </div>
  );
}
