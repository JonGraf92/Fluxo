# Arquitetura do Fluxo — visão geral (v1.1)

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

## Tabelas (V1.0)

`persons, local_identity, financial_nuclei, memberships, resources, resource_ownership,
categories, movements, movement_legs, adjustments, audit_logs, schema_migrations`

Ver `docs/adr/` para a justificativa de cada tabela e campo. `documents`/`document_items`
não existem na V1 (D-022).

## Regra de saldo

```
saldo(recurso) = resource.initial_balance_cents
               + Σ movement_legs.amount_cents
                 onde movement.resource_id = recurso
                 e movement.status = 'CONFIRMED'
```

`initial_balance_cents` é gravado uma única vez, na criação do recurso, e nunca mais
editado (D-020). Qualquer correção depois disso é um `ADJUSTMENT` (D-019).

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

## Fluxo de idempotência

Todo caso de uso de escrita recebe `clientOperationId` (UUID gerado no renderer).
`movements` tem `UNIQUE(nucleus_id, client_operation_id)`. Reenviar o mesmo UUID retorna o
`Movement` já existente — nunca duplica o efeito financeiro (D-011).

## Segurança do Electron

Ver `docs/security/checklist.md`.
