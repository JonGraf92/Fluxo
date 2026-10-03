# D-013 — Identity mínima local, sem autenticação real na V1

**Status:** Aceita (substitui parte de D-006)

## Contexto
D-006 propunha uma entidade `Identity` separada de `Person`. Na revisão do produto, ficou
claro que criar uma entidade robusta de autenticação (login, senha, sessão) não tem função
prática na V1 — o Fluxo roda local, single-user, sem necessidade de provar identidade a
ninguém. Criar essa estrutura só para "cumprir a regra" seria desperdiçar esforço de
desenvolvimento sem benefício real.

## Decisão
Mantém-se a separação conceitual (Regra 10: Identidade ≠ Pessoa), mas `local_identity` é
uma tabela singleton: uma única linha criada no primeiro boot, ligando o processo local a
um `person_id`. Sem senha, sem múltiplas identidades, sem tela de login.

```
local_identity: id, person_id (FK), installed_at
```

## Consequências
- Zero esforço de desenvolvimento em autenticação na V1.
- A separação conceitual permanece no schema, então adicionar autenticação real
  (multi-usuário no mesmo dispositivo, ou login remoto em versões híbridas futuras) não
  exige quebrar o modelo de `Person`.

## Alternativas consideradas
- Não ter `local_identity` nenhuma e usar `Person` diretamente como "usuário do sistema" —
  rejeitado: fecharia a porta para multi-perfil local no mesmo dispositivo no futuro.
