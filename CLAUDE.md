# CLAUDE.md — Fluxo

Controle financeiro pessoal, **local-first** e privado por padrão. App desktop Electron (TypeScript strict, React, Vite, SQLite via better-sqlite3 + Kysely, Zod, Vitest). Usado por um casal com **dados financeiros reais**.

## Onde estamos (leia antes de qualquer tarefa)

- Fase atual: **etapa A** do plano `docs/product/plano-validacao-30-dias.md`. Leia esse documento inteiro; ele tem as decisões, o escopo e o porquê de cada uma.
- O relógio de validação de 30 dias começa em **05/11/2026** (plano B: 05/12/2026). A partir dele vale o **congelamento: só correção de bug**.
- **Antes do relógio, o escopo é só a etapa A.** Os projetos B (parcelas no cartão) e C (botão de pagar fatura) têm desenho fechado no plano, mas **não implemente nenhum dos dois sem pedido explícito do dono**.
- O roadmap antigo (`docs/product/roadmap.md`) lista muita coisa (PJ/MEI, Open Finance, IA, nota fiscal). Está **congelado**; não puxe itens dele.

## Regras que nunca se quebram

1. **Nunca abra o app contra uma pasta de dados real.** O app roda migrations sozinho na abertura. Proibido apontar execução para `%APPDATA%\fluxo`, `%APPDATA%\Fluxo` ou `%APPDATA%\fluxo-v2`. Testes são seguros (banco em memória). Para rodar o app em desenvolvimento, só com `FLUXO_DATA_DIR` apontando para uma pasta descartável dentro do projeto e ignorada pelo git (disponível depois da tarefa A1; antes dela, **não rode o app**).
2. **Nunca leia, copie, versione, imprima ou cole** arquivos `*.db`, `*.db-wal`, `*.db-shm`, exportações CSV/JSON reais ou qualquer valor financeiro real. Nunca peça ao dono para colar dados reais na conversa. Fixtures e testes usam dados fabricados.
3. **Falhar fechado.** Toda validação de segurança ou contabilidade recusa quando o dado necessário não está disponível; nunca pula a verificação.
4. **Invariantes do domínio:** dinheiro em **centavos inteiros** (D-004); histórico confirmado **nunca é apagado**, só cancelado ou estornado; saldo é **derivado** de movimentos confirmados; saldo inicial é gravado uma vez e **imutável** (D-029); verificações contábeis ficam na fronteira de persistência (D-030).
5. **Schema só muda por migration nova**, numerada em sequência depois da última de `src/infrastructure/db/migrations/` (confira o `index.ts`). Nunca edite migration já aplicada.
6. **Toda decisão que muda comportamento ganha um ADR** em `docs/adr/` (próximo número livre), no formato do `template.md`: o defeito ou a necessidade, a evidência, as alternativas descartadas. Não escreva ADR como justificativa retroativa.
7. **Bug ⇒ teste de regressão que falha antes da correção.** Não escreva teste que sancione o comportamento errado. Não use `toHaveLength(N)` com número fixo quando existe uma constante.
8. **Antes de pedir revisão, estes três passam:** `npm test`, `npm run typecheck`, `npm run lint`. Se algo falhar por motivo alheio à tarefa, **reporte**; não desative teste, não afrouxe regra do lint, não use `--no-verify`.

## Como trabalhar

- **Plano antes de código.** Para qualquer tarefa com mais de um arquivo, apresente o plano (arquivos a mexer, testes a escrever, riscos) e **espere aprovação** antes de editar.
- **Uma tarefa por branch** (`etapa-a/<nome-curto>`), **uma por PR**. Commits no padrão do histórico (`fix(...)`, `feat(...)`, `docs:`), em português, explicando o porquê. **Sem push direto na `main`, sem force-push, sem merge sem aprovação do dono.**
- **Mudanças pequenas e revisáveis.** Se a tarefa crescer, pare e proponha dividir.
- **Dúvida sobre dado ou regra financeira: pergunte.** Não adivinhe.
- **Verifique, não suponha.** Antes de afirmar que algo existe ou funciona, leia o código ou rode o teste. Ao final, relate o que foi **verificado** e o que **não foi**.

## Comandos (confirmados no `package.json`)

- `npm test` — suíte completa (Vitest rodando sob Electron como Node; usa banco em memória)
- `npm run test:node` — alternativa com Node puro; módulos nativos podem exigir `npm run rebuild:node`
- `npm run typecheck` — TypeScript do app e do Electron
- `npm run lint` — ESLint
- `npm run build` — build do Vite e do Electron
- `npm run dev` — **proibido** sem `FLUXO_DATA_DIR` apontando para pasta descartável (regra 1)
- Se o módulo nativo do SQLite falhar entre os dois modos, use `npm run rebuild:electron` ou `npm run rebuild:node` conforme o caso. Versões exigidas de Node e npm: veja `engines` e `.nvmrc`.

## Mapa do código

- `src/domain/` — regras puras, **sem I/O** (entidades, `Money`, invariantes, `CreditInvoiceCycle`, `BalanceCalculator`)
- `src/application/` — casos de uso e portas (`ports/`), transacionais via `UnitOfWork`
- `src/infrastructure/` — banco (`db/`, migrations, `integrityScan`), repositórios Kysely, exportação
- `src/shared/` — contrato IPC (`ipc-contract.ts`) e parser de dinheiro
- `electron/` — processo principal, IPC (`handlerFactory`: autorização por núcleo, falha fechado), preload
- `renderer/` — interface React (`features/`, `design-system/`)
- `tests/` — espelha a estrutura acima
- `docs/` — ADRs, arquitetura, segurança, QA, produto

## Glossário mínimo

- **Núcleo** (`FinancialNucleus`): o "livro" financeiro; pessoas entram por `Membership`.
- **Recurso** (`Resource`): conta, dinheiro físico, benefício (VR/VA), aplicação ou cartão de crédito. Cada um tem uma **natureza** (dinheiro, benefício, aplicação, passivo) que nunca se mistura em totais.
- **Movimento / partida** (`Movement` / `MovementLeg`): lançamento e seus efeitos sobre recursos.
- **Fatura:** identificada pelo **vencimento** (`invoiceDueDate`). Compra no **dia do fechamento** entra na fatura que fecha naquele dia; compra do dia **seguinte** vai para a próxima.
- **Responsável** (`responsiblePersonId`): quem gastou; diferente de quem lançou (`createdByPersonId`).

## Dados de referência do uso real (sem valores)

Quatro cartões de crédito: três fecham no dia **1** e um no dia **4**. Dois usuários no mesmo PC e no mesmo usuário do Windows durante o período de teste.

## Em caso de conflito

Esta ordem vale: pedido explícito e atual do dono do projeto > `docs/product/plano-validacao-30-dias.md` > este arquivo > ADRs > roadmap. Se um pedido contrariar as regras da seção "Regras que nunca se quebram", **pare e avise** antes de agir.
