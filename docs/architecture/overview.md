# Arquitetura do Fluxo — visão geral

> **Nota de veracidade (2026-10).** Este documento se intitulava "v1.1" enquanto o
> `package.json` dizia 1.0.0, e listava 12 tabelas enquanto o migrator já aplicava tabelas
> de fatura, financiamento, liquidez e metadados de pagamento — funcionalidades que estavam
> em código **sem ADR**. As seções "Tabelas" e "Transferência" foram corrigidas para
> refletir o comportamento real.

## Camadas

```
renderer (React)
      │  chama api.ts (wrapper tipado)
      ▼
preload (contextBridge, contextIsolation=true, nodeIntegration=false)
      │  window.fluxo.*
      ▼
electron/main
  ├── ipc/handlers/*        valida payload com Zod, chama use-case, devolve DTO
  ├── src/application        casos de uso: orquestra domínio + repositórios, abre UnitOfWork
  ├── src/domain              regras financeiras puras — zero I/O, zero Electron, zero SQL
  └── src/infrastructure      Kysely + better-sqlite3, migrations, exportação CSV/JSON
```

Regra dura: nenhuma regra de cálculo de saldo, política de transferência ou natureza de
recurso (dinheiro vs benefício) existe fora de `src/domain`.

## Modelo de domínio

```
Person ──< Membership >── FinancialNucleus
  │                              │
  │                              ├──< Resource ──< ResourceOwnership >── Person
  │                              ├──< Category
  │                              └──< Movement ──< MovementLeg >── Resource
  │                                       │
  │                                       └── Adjustment (quando type=ADJUSTMENT)
  │
  └── local_identity (1:1, singleton por instalação)
```

## Tabelas (schema real, migrations 0001–0011)

`persons, local_identity, financial_nuclei, memberships, resources, resource_ownership,
categories, movements, movement_legs, adjustments, audit_logs, schema_migrations,
credit_invoices, financing_plans, financing_installments`

`documents`/`document_items` não existem ainda (D-022) — previstos para a captura de nota
fiscal, como migration aditiva.

### Colunas acrescentadas por migração

| Migration | Acrescenta | Motivo |
|---|---|---|
| 0005 | `movements.responsible_person_id` | Pessoa a quem o lançamento é atribuído |
| 0006 | `movements.payment_method`, `invoice_due_date` | Forma de pagamento e ciclo da fatura |
| 0008 | `resources.liquidity_days` | Prazo de liquidez de aplicações |
| 0010 | `resources.statement_closing_day` | Corte da fatura do cartão |
| **0011** | **`movements.card_invoice_resource_id`** | Referência **estrutural** ao cartão cuja fatura foi paga — substitui a identificação por texto na descrição (D-032) |

## Regra de saldo

```
saldo(recurso) = resource.initial_balance_cents
               + Σ movement_legs.amount_cents
                 onde movement.status = 'CONFIRMED'
```

`initial_balance_cents` é gravado uma única vez, na criação do recurso, e nunca mais
editado (D-020). A garantia é **estrutural**: o parâmetro não existe na assinatura do
repositório nem no schema de IPC, então não há como violá-la por engano (D-029).
Qualquer correção posterior é um `ADJUSTMENT` (D-019).

## Fluxo de uma transferência

```
CreateTransfer(fromResourceId, toResourceId, amountCents, ...)
  └── UnitOfWork.transaction():
        1. cria Movement (type=TRANSFER, status=CONFIRMED)
        2. cria MovementLeg  origem: -amountCents
        3. cria MovementLeg  destino: +amountCents
        4. cria AuditLog
      (qualquer falha em qualquer passo → rollback total, nenhuma leg parcial)
```

**Duas operações distintas compartilham `type=TRANSFER`** (D-030):

| Operação | Partidas | Efeito no patrimônio |
|---|---|---|
| Transferência entre **ativos** (conta → poupança) | `-X` e `+X` | Não muda (soma zero) |
| Liquidação de **passivo** (pagar fatura) | `-X` e `-X` | Cai 2X — a dívida é quitada com dinheiro que sai |

O invariante distingue as duas pela natureza das pontas: se uma delas é passivo, é
liquidação (e exige dinheiro na outra ponta); se ambas são ativas, é transferência.

### Compra no cartão

Uma compra no crédito gera leg **positiva** (`CreateExpense.ts`), porque **cartão de
crédito é passivo**: a compra **aumenta a dívida**, não reduz o dinheiro. O sinal da
partida depende da natureza do recurso, não do tipo de movimento.

## Fluxo de idempotência

Todo caso de uso de escrita recebe `clientOperationId` (UUID gerado no renderer).
`movements` tem `UNIQUE(nucleus_id, client_operation_id)`. Reenviar o mesmo UUID retorna o
`Movement` já existente — nunca duplica o efeito financeiro (D-011).

> **Limite conhecido:** a idempotência **não** cobre duas operações com ids distintos sobre
> o mesmo alvo (dois toques, duas abas). Isso é tratado por transição condicional de estado
> (D-031): o `WHERE` do `UPDATE` exige o status esperado e o caso de uso confere as linhas
> afetadas.

## Segurança do Electron

Ver `docs/security/checklist.md` — que agora distingue **verificado** de **pendente**.
