# Restauração de backup do Fluxo

> **Para quem:** o dono do projeto, num dia em que algo deu errado.
> **Decisão de origem:** ADR D-035 (backup automático) e etapa A, tarefa A5.
> **Teste que segue estes passos:** `tests/infrastructure/backup-restore.test.ts`.
> **Prazo do ensaio:** fazer a seção 3 uma vez **antes de 04/11/2026**.

---

## 1. O que você precisa saber antes

- Cada cópia é um arquivo único chamado `fluxo-backup-AAAAMMDD-HHMMSS.db` (data e hora
  locais da cópia). Ela já foi conferida pelo Fluxo na hora em que foi gravada.
- A pasta das cópias aparece em **Configurações → Backup automático → Pasta**.
- A pasta de dados da v2 é `%APPDATA%\fluxo-v2`. O banco em uso é o `fluxo.db` dali.
- **Restaurar volta no tempo.** Tudo o que foi lançado depois da cópia escolhida não
  volta; é preciso lançar de novo.
- **Nunca** mexa em `%APPDATA%\fluxo` (sem o `-v2`): é a pasta da versão antiga.
- Nenhum passo abaixo apaga nada. O banco atual é guardado, não removido.

## 2. Restauração de verdade

1. **Feche o Fluxo** e confira que ele não está mais na barra de tarefas.
2. Abra a pasta de backup e escolha a cópia: normalmente a mais nova; se o problema já
   estava nela, a anterior.
3. Abra `%APPDATA%\fluxo-v2` (cole esse caminho na barra de endereço do Explorador).
4. Crie ali uma pasta chamada `antes-da-restauracao-AAAA-MM-DD` e **mova** para dentro
   dela, juntos, os arquivos que existirem:
   - `fluxo.db`
   - `fluxo.db-wal`
   - `fluxo.db-shm`

   Os três têm de sair juntos. Um `-wal` antigo ao lado do banco restaurado estraga a
   restauração.
5. **Copie** (não mova) a cópia escolhida para `%APPDATA%\fluxo-v2` e renomeie para
   `fluxo.db`.
6. Abra o Fluxo.
7. Confira:
   - os saldos de cada conta, cartão e benefício contra o que você espera para a data da
     cópia;
   - o último lançamento da lista de Movimentações;
   - em Configurações, as duas pessoas do núcleo e a pasta de backup.
8. Lance de novo o que foi feito depois da data da cópia.
9. Só apague a pasta `antes-da-restauracao-…` depois de alguns dias de uso normal.

**Se o Fluxo não abrir depois do passo 6:** feche, apague o `fluxo.db` que você acabou de
copiar (e `-wal`/`-shm`, se aparecerem), repita os passos 5 e 6 com a cópia anterior. Se
nenhuma abrir, devolva os arquivos da pasta `antes-da-restauracao-…` e pare: o banco
original continua intacto.

**Computador novo ou Windows reinstalado:** instale o Fluxo, abra uma vez e feche (isso
cria `%APPDATA%\fluxo-v2`), siga os passos 3 a 7 e escolha de novo a pasta de backup em
Configurações. A escolha da pasta não faz parte da cópia.

## 3. Ensaio, sem tocar nos dados de verdade

Faça uma vez antes do dia zero. O ensaio usa uma pasta de dados separada, apontada pela
variável `FLUXO_DATA_DIR` (ADR D-034), então o banco de verdade não entra na história.

1. Feche o Fluxo.
2. Crie uma pasta vazia, por exemplo `C:\Users\<você>\Desktop\ensaio-restauracao`.
3. Copie a cópia de backup mais nova para essa pasta e renomeie para `fluxo.db`.
4. Abra o PowerShell e rode, trocando o caminho do executável pelo do seu Fluxo instalado:

   ```powershell
   $env:FLUXO_DATA_DIR = "$env:USERPROFILE\Desktop\ensaio-restauracao"
   & "$env:LOCALAPPDATA\Programs\Fluxo\Fluxo.exe"
   ```

5. Confira os mesmos itens do passo 7 da seção 2. O Fluxo aberto assim mostra os dados da
   cópia, não os atuais.
6. Feche o Fluxo, feche esse PowerShell e apague a pasta `ensaio-restauracao`.

Enquanto o Fluxo estiver aberto pelo passo 4, ele grava na pasta de ensaio, inclusive os
backups automáticos dele (em `ensaio-restauracao\backups`). Nada vai para a pasta de dados
nem para a pasta de backup de verdade.

## 4. O que este procedimento não cobre

- **Cópia não cifrada:** quem acessa a pasta de backup lê os dados.
- **Perda da pasta de backup junto com o computador:** só há proteção se a pasta estiver
  fora dele (Google Drive para computador, HD externo).
- **Lançamentos posteriores à cópia:** não são recuperados.
- **Exportação CSV/JSON:** continua sendo a segunda proteção, em formato legível; não é
  restaurável por este procedimento.
