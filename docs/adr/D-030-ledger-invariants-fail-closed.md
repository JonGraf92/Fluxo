# D-030 — Invariantes contábeis verificados na fronteira de persistência, falhando FECHADO

**Status:** Aceita · **Relacionada:** D-009, D-012, D-018, D-019, D-008/D-023

## Contexto

Antes desta decisão, apenas a **transferência** garantia soma zero das partidas
(`TransferPolicy`). Entradas, saídas e ajustes emitiam uma única leg e **nunca eram
conferidos** — o sistema tinha partidas dobradas por acidente em um dos quatro tipos de
movimento.

Criado o invariante global, uma auditoria independente **provou empiricamente** que ele era
contornável, executando a função transcrita:

| Caso | Resultado antes |
|---|---|
| `EXPENSE` com sinal **positivo** em recurso **inexistente** | **PASSava** |
| `TRANSFER` de `BENEFIT` (VR) para `LIABILITY` (cartão) | **PASSava** |
| `TRANSFER` entre `MONEY` e `BENEFIT` | **PASSava** |
| `ADJUSTMENT` negativo em cartão (perdoava a dívida) | **PASSava** |

**Causa raiz:** `resourceNatures` era opcional e o repositório só incluía no mapa os recursos
que existiam. Recurso ausente → natureza `undefined` → o código caía no ramo
*"sem informação de natureza, não há como conferir o sinal"*. **Ausência de dado virava
ausência de validação.**

O mesmo padrão existia em `handlerFactory.ts`: `if (typeof maybeNucleusId === 'string')`.
Um canal cujo schema esquecesse `nucleusId` simplesmente **não era autorizado, em silêncio**.

Não eram dois bugs — era **um defeito de arquitetura em dois lugares**: validação condicional
à presença do campo.

## Decisão

**Diretriz de projeto — FALHAR FECHADO:** toda validação de segurança ou de contabilidade
deve **RECUSAR** quando o dado necessário não estiver disponível, nunca pular a verificação.

Aplicada em dois pontos:

**1. `LedgerInvariants` (domínio), chamado de `KyselyMovementRepository.createWithLegs`** —
único ponto de escrita do ledger:
- `resourceNatures` é **obrigatório e completo**; natureza desconhecida lança
  `LEDGER_UNKNOWN_RESOURCE_NATURE`.
- `TRANSFER` com passivo exige `MONEY` na outra ponta (mata "pagar fatura com VR").
- `TRANSFER` entre ativos exige **mesma natureza** e soma zero.
- `EXPENSE`: dinheiro/benefício debita (negativo); cartão **aumenta o passivo** (positivo).
- `ADJUSTMENT` não pode reduzir dívida de cartão — baixar dívida exige pagamento real.

**2. `buildAuthenticatedHandler` (fronteira IPC):**
- Canal sem `nucleusId` no payload **precisa declarar** `authorize` explícito.
- Sem `nucleusId` e sem `authorize`, a operação é **RECUSADA** (antes: liberada).
- `movement:cancel` declara seu autorizador resolvendo o núcleo real do movimento.

Verificar na fronteira de persistência significa que **nem um caminho novo de código**
consegue gravar lançamento inconsistente por esquecimento.

## Consequências

- A garantia contábil deixa de depender de cada caso de uso lembrar de validar.
- Tornar `resourceNatures` obrigatório fez o **compilador** apontar toda chamada que não o
  fornecia — a exigência é verificada em tempo de compilação.
- Um invariante de varredura (`src/infrastructure/db/integrityScan.ts`) detecta
  inconsistências **já existentes**, para bancos criados antes destas correções.
- Segurança e contabilidade passam a ter o mesmo princípio: o caminho inseguro não pode ser
  o caminho silencioso.

## Alternativas consideradas

- **Tornar `resourceNatures` opcional com valor padrão** — rejeitada: um padrão arbitrário
  (ex.: assumir `MONEY`) faria o invariante aprovar lançamentos errados em silêncio, que é a
  falha que se está corrigindo.
- **Validar apenas nos casos de uso** — rejeitada: foi o modelo anterior. Cada novo caso de
  uso reabriria a brecha.
