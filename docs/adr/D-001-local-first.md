# D-001 — Aplicação local-first, sem dependência de serviços externos

**Status:** Aceita

## Contexto
O Fluxo lida com dados financeiros pessoais sensíveis. O Master Build Prompt exige que a
V1.0 funcione totalmente offline e que nenhum dado financeiro seja enviado a servidores
externos por padrão.

## Decisão
Toda a V1.0 roda localmente: banco SQLite no dispositivo, sem chamadas de rede para
autenticação, sincronização, analytics ou IA. A aplicação deve abrir e funcionar
completamente sem conexão com a internet.

## Consequências
- Sem sincronização entre dispositivos na V1 (fica para V2+, ADR futura).
- Backup é responsabilidade do usuário (exportação manual CSV/JSON).
- Simplifica drasticamente o modelo de segurança: não há superfície de ataque de rede
  para dados financeiros.

## Alternativas consideradas
- Backend remoto com sync desde o início — rejeitado: contradiz a filosofia de
  privacidade por padrão e adiciona complexidade não necessária para validar o domínio.
