# D-041 — Instalador da v2 com identidade própria, ao lado do Fluxo antigo

**Status:** Aceita · **Relacionada:** D-034

## Contexto
O D-034 isolou os **dados** da v2, mas deixou registrado que o instalador continuava com a
mesma identidade do aplicativo antigo (`appId: com.fluxo.app`, pasta de instalação
`fluxo`). Em 13/11/2026 o Fluxo 1.0.0 antigo estava instalado na máquina do dono
(`%LOCALAPPDATA%\Programs\fluxo`, entrada "Fluxo 1.0.0" no desinstalador).

A decisão PV-02 do plano de validação manda que os dados antigos fiquem "arquivados no app
desktop antigo, só para consulta". Com a mesma identidade, instalar a v2 **substituiria** o
programa antigo, e a v2 se recusa a abrir a pasta de dados dele: a consulta ficaria
impossível sem reinstalar a versão antiga por cima da nova.

## Decisão
- `appId` passa a `com.fluxo.app.v2`: entrada própria no desinstalador e na barra de tarefas.
- O nome do pacote empacotado passa a `fluxo-v2` (`extraMetadata.name`), o que muda a pasta
  de instalação para `%LOCALAPPDATA%\Programs\fluxo-v2`. O `package.json` do repositório
  não muda.
- `productName` continua `Fluxo`: é o nome do produto, do executável e dos atalhos.

## Consequências
- As duas versões ficam instaladas lado a lado. Desinstalar uma não afeta a outra.
- Os atalhos "Fluxo" da área de trabalho e do menu Iniciar passam a apontar para a v2. O
  programa antigo continua em `Programs\fluxo` e precisa de um atalho com outro nome para
  ser aberto ("Fluxo antigo (consulta)").
- Uma v2 instalada antes desta mudança não seria atualizada por este instalador. Não havia
  nenhuma: a v2 nunca tinha sido instalada.
- O instalador não é assinado e usa o ícone padrão do Electron.
- Atualização automática não existe: versão nova se instala rodando o instalador novo, que
  atualiza a v2 no lugar e preserva `%APPDATA%\fluxo-v2`.

## Alternativas consideradas
- Manter a identidade e substituir o app antigo — rejeitado: contraria a PV-02.
- Mudar o `productName` para "Fluxo 2" — rejeitado: o produto se chama Fluxo; o número é
  detalhe de instalação.
- Não gerar instalador e rodar a pasta `win-unpacked` — rejeitado: sem atalhos, sem
  desinstalador e preso à pasta do repositório.
