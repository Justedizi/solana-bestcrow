import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RpcRateLimitError, withRpcRetry } from '../../src/solana/retry.js';

test('RPC retry backs off after Solana error 8100002 and then succeeds', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRpcRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw { context: { __code: 8100002 } };
      return 'ok';
    },
    { attempts: 3, baseDelayMs: 25, sleep: async (delay) => { delays.push(delay); } },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25, 50]);
});

test('RPC retry does not retry unrelated Solana errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRpcRetry(async () => {
      calls += 1;
      throw new Error('invalid account data');
    }, { sleep: async () => {} }),
    /invalid account data/,
  );
  assert.equal(calls, 1);
});

test('RPC retry returns an actionable error after the retry budget', async () => {
  await assert.rejects(
    withRpcRetry(async () => { throw { context: { statusCode: 429 } }; }, {
      attempts: 2,
      baseDelayMs: 0,
      sleep: async () => {},
    }),
    (error: unknown) => error instanceof RpcRateLimitError
      && /dedicated RPC endpoint/.test(error.message),
  );
});
