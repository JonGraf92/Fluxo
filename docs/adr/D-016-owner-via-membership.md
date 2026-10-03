# D-016 — Owner do núcleo é resolvido exclusivamente via Membership

**Status:** Aceita

## Contexto
A proposta inicial tinha `financial_nuclei.owner_person_id` **e** `memberships.role=OWNER`
simultaneamente — duas fontes de verdade para a mesma pergunta ("quem é dono deste
núcleo?"), o que pode divergir com o tempo.

## Decisão
`financial_nuclei` NÃO tem `owner_person_id`. O proprietário é sempre resolvido consultando
`memberships WHERE nucleus_id = ? AND role = 'OWNER'`. `CreateNucleus` cria o núcleo e a
membership OWNER na mesma transação.

## Consequências
- Uma única fonte de verdade — impossível o "dono" divergir entre duas tabelas.
- `NucleusRepository.getOwner(nucleusId)` é a única forma correta de descobrir o
  proprietário; nenhum outro caminho é exposto pela camada de aplicação.
