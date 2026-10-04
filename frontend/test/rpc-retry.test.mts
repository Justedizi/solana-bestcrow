import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RpcRateLimitError, withRpcRetry } from '../app/lib/rpc-retry.ts';

test('frontend RPC retry handles error 8100002 with bounded backoff', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRpcRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw { context: { __code: 8100002 } };
      return 'ok';
    },
    { attempts: 3, baseDelayMs: 10, sleep: async (delay) => { delays.push(delay); } },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [10]);
});

test('frontend RPC retry surfaces a dedicated-provider hint after HTTP 429', async () => {
  await assert.rejects(
    withRpcRetry(async () => { throw { context: { statusCode: 429 } }; }, {
      attempts: 1,
      baseDelayMs: 0,
      sleep: async () => {},
    }),
    (error: unknown) => error instanceof RpcRateLimitError
      && /dedicated RPC endpoint/.test(error.message),
  );
});
