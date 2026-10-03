import { startVitest } from 'vitest/node';

const watch = process.argv.includes('--watch');
const vitest = await startVitest('test', [], {
  run: !watch,
  watch,
  config: 'vitest.config.ts',
});

if (!watch) {
  const failed = vitest?.state.getFiles().some((file) => file.result?.state === 'fail') ?? true;
  await vitest?.close();
  process.exit(failed ? 1 : 0);
}
