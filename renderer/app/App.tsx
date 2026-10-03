import React from 'react';
import '../design-system/components.css';
import { ToastProvider } from '../design-system/Toast';
import { Onboarding } from '../features/onboarding/Onboarding';
import { Dashboard } from '../features/dashboard/Dashboard';
import { MovementsScreen } from '../features/movements/MovementsScreen';
import { ResourcesScreen } from '../features/resources/ResourcesScreen';
import { CategoriesScreen } from '../features/categories/CategoriesScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { FinancingsScreen } from '../features/financing/FinancingsScreen';
import { api } from '../services/api';

export interface AppSession {
  personId: string;
  nucleusId: string;
}

const AppSessionContext = React.createContext<AppSession | null>(null);

export function useAppSession(): AppSession {
  const ctx = React.useContext(AppSessionContext);
  if (!ctx) throw new Error('Sessão do Fluxo ainda não inicializada.');
  return ctx;
}

type Theme = 'light' | 'dark';
type Screen = 'dashboard' | 'movements' | 'resources' | 'financings' | 'categories' | 'settings';

const NAV_ITEMS: { key: Screen; label: string }[] = [
  { key: 'dashboard', label: 'Painel' },
  { key: 'movements', label: 'Movimentações' },
  { key: 'resources', label: 'Recursos' },
  { key: 'financings', label: 'Financiamentos' },
  { key: 'categories', label: 'Categorias' },
  { key: 'settings', label: 'Configurações' },
];

function AppShell({ session, theme, onThemeChange }: { session: AppSession; theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const [screen, setScreen] = React.useState<Screen>('dashboard');
  const [refreshToken, setRefreshToken] = React.useState(0);
  const bumpRefresh = () => setRefreshToken((t) => t + 1);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 'var(--sidebar-width)',
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          padding: 'var(--space-5) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22 }}>Fluxo</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-ink-muted)' }}>Seu dinheiro. Em movimento.</p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setScreen(item.key)}
              style={{
                textAlign: 'left',
                border: 'none',
                background: screen === item.key ? 'var(--color-bg)' : 'transparent',
                color: screen === item.key ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                fontWeight: screen === item.key ? 600 : 500,
                padding: '9px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
        {screen === 'dashboard' && <Dashboard session={session} refreshToken={refreshToken} onChanged={bumpRefresh} />}
        {screen === 'movements' && <MovementsScreen session={session} refreshToken={refreshToken} onChanged={bumpRefresh} />}
        {screen === 'resources' && <ResourcesScreen session={session} refreshToken={refreshToken} onChanged={bumpRefresh} />}
        {screen === 'financings' && <FinancingsScreen session={session} refreshToken={refreshToken} onChanged={bumpRefresh} />}
        {screen === 'categories' && <CategoriesScreen session={session} refreshToken={refreshToken} onChanged={bumpRefresh} />}
        {screen === 'settings' && <SettingsScreen session={session} theme={theme} onThemeChange={onThemeChange} />}
      </main>
    </div>
  );
}

export function App() {
  const [theme, setTheme] = React.useState<Theme>(() => {
    try { return window.localStorage.getItem('fluxo.theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('fluxo.theme', theme); } catch { /* Tema continua ativo ate fechar o app. */ }
  }, [theme]);
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<AppSession | null>(null);
  const [loadError, setLoadError] = React.useState(false);

  const loadState = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (typeof window.fluxo === 'undefined') {
        throw new Error('A API do aplicativo não está disponível nesta janela.');
      }
      const state = await api().app.getState();
      if (state.isOnboarded && state.personId && state.nucleusId) {
        setSession({ personId: state.personId, nucleusId: state.nucleusId });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadState();
  }, [loadState]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-muted)' }}>
        Carregando o Fluxo…
      </div>
    );
  }

  if (loadError) {
    return (
      <main role="alert" style={{ display: 'flex', minHeight: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--color-ink)' }}>
        <h1>O Fluxo não conseguiu carregar</h1>
        <p>Abra o Fluxo pela janela do aplicativo desktop e tente novamente.</p>
        <button type="button" onClick={() => void loadState()}>Tentar novamente</button>
      </main>
    );
  }
  return (
    <ToastProvider>
      {session ? (
        <AppSessionContext.Provider value={session}>
          <AppShell session={session} theme={theme} onThemeChange={setTheme} />
        </AppSessionContext.Provider>
      ) : (
        <Onboarding onComplete={(newSession) => setSession(newSession)} />
      )}
    </ToastProvider>
  );
}
