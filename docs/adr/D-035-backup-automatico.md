# D-035 — Backup automático pela API do SQLite, conferido antes de valer

**Status:** Aceita

## Contexto
O `fluxo.db` é a única cópia dos dados financeiros do casal (ADR D-001). Até aqui a única
proteção era a exportação manual em CSV/JSON. O plano de validação de 30 dias (seção 8,
etapa A) exige backup automático antes do início do uso real: perda de disco ou corrupção
do arquivo encerraria o teste e apagaria o histórico.

O banco roda em modo WAL (`connection.ts`). Com o app aberto, parte dos dados confirmados
está em `fluxo.db-wal`; copiar só o `fluxo.db`, ou os três arquivos em momentos
diferentes, pode gerar uma cópia inconsistente sem nenhum erro aparente. E um backup que
nunca foi aberto não é evidência de nada: só se descobre que não serve na hora de restaurar.

## Decisão
- A cópia é feita pela API de backup do SQLite (`Database.backup` do `better-sqlite3`), a
  partir da conexão aberta, para um arquivo `fluxo-backup-AAAAMMDD-HHMMSS.db`.
- A cópia é gravada com sufixo `.partial`, **conferida** e só então renomeada. A conferência
  abre a cópia, roda `PRAGMA integrity_check` e `PRAGMA foreign_key_check`, exige a tabela
  `movements` e tira a cópia do modo WAL (arquivo único, sem `-wal`/`-shm` ao lado). Cópia
  reprovada é apagada e a operação falha com `BackupError` e código.
- Quando copiar (`BackupManager`):
  - **ao fechar o app**, antes de `closeDatabase`, se houve gravação desde a última cópia
    da sessão (`total_changes()`) ou se o destino ainda não tem cópia;
  - **com o app aberto**, na abertura e a cada hora: se não há cópia ou se a mais nova tem
    mais de 24 horas;
  - **a pedido**, pelo botão em Configurações.
- Ficam as **14** cópias mais novas (`BACKUP_RETENTION`). A limpeza só roda depois de a
  cópia nova existir e ter sido conferida, e só apaga arquivos com o nome de backup.
- **Destino configurável.** O usuário escolhe a pasta no diálogo nativo, no processo
  principal; o renderer nunca envia caminho (mesmo princípio do ADR D-033). A escolha fica
  em `backup-settings.json`, no diretório de dados. Sem escolha, o destino é
  `<diretório de dados>/backups`, e a tela avisa que esse padrão fica no mesmo disco.
- O destino não pode ser a pasta de dados da versão antiga nem ficar dentro dela (ADR D-034).
- **Falha visível.** Falha ao fechar mostra `dialog.showErrorBox` antes de o app sair;
  falha com o app aberto mostra diálogo de erro; em ambos os casos o erro fica no estado
  exibido em Configurações até um backup dar certo. Configuração de destino ilegível é
  erro (`BACKUP_SETTINGS_INVALID`), não "use o padrão".

## Consequências
- Fechar o app passa a levar o tempo de uma cópia e de uma verificação de integridade
  quando houve gravação. Com o volume previsto (um casal, um mês) isso é imperceptível;
  não foi medido com banco grande.
- Fechar várias vezes sem lançar nada não gera cópias repetidas, então as 14 cópias cobrem
  pelo menos 14 sessões com alteração, e não 14 aberturas.
- A cópia inicial na abertura protege o caso em que a sessão anterior terminou sem fechar
  direito (queda de energia, processo morto), quando a cópia mais nova já passou de 24 horas.
- O destino padrão não protege contra perda do disco. Apontar o destino para uma pasta fora
  do computador (Google Drive para computador, HD externo) é passo manual do dono.
- `backup-settings.json` não faz parte do backup: num computador novo é preciso escolher a
  pasta de novo.
- A cópia não é cifrada. Quem lê a pasta de backup lê os dados; a proteção é o controle de
  acesso da pasta (plano de validação, PV-11).
- A restauração é manual e está em `docs/process/restauracao-backup.md`, com teste
  automatizado que segue os mesmos passos (`tests/infrastructure/backup-restore.test.ts`).

## Alternativas consideradas
- Copiar `fluxo.db` (e `-wal`/`-shm`) com `fs.copyFile` — rejeitado: com WAL e o app
  aberto, a cópia pode sair inconsistente sem erro.
- Deixar o `fluxo.db` vivo dentro de uma pasta sincronizada — rejeitado: os arquivos
  auxiliares sincronizam em momentos diferentes e o SQLite pode corromper sem aviso.
- Copiar a cada fechamento, sem olhar se houve gravação — rejeitado: 14 aberturas sem
  lançamento empurrariam para fora todas as cópias com conteúdo diferente.
- Guardar a pasta de destino dentro do banco — rejeitado: restaurar um backup antigo
  trocaria o destino do backup, e exigiria uma migration só para configuração local.
- Obrigar a escolha de pasta antes do primeiro backup — rejeitado: até a escolha, não
  haveria cópia nenhuma. O padrão no mesmo disco, com aviso na tela, ainda protege contra
  corrupção do arquivo e erro de uso.
- Só gravar a cópia, sem conferir — rejeitado: falha fechado (regra 3 do `CLAUDE.md`);
  backup não conferido só revela o defeito na restauração.
