import { startVitest } from 'vitest/node';

/**
 * Runner da suite dentro do runtime do Electron.
 *
 * O Electron e usado porque `better-sqlite3` e compilado para a ABI dele: rodar a suite no
 * Node exigiria recompilar o modulo nativo. Definir ELECTRON_RUN_AS_NODE=1 (em package.json)
 * faz o binario se comportar como Node, mantendo a ABI correta.
 *
 * DEFEITO CORRIGIDO — o runner original lia o resultado CEDO DEMAIS:
 * `startVitest()` aguarda a execucao, mas a versao anterior lia
 * `vitest.state.getFiles()` e usava `?? true` como fallback. Quando a leitura acontecia
 * antes de algum arquivo terminar, o fallback classificava como falha e chamava
 * `process.exit(1)` — matando a suite no meio, com o aviso "Detected unsettled top-level
 * await". O sintoma era uma execucao reprovada sem nenhuma assercao falhando.
 *
 * A correcao NAO reimplementa a decisao: o proprio Vitest ja marca `process.exitCode = 1`
 * ao detectar falha (ver `hasFailed(files)` em cli-api). Apenas deixamos o processo encerrar
 * normalmente e conferimos o estado final para reportar de forma legivel.
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

  // Aguarda qualquer execucao ainda em andamento antes de ler o estado. `runningPromise`
  // pode ser undefined se a rodada ja terminou — nesse caso nao ha o que esperar.
  await vitest.runningPromise;
  await vitest.close();

  const files = vitest.state.getFiles();
  const failedFiles = files.filter((file) => file.result?.state === 'fail');
  const passedFiles = files.filter((file) => file.result?.state === 'pass');

  console.log('');
  console.log(`Arquivos: ${passedFiles.length} passaram, ${failedFiles.length} falharam (${files.length} no total)`);

  for (const file of failedFiles) {
    console.error(`  FALHOU: ${file.filepath}`);
  }

  // O Vitest ja ajustou process.exitCode; mantemos esse veredito e apenas garantimos que
  // uma suite sem arquivo nenhum nao seja tratada como sucesso.
  if (files.length === 0) {
    console.error('Nenhum arquivo de teste foi executado.');
    process.exit(1);
  }
  if (failedFiles.length > 0) {
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
}
