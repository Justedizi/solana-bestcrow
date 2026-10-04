import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_DEVNET_RPC_URL, resolveDevnetRpcUrl } from '../app/lib/rpc-url.ts';

test('beta Helius URLs are routed to the Devnet Helius endpoint', () => {
  const resolved = resolveDevnetRpcUrl('https://beta.helius-rpc.com/?api-key=test-key');
  assert.equal(resolved, 'https://devnet.helius-rpc.com/?api-key=test-key');
});

test('wrong-cluster and invalid URLs use the Devnet fallback', () => {
  assert.equal(resolveDevnetRpcUrl('https://mainnet.helius-rpc.com/?api-key=test-key'), `${PUBLIC_DEVNET_RPC_URL}/`);
  assert.equal(resolveDevnetRpcUrl('not a URL'), `${PUBLIC_DEVNET_RPC_URL}/`);
  assert.equal(resolveDevnetRpcUrl('https://devnet.example-rpc.test'), 'https://devnet.example-rpc.test/');
});

test('local validator URLs remain available for local development', () => {
  assert.equal(resolveDevnetRpcUrl('http://127.0.0.1:8899'), 'http://127.0.0.1:8899/');
});
