# D-002 — Stack: TypeScript + Electron + React/Vite

**Status:** Aceita

## Contexto
O Master Build Prompt já direciona para Electron + TypeScript/JavaScript + frontend web +
banco local, deixando a stack concreta a critério da implementação.

## Decisão
- TypeScript em modo `strict` em toda a base (main, preload, domínio, aplicação, infra, UI).
- Electron como shell desktop.
- React + Vite no renderer — maduro, sem lock-in, build rápido.

## Consequências
- Um único idioma (TS) em toda a base reduz fricção e permite tipos compartilhados
  entre camadas (`src/shared`).
- Vite exige um passo de build para o renderer, mas isso já é necessário para Electron
  de qualquer forma.

## Alternativas consideradas
- Vue/Svelte no lugar de React — descartado por preferência por um ecossistema mais
  maduro e testado para apps desktop Electron de longa duração.
