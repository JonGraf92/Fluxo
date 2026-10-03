# D-014 — Kysely + better-sqlite3 em vez de Prisma

**Status:** Aceita

## Contexto
Seção 5 pede avaliação de licença, manutenção, segurança, dependências e risco de supply
chain antes de adotar uma biblioteca crítica.

## Decisão
Kysely (query builder tipado, sem geração de código, sem engine nativo próprio) sobre
`better-sqlite3`, em vez de Prisma.

## Consequências
- Prisma embarca um binary engine (Rust) próprio por plataforma — maior superfície de
  supply chain e menos controle sobre o SQL final gerado.
- Kysely gera SQL legível e auditável, com apenas tipos TypeScript em cima — mais alinhado
  com "correção financeira acima de tudo": o time consegue ler exatamente a query que roda
  contra dados financeiros.
- Migrations feitas com o migrator embutido do próprio Kysely, sem dependência extra.

## Alternativas consideradas
- Prisma — rejeitado pelos motivos acima.
- SQL cru sem query builder — rejeitado: perde segurança de tipos e aumenta risco de erro
  manual em joins/where.
