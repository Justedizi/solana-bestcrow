import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BestcrowClient } from '../../src/client/index.js';
import { ApiClientError, ApiNetworkError, HttpRequester } from '../../src/core/requester.js';
import type { EndpointDefinition } from '../../src/core/endpoint.js';

type CapturedRequest = { url: URL; init: RequestInit };

function mockFetch(response: unknown = {}) {
  const requests: CapturedRequest[] = [];
  const implementation: typeof fetch = async (input, init = {}) => {
    requests.push({ url: new URL(String(input)), init });
    return new Response(JSON.stringify(response), { status: 200 });
  };
  return { requests, implementation };
}

test('SDK instances isolate session tokens and send public requests without credentials', async () => {
  const mock = mockFetch();
  const anonymous = new BestcrowClient({ baseUrl: 'https://example.test/', fetch: mock.implementation });
  const alice = anonymous.withSession('alice-session');
  const bob = anonymous.withSession('bob-session');
  await alice.accounts.getMe();
  await bob.accounts.getMe();
  await alice.chain.getConfig();
  assert.equal(new Headers(mock.requests[0]!.init.headers).get('authorization'), 'Bearer alice-session');
  assert.equal(new Headers(mock.requests[1]!.init.headers).get('authorization'), 'Bearer bob-session');
  assert.equal(new Headers(mock.requests[2]!.init.headers).get('authorization'), null);
  await assert.rejects(anonymous.accounts.getMe(), /requires a session/);
  assert.equal(mock.requests.length, 3);
});

test('SDK sends browser wallet proof as JSON without a locally configured wallet', async () => {
  const mock = mockFetch();
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: mock.implementation });
  const account = client.withSession('user-session');
  await account.accounts.createWalletChallenge({
    address: 'So11111111111111111111111111111111111111112',
    purpose: 'link',
  });
  await account.accounts.linkWallet({ challengeId: 'challenge-one', signatureBase64: 'signature-from-phantom' });
  assert.equal(mock.requests[0]!.url.pathname, '/api/accounts/wallets/challenge');
  assert.equal(new Headers(mock.requests[0]!.init.headers).get('authorization'), 'Bearer user-session');
  assert.equal(mock.requests[1]!.init.method, 'POST');
  assert.equal(new Headers(mock.requests[1]!.init.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(mock.requests[1]!.init.body)), {
    challengeId: 'challenge-one',
    signatureBase64: 'signature-from-phantom',
  });
});

test('query values and path parameters are encoded independently', async () => {
  const mock = mockFetch();
  const client = new BestcrowClient({ baseUrl: 'https://example.test/prefix', fetch: mock.implementation });
  await client.chain.listCampaigns({ q: 'schools & hospitals', limit: 0, creator: undefined });
  assert.equal(mock.requests[0]!.url.pathname, '/prefix/api/campaigns');
  assert.equal(mock.requests[0]!.url.searchParams.get('q'), 'schools & hospitals');
  assert.equal(mock.requests[0]!.url.searchParams.get('limit'), '0');
  assert.equal(mock.requests[0]!.url.searchParams.has('creator'), false);
  await client.withSession('token').accounts.getPayment('identifier/with space');
  assert.equal(mock.requests[1]!.url.pathname, '/prefix/api/accounts/payments/identifier%2Fwith%20space');
});

test('payment confirmation retains the payment identifier and wallet transaction signature', async () => {
  const mock = mockFetch({ status: 'confirmed' });
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: mock.implementation }, 'session');
  await client.accounts.confirmPayment('payment-one', 'on-chain-signature');
  assert.equal(mock.requests[0]!.url.pathname, '/api/accounts/payments/payment-one/confirm');
  assert.equal(mock.requests[0]!.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(mock.requests[0]!.init.body)), { signature: 'on-chain-signature' });
});

test('API error status and payload are available to callers', async () => {
  const implementation: typeof fetch = async () => new Response(
    JSON.stringify({ error: 'Wallet signature is invalid' }),
    { status: 403 },
  );
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: implementation }, 'session');
  await assert.rejects(client.accounts.linkWallet({ challengeId: 'one', signatureBase64: 'invalid' }), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 403);
    assert.equal(error.message, 'Wallet signature is invalid');
    assert.deepEqual(error.body, { error: 'Wallet signature is invalid' });
    return true;
  });
});

test('non-JSON HTTP failures preserve the response body', async () => {
  const implementation: typeof fetch = async () => new Response('upstream unavailable', { status: 502 });
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: implementation });
  await assert.rejects(client.chain.getConfig(), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 502);
    assert.equal(error.body, 'upstream unavailable');
    return true;
  });
});

test('timeout and caller cancellation are reported separately', async () => {
  const implementation: typeof fetch = async (_, init) => new Promise<Response>((_, reject) => {
    if (init?.signal?.aborted) reject(init.signal.reason);
    else init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  });
  const requester = new HttpRequester({ baseUrl: 'https://example.test', fetch: implementation, timeoutMs: 10 });
  const endpoint: EndpointDefinition<Record<string, never>, object> = {
    path: 'api/chain/config', method: 'GET', auth: 'public',
  };
  await assert.rejects(requester.request(endpoint), (error: unknown) => {
    assert.ok(error instanceof ApiNetworkError);
    assert.equal(error.reason, 'timeout');
    return true;
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requester.request(endpoint, { signal: controller.signal }), (error: unknown) => {
    assert.ok(error instanceof ApiNetworkError);
    assert.equal(error.reason, 'aborted');
    return true;
  });
});

test('malformed successful JSON remains a decoding error', async () => {
  const implementation: typeof fetch = async () => new Response('{invalid-json', { status: 200 });
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: implementation });
  await assert.rejects(client.chain.getConfig(), SyntaxError);
});

test('invalid transport configuration fails before a request', async () => {
  assert.throws(() => new BestcrowClient({ baseUrl: 'file:///tmp/backend' }), /HTTP or HTTPS/);
  assert.throws(() => new BestcrowClient({ baseUrl: 'https://user:password@example.test' }), /credentials/);
  assert.throws(() => new BestcrowClient({ baseUrl: 'https://example.test', timeoutMs: 0 }), /timeoutMs/);
  const mock = mockFetch();
  const client = new BestcrowClient({ baseUrl: 'https://example.test', fetch: mock.implementation }, 'token');
  await assert.rejects(client.accounts.getPayment('..'), /path parameter/);
  assert.equal(mock.requests.length, 0);
});
