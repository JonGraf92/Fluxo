import React from 'react';
import { Button } from '../../design-system/Button';
import { Input } from '../../design-system/Input';
import { Select } from '../../design-system/Select';
import { useToast } from '../../design-system/Toast';
import { api } from '../../services/api';
import type { AppSession } from '../../app/App';

export function SettingsScreen({ session, theme, onThemeChange }: { session: AppSession; theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const { show } = useToast();
  const [exporting, setExporting] = React.useState<'csv' | 'json' | null>(null);
  const [members, setMembers] = React.useState<{ id: string; displayName: string }[]>([]);
  const [memberName, setMemberName] = React.useState('');
  const [addingMember, setAddingMember] = React.useState(false);

  React.useEffect(() => {
    void api().members.list(session.nucleusId).then(setMembers).catch((err) =>
      show(err instanceof Error ? err.message : 'Não foi possível carregar as pessoas.', 'error'),
    );
  }, [session.nucleusId, show]);

  async function addMember() {
    if (!memberName.trim()) return;
    setAddingMember(true);
    try {
      const member = await api().members.create({ nucleusId: session.nucleusId, displayName: memberName });
      setMembers((current) => [...current, member]);
      setMemberName('');
      show('Pessoa adicionada ao núcleo.');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível adicionar a pessoa.', 'error');
    } finally {
      setAddingMember(false);
    }
  }

  async function runExport(format: 'csv' | 'json') {
    setExporting(format);
    try {
      const destination = await api().export.chooseDestination(session.nucleusId, format);
      if (destination.canceled || !destination.filePath) {
        setExporting(null);
        return;
      }
      const result = await api().export.run({ nucleusId: session.nucleusId, format, destinationPath: destination.filePath });
      show(`Exportado para ${result.filePath}`);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível exportar.', 'error');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 22, marginBottom: 4 }}>Configurações</h2>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>
          Seus dados ficam só neste dispositivo. Nada é enviado para a internet automaticamente.
        </p>
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Aparencia</h3>
        <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>Escolha o tema do Fluxo. A preferencia fica salva neste computador.</p>
        <Select label="Tema" value={theme} onChange={(value) => onThemeChange(value as 'light' | 'dark')} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
      </div>
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-5)',
        }}
      >
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Pessoas do núcleo</h3>
        <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
          Cadastre quem participa das finanças da família neste computador.
        </p>
        <ul>
          {members.map((member) => (
            <li key={member.id}>{member.displayName}{member.id === session.personId ? ' (você)' : ''}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Input label="Nome" value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Ex.: nome da pessoa" />
          <Button onClick={() => void addMember()} disabled={addingMember || !memberName.trim()}>
            {addingMember ? 'Adicionando…' : 'Adicionar pessoa'}
          </Button>
        </div>
      </div>
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-5)',
        }}
      >
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Exportar dados</h3>
        <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
          Gera um arquivo com todos os recursos, categorias e movimentações — inclusive canceladas — suficiente para
          reconstruir seu histórico fora do Fluxo. Trate o arquivo exportado como dado sensível.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => runExport('csv')} disabled={exporting !== null}>
            {exporting === 'csv' ? 'Exportando…' : 'Exportar como CSV'}
          </Button>
          <Button variant="secondary" onClick={() => runExport('json')} disabled={exporting !== null}>
            {exporting === 'json' ? 'Exportando…' : 'Exportar como JSON'}
          </Button>
        </div>
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-5)',
        }}
      >
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Sobre esta versão</h3>
        <p style={{ marginTop: 0, marginBottom: 0, color: 'var(--color-ink-muted)' }}>
          Fluxo V1.0 — local-first, sem integração bancária, sem OCR, sem nuvem. Ver o README do projeto para a lista
          completa de limitações conhecidas e o roadmap.
        </p>
      </div>
    </div>
  );
}
