# D-026 — local_identity é um singleton garantido em duas camadas

**Status:** Aceita — correção de hardening V1.0.1

## Contexto
`CompleteOnboarding` criava sempre um novo `Person` + `LocalIdentity` + `FinancialNucleus`
com IDs aleatórios (`uuid()`), sem checar se a instalação já tinha sido configurada. Uma
segunda chamada ao onboarding (por bug de UI, duplo carregamento, ou uso indevido do IPC)
criaria uma segunda identidade e um segundo núcleo silenciosamente — nenhum erro, nenhum
aviso, e o app passaria a ter dois "donos" concorrentes sem relação entre si.

## Decisão
Duas garantias independentes:
1. **Aplicação:** `CompleteOnboarding.execute()` chama `repos.localIdentity.get()` antes
   de qualquer escrita; se já existir uma identidade, lança
   `DomainError('ALREADY_ONBOARDED', ...)` e não grava nada.
2. **Banco:** `local_identity.id` deixou de ser um UUID aleatório e passou a ser a
   constante fixa `LOCAL_IDENTITY_SINGLETON_ID` (`src/domain/entities/LocalIdentity.ts`).
   Como a coluna já é `PRIMARY KEY`, uma segunda tentativa de `INSERT` com o mesmo id
   colide na própria constraint do SQLite — mesmo que a checagem de aplicação acima fosse
   removida ou contornada por engano no futuro, o banco ainda rejeitaria a segunda linha.

## Consequências
- "Uma segunda tentativa de onboarding não cria uma segunda identidade/núcleo
  silenciosamente" é uma garantia estrutural, não uma convenção de UI — testado em
  `tests/application/onboarding-singleton.test.ts`.
