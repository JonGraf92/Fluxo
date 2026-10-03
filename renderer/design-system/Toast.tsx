import React from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'default' | 'error';
}

interface ToastContextValue {
  show: (text: string, tone?: 'default' | 'error') => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const show = React.useCallback((text: string, tone: 'default' | 'error' = 'default') => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack">
        {messages.map((m) => (
          <div key={m.id} className={['toast', m.tone === 'error' ? 'toast-error' : ''].join(' ')}>
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  return ctx;
}
