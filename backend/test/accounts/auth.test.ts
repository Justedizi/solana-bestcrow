import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { getAddressDecoder } from '@solana/kit';
import { Store } from '../../src/db/index.js';
import { AccountRepository } from '../../src/sectors/accounts/repository.js';
import { AuthService } from '../../src/sectors/accounts/auth/service.js';
import { WalletService } from '../../src/sectors/accounts/wallets/service.js';
import { RateLimiter } from '../../src/core/rateLimiter.js';
import type { Request, Response } from 'express';

function fixture() {
  const store = new Store(':memory:');
  const repository = new AccountRepository(store.db);
  let now = 1_800_000_000;
  const auth = new AuthService(repository, 600, () => now);
  const wallets = new WalletService(repository, auth, { origin: 'http://localhost:3000', cluster: 'devnet' }, () => now);
  return { store, repository, auth, wallets, advance: (seconds: number) => { now += seconds; } };
}

function keypair() {
  const pair = generateKeyPairSync('ed25519');
  const encoded = pair.publicKey.export({ format: 'der', type: 'spki' });
  return { ...pair, address: getAddressDecoder().decode(encoded.subarray(-32)) };
}

const registration = { email: 'test@example.com', password: 'test password 12345' };

test('registration normalizes email, stores only password/session hashes and revokes logout', async () => {
  const f = fixture();
  try {
    const result = await f.auth.register({ ...registration, email: ' TEST@example.com ' });
    assert.equal(result.user.email, registration.email);
    assert.equal('passwordHash' in result.user, false);
    const user = f.repository.getUser(result.user.id)!;
    assert.match(user.passwordHash, /^scrypt:/);
    assert.equal(user.passwordHash.includes(registration.password), false);
    const session = f.auth.authenticate(`Bearer ${result.token}`);
    assert.equal(session.user.id, result.user.id);
    const row = f.store.db.prepare('SELECT token_hash FROM account_sessions').get()!;
    assert.notEqual(row.token_hash, result.token);
    f.auth.logout(session.sessionId);
    assert.throws(() => f.auth.authenticate(`Bearer ${result.token}`), /invalid or expired/);
    await assert.rejects(f.auth.register(registration), /already registered/);
    const login = await f.auth.login(registration);
    assert.equal(login.user.id, result.user.id);
    await assert.rejects(f.auth.login({ ...registration, password: 'wrong password 123' }), /Invalid email or password/);
    await assert.rejects(f.auth.login({ ...registration, email: 'missing@example.com' }), /Invalid email or password/);
    f.advance(601);
    assert.throws(() => f.auth.authenticate(`Bearer ${login.token}`), /invalid or expired/);
  } finally { f.store.close(); }
});

test('concurrent registration creates one user, session tokens cannot be forged', async () => {
  const f = fixture();
  try {
    const results = await Promise.allSettled([f.auth.register(registration), f.auth.register(registration)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.throws(() => f.auth.authenticate(`Bearer ${'a'.repeat(43)}`), /invalid or expired/);
    assert.throws(() => f.auth.authenticate('Basic abc'), /Bearer session/);
    await assert.rejects(f.auth.register({ ...registration, password: 'short' }));
  } finally { f.store.close(); }
});

test('wallet link needs a real Ed25519 signature and the proof cannot be replayed', async () => {
  const f = fixture();
  const pair = keypair();
  try {
    const session = await f.auth.register(registration);
    const challenge = f.wallets.challenge({ address: pair.address, purpose: 'link' }, session.user.id);
    assert.match(challenge.message, /Origin: http:\/\/localhost:3000/);
    const proof = { challengeId: challenge.id, signatureBase64: sign(null, Buffer.from(challenge.message), pair.privateKey).toString('base64') };
    const wallet = f.wallets.link(session.user.id, proof);
    assert.equal(wallet.address, pair.address);
    assert.equal(f.wallets.requireLinked(session.user.id, pair.address).id, wallet.id);
    assert.throws(() => f.wallets.link(session.user.id, proof), /already used/);
    const loginChallenge = f.wallets.challenge({ address: pair.address, purpose: 'login' });
    const login = f.wallets.login({ challengeId: loginChallenge.id,
      signatureBase64: sign(null, Buffer.from(loginChallenge.message), pair.privateKey).toString('base64') });
    assert.equal(login.user.id, session.user.id);
    f.wallets.unlink(session.user.id, pair.address);
    assert.throws(() => f.wallets.challenge({ address: pair.address, purpose: 'login' }), /not linked/);
  } finally { f.store.close(); }
});

test('wallet challenges enforce account, purpose, expiry and exact signed message', async () => {
  const f = fixture();
  const pair = keypair();
  const wrong = keypair();
  try {
    const owner = await f.auth.register(registration);
    const stranger = await f.auth.register({ ...registration, email: 'other@example.com' });
    assert.throws(() => f.wallets.challenge({ address: pair.address, purpose: 'link' }), /Sign in/);
    const challenge = f.wallets.challenge({ address: pair.address, purpose: 'link' }, owner.user.id);
    const proof = { challengeId: challenge.id, signatureBase64: sign(null, Buffer.from(challenge.message), pair.privateKey).toString('base64') };
    assert.throws(() => f.wallets.link(stranger.user.id, proof), /challenge is invalid/);
    assert.throws(() => f.wallets.login(proof), /challenge is invalid/);
    assert.throws(() => f.wallets.link(owner.user.id, { ...proof,
      signatureBase64: sign(null, Buffer.from(challenge.message), wrong.privateKey).toString('base64') }), /signature is invalid/);
    assert.throws(() => f.wallets.link(owner.user.id, { ...proof,
      signatureBase64: sign(null, Buffer.from(`${challenge.message}!`), pair.privateKey).toString('base64') }), /signature is invalid/);
    f.advance(301);
    assert.throws(() => f.wallets.link(owner.user.id, proof), /expired/);
    const fresh = f.wallets.challenge({ address: pair.address, purpose: 'link' }, owner.user.id);
    f.wallets.link(owner.user.id, { challengeId: fresh.id,
      signatureBase64: sign(null, Buffer.from(fresh.message), pair.privateKey).toString('base64') });
    assert.throws(() => f.wallets.challenge({ address: pair.address, purpose: 'link' }, stranger.user.id), /another account/);
    assert.throws(() => f.wallets.unlink(stranger.user.id, pair.address), /not linked/);
  } finally { f.store.close(); }
});

test('rate limiter counts per IP and releases expired windows', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 1000, () => now);
  const errors: unknown[] = [];
  const req = { ip: '127.0.0.1' } as Request;
  const res = { setHeader: () => {} } as unknown as Response;
  for (let i = 0; i < 3; i++) limiter.middleware(req, res, error => errors.push(error));
  assert.equal(errors[0], undefined);
  assert.equal(errors[1], undefined);
  assert.match(String(errors[2]), /Too many attempts/);
  now += 1001;
  limiter.middleware(req, res, error => errors.push(error));
  assert.equal(errors[3], undefined);
});
