# D-017 — Resource Ownership deve ser compatível com o Financial Nucleus do recurso

**Status:** Aceita

## Contexto
`resource_ownership.person_id` e `resources.nucleus_id` são colunas independentes. Sem
validação, o banco permitiria um recurso do Núcleo A pertencer a uma pessoa que só tem
`membership` no Núcleo B — um estado sem sentido no domínio.

## Decisão
Antes de criar `resource_ownership`, o caso de uso (`application`) valida que a pessoa tem
uma `Membership` ativa no mesmo `nucleus_id` do recurso. Essa validação vive no domínio/
application, não como `FOREIGN KEY`/`CHECK` pura no SQLite (SQLite não suporta bem
constraints multi-tabela desse tipo).

## Consequências
- `AttachResourceOwnership` (dentro de `CreateResource` ou caso de uso dedicado) lança
  `DomainError` se a pessoa não pertencer ao núcleo.
- Testado em `tests/application/resource-ownership.test.ts`.
