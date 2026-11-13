import { existsSync } from 'node:fs';
import path from 'node:path';
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

/**
 * ANOTACOES NO GITHUB ACTIONS — o reporter `github-actions` do Vitest so anota o erro que tem
 * na pilha uma linha de arquivo do projeto; os demais ele descarta em silencio
 * (`if (!stack) continue` em GithubActionsReporter.onFinished). Estouro de tempo de teste ou de
 * hook, erro sem pilha e boa parte dos erros nao tratados caem nesse caso, e a etapa de teste
 * do CI falhava com uma unica anotacao: "Process completed with exit code 1". Como o log
 * completo do job exige autenticacao, a falha ficava opaca.
 *
 * As funcoes abaixo emitem comandos de workflow (`::error`, `::notice`) so para o que o
 * reporter deixou de fora. Nada aqui participa do veredito nem do codigo de saida.
 */
const SLOWEST_TESTS_SHOWN = 5;

// Escape exigido pelos comandos de workflow: `%`, CR e LF na mensagem; nas propriedades,
// tambem `:` e `,`, que separam os campos do comando.
function escapeData(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function workflowCommand(command, properties, message) {
  const fields = Object.entries(properties)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${escapeProperty(value)}`)
    .join(',');
  return `::${command}${fields ? ` ${fields}` : ''}::${escapeData(message)}`;
}

/** Arquivo, suites e testes, com o nome completo no formato do Vitest: "arquivo > suite > teste". */
function* walkTasks(task, parentNames = []) {
  const names = [...parentNames, task.name];
  yield { task, fullName: names.join(' > ') };
  for (const child of task.tasks ?? []) {
    yield* walkTasks(child, names);
  }
}

/**
 * O erro tem na pilha alguma linha de arquivo do repositorio? E o que decide se o reporter do
 * Vitest ja anotou. Ele consulta o grafo de modulos do servidor, que ja esta fechado quando
 * este runner le o estado; o criterio equivalente aqui e "arquivo que existe, dentro da raiz e
 * fora de node_modules", sobre a pilha ja interpretada que o Vitest guarda em `error.stacks`.
 * Na duvida a resposta e "nao": anotacao repetida incomoda menos do que falha sem anotacao.
 */
function hasRepoFrame(error, root) {
  const frames = Array.isArray(error?.stacks) ? error.stacks : [];
  return frames.some((frame) => {
    if (typeof frame?.file !== 'string') {
      return false;
    }
    const relative = path.relative(root, frame.file);
    if (relative === '' || path.isAbsolute(relative)) {
      return false;
    }
    const segments = relative.split(path.sep);
    return segments[0] !== '..' && !segments.includes('node_modules') && existsSync(frame.file);
  });
}

function describeError(error) {
  if (error === null || typeof error !== 'object') {
    return String(error);
  }
  const message = String(error.message ?? '');
  return error.name ? `${error.name}: ${message}` : message;
}

function printGithubAnnotations(vitest) {
  const root = vitest.config.root;
  // Sem o reporter do Vitest ligado nao ha anotacao a duplicar: tudo o que falhou e anotado aqui.
  const vitestAnnotates = vitest.config.reporters.some(([name]) => name === 'github-actions');
  const alreadyAnnotated = (error) => vitestAnnotates && hasRepoFrame(error, root);
  const timedTests = [];

  for (const file of vitest.state.getFiles()) {
    for (const { task, fullName } of walkTasks(file)) {
      if (task.type !== 'suite' && typeof task.result?.duration === 'number') {
        timedTests.push({ fullName, duration: task.result.duration });
      }
      if (task.result?.state !== 'fail') {
        continue;
      }
      for (const error of task.result.errors ?? []) {
        if (!alreadyAnnotated(error)) {
          // `file.name` ja e o caminho relativo a raiz, com barras normais.
          const properties = { file: file.name, title: fullName };
          console.log(workflowCommand('error', properties, describeError(error)));
        }
      }
    }
  }

  for (const error of vitest.state.getUnhandledErrors()) {
    if (!alreadyAnnotated(error)) {
      // O Vitest registra em VITEST_TEST_PATH (relativo a raiz) o arquivo que estava rodando.
      const file = typeof error?.VITEST_TEST_PATH === 'string' ? error.VITEST_TEST_PATH : undefined;
      const properties = { file, title: 'Erro nao tratado' };
      console.log(workflowCommand('error', properties, describeError(error)));
    }
  }

  const slowest = timedTests.sort((a, b) => b.duration - a.duration).slice(0, SLOWEST_TESTS_SHOWN);
  if (slowest.length > 0) {
    const title = `${slowest.length} testes mais lentos`;
    const lines = slowest.map(({ fullName, duration }) => `${Math.round(duration)} ms - ${fullName}`);
    console.log(workflowCommand('notice', { title }, lines.join('\n')));
  }
}

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

  // Espelha o veredito logo abaixo, sem decidir nada: so escolhe se ha o que anotar. Um
  // defeito ao montar as anotacoes nao pode trocar o resultado da rodada.
  const runFailed = files.length === 0 || failedFiles.length > 0 || Number(process.exitCode ?? 0) !== 0;
  if (runFailed && process.env.GITHUB_ACTIONS === 'true') {
    try {
      printGithubAnnotations(vitest);
    } catch (error) {
      console.error(`Nao foi possivel gerar as anotacoes do GitHub Actions: ${error?.message ?? error}`);
    }
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
