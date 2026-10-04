import { startVitest } from 'vitest/node';

/**
 * Runner da suite dentro do runtime do Electron.
 *
 * O Electron e usado porque `better-sqlite3` e compilado para a ABI dele: rodar a suite no
 * Node exigiria recompilar o modulo nativo. Definir ELECTRON_RUN_AS_NODE=1 (em package.json)
 * faz o binario se comportar como Node, mantendo a ABI correta.
 *
 * DEFEITO CORRIGIDO — o runner lia o resultado CEDO DEMAIS:
 * `startVitest()` resolve assim que o servidor de teste sobe, NAO quando a suite termina.
 * A versao anterior lia `vitest.state.getFiles()` imediatamente e, se algum arquivo ainda
 * estivesse rodando, o fallback `?? true` classificava como falha e chamava `process.exit(1)`
 * — matando a suite no meio. O sintoma era uma execucao que morria sem nenhuma falha real,
 * com o aviso "Detected unsettled top-level await".
 *
 * A correcao usa `waitForTestsToFinishRunning()`, que e a API que de fato aguarda a
 * conclusao, e deriva o codigo de saida das contagens que ela devolve.
 */
const watch = process.argv.includes('--watch');

const vitest = await startVitest('test', [], {
  run: !watch,
  watch,
  config: 'vitest.config.ts',
});

if (!watch) {
  if (!vitest) {
    console.error('Nao foi possivel iniciar o Vitest.');
    process.exit(1);
  }

  // Aguarda a suite INTEIRA terminar antes de decidir o codigo de saida.
  const result = await vitest.waitForTestsToFinishRunning();
  await vitest.close();

  if (!result) {
    console.error('A suite terminou sem resultado legivel.');
    process.exit(1);
  }

  const failedTests = result.failedTests ?? 0;
  const failedFiles = result.failedFiles ?? 0;
  const succeeded = result.success ?? false;

  process.exit(succeeded && failedTests === 0 && failedFiles === 0 ? 0 : 1);
}
