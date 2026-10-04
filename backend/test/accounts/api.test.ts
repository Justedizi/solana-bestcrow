import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { getAddressDecoder } from '@solana/kit';
import { BackendServer } from '../../src/api/server.js';
import { Store } from '../../src/db/index.js';
import { BestcrowClient, ApiClientError } from '../../src/client/index.js';
import { createTestFetch } from '../support/http.js';

test('HTTP routes + typed SDK register, link Phantom proof, wallet login and logout', async () => {
  const store = new Store(':memory:');
  const backend = new BackendServer(store);
  const client = new BestcrowClient({ baseUrl: 'http://backend.test', fetch: createTestFetch(backend.app) });
  const pair = generateKeyPairSync('ed25519');
  const address = getAddressDecoder().decode(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  try {
    const session = await client.accounts.register({ email: 'phantom@example.com', password: 'phantom test password', displayName: 'Test' });
    const account = client.withSession(session.token);
    assert.equal((await account.accounts.getMe()).user.id, session.user.id);
    const challenge = await account.accounts.createWalletChallenge({ address, purpose: 'link' });
    const signatureBase64 = sign(null, Buffer.from(challenge.message), pair.privateKey).toString('base64');
    const wallet = await account.accounts.linkWallet({ challengeId: challenge.id, signatureBase64 });
    assert.equal(wallet.address, address);
    assert.equal((await account.accounts.listWallets()).length, 1);
    await assert.rejects(account.accounts.linkWallet({ challengeId: challenge.id, signatureBase64 }),
      (error: unknown) => error instanceof ApiClientError && error.status === 401);
    const loginChallenge = await client.accounts.createWalletChallenge({ address, purpose: 'login' });
    const walletSession = await client.accounts.walletLogin({ challengeId: loginChallenge.id,
      signatureBase64: sign(null, Buffer.from(loginChallenge.message), pair.privateKey).toString('base64') });
    assert.equal(walletSession.user.id, session.user.id);
    await account.accounts.logout();
    await assert.rejects(account.accounts.getMe(), (error: unknown) => error instanceof ApiClientError && error.status === 401);
    const newAccount = client.withSession(walletSession.token);
    await newAccount.accounts.unlinkWallet(address);
    assert.equal((await newAccount.accounts.listWallets()).length, 0);
    const config = await client.chain.getConfig();
    assert.equal(config.walletChain, 'solana:devnet');
    assert.equal('dbPath' in config, false);
  } finally {
    store.close();
  }
});

test('invalid and oversized credential JSON is rejected without logging request content', async () => {
  const store = new Store(':memory:');
  const backend = new BackendServer(store);
  const testFetch = createTestFetch(backend.app);
  const originalLog = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const bad = await testFetch('http://backend.test/api/accounts/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"secret",',
    });
    assert.equal(bad.status, 400);
    const oversized = await testFetch('http://backend.test/api/accounts/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'x'.repeat(300_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(logged.length, 0);
  } finally {
    console.error = originalLog;
    store.close();
  }
});

test('wallet-first login provisions an account for an unknown wallet and rejects replay', async () => {
  const store = new Store(':memory:');
  const backend = new BackendServer(store);
  const client = new BestcrowClient({ baseUrl: 'http://backend.test', fetch: createTestFetch(backend.app) });
  const pair = generateKeyPairSync('ed25519');
  const wallet = getAddressDecoder().decode(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  try {
    const challenge = await client.accounts.createWalletChallenge({ address: wallet, purpose: 'login' });
    const proof = { challengeId: challenge.id,
      signatureBase64: sign(null, Buffer.from(challenge.message), pair.privateKey).toString('base64') };
    const session = await client.accounts.walletLogin(proof);
    assert.equal(session.user.email, `wallet:${wallet}@local.invalid`);
    const account = client.withSession(session.token);
    assert.deepEqual((await account.accounts.listWallets()).map((item) => item.address), [wallet]);
    await assert.rejects(client.accounts.walletLogin(proof), (error: unknown) =>
      error instanceof ApiClientError && error.status === 401);
  } finally {
    store.close();
  }
});
