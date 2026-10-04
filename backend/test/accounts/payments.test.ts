import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import express from 'express';
import { getAddressDecoder, getBase58Decoder } from '@solana/kit';
import { ApiError, errorHandler } from '../../src/api/middleware/error.js';
import { pledgePlan } from '../../src/solana/program.js';
import { PaymentRepository } from '../../src/sectors/accounts/payments/repository.js';
import { PaymentService, RpcPaymentVerifier } from '../../src/sectors/accounts/payments/service.js';
import { PaymentEndpoints } from '../../src/sectors/accounts/payments/endpoints.js';
import type { PaymentDto, PaymentTransactionRpc } from '../../src/sectors/accounts/payments/types.js';
import { createTestFetch } from '../support/http.js';

const USER = 'account-one';
const OTHER_USER = 'account-two';
const WALLET = getAddressDecoder().decode(new Uint8Array(32).fill(7));
const CAMPAIGN = getAddressDecoder().decode(new Uint8Array(32).fill(8));
const OTHER_ACCOUNT = getAddressDecoder().decode(new Uint8Array(32).fill(6));
const SIGNATURE = getBase58Decoder().decode(new Uint8Array(64).fill(9));
const OTHER_SIGNATURE = getBase58Decoder().decode(new Uint8Array(64).fill(10));
const NOW = 1_800_000_000_000;

type RawTransaction = ReturnType<typeof transactionFor>;

function transactionFor(payment: PaymentDto, useLookupTable = false) {
  const plans = [payment.instruction, payment.memoInstruction];
  const entries = new Map<string, { key: string; signer: boolean; writable: boolean }>();
  for (const plan of plans) {
    for (const account of plan.accounts) {
      const existing = entries.get(account.pubkey);
      entries.set(account.pubkey, {
        key: account.pubkey,
        signer: account.signer || existing?.signer === true,
        writable: account.writable || existing?.writable === true,
      });
    }
    if (!entries.has(plan.programId)) entries.set(plan.programId, { key: plan.programId, signer: false, writable: false });
  }
  const ordered = [...entries.values()].sort((left, right) =>
    Number(right.signer) - Number(left.signer) || Number(right.writable) - Number(left.writable));
  const loaded = useLookupTable ? ordered.filter((entry) => !entry.signer && entry.writable) : [];
  const staticEntries = ordered.filter((entry) => !loaded.includes(entry));
  const accountKeys = staticEntries.map((entry) => entry.key);
  const allKeys = [...accountKeys, ...loaded.map((entry) => entry.key)];
  const instructions = plans.map((plan) => ({
    programIdIndex: allKeys.indexOf(plan.programId),
    accounts: plan.accounts.map((account) => allKeys.indexOf(account.pubkey)),
    data: getBase58Decoder().decode(Buffer.from(plan.dataHex, 'hex')),
  }));
  return {
    blockTime: BigInt(NOW / 1000 + 1),
    slot: 100n,
    meta: {
      err: null as unknown,
      loadedAddresses: { writable: loaded.map((entry) => entry.key), readonly: [] as string[] },
    },
    transaction: {
      signatures: [SIGNATURE],
      message: {
        header: {
          numRequiredSignatures: staticEntries.filter((entry) => entry.signer).length,
          numReadonlySignedAccounts: staticEntries.filter((entry) => entry.signer && !entry.writable).length,
          numReadonlyUnsignedAccounts: staticEntries.filter((entry) => !entry.signer && !entry.writable).length,
        },
        accountKeys,
        instructions,
      },
    },
  };
}

function setup() {
  const db = new DatabaseSync(':memory:');
  const repository = new PaymentRepository(db);
  let response: unknown;
  let walletLinked = true;
  let now = NOW;
  const calls: unknown[] = [];
  const rpc: PaymentTransactionRpc = {
    getTransaction: (signature, config) => {
      calls.push({ signature, config });
      return { send: async () => response };
    },
  };
  const service = new PaymentService({
    repository,
    wallets: {
      requireLinked: (userId, wallet) => {
        if (!walletLinked || userId !== USER || wallet !== WALLET) throw new ApiError(403, 'Wallet is not linked');
      },
    },
    instructions: {
      pledge: (input) => pledgePlan({
        donor: input.donor as typeof WALLET,
        campaign: input.campaign as typeof CAMPAIGN,
        amount: BigInt(input.amount),
      }),
    },
    verifier: new RpcPaymentVerifier('http://localhost:8899', rpc),
    cluster: 'devnet',
    now: () => now,
  });
  return {
    db, service, repository, calls,
    setResponse: (value: unknown) => { response = value; },
    unlink: () => { walletLinked = false; },
    setNow: (value: number) => { now = value; },
    create: () => service.create(USER, { campaign: CAMPAIGN, wallet: WALLET, amount: '1000000000' }),
  };
}

const rejectsWithStatus = (status: number) => (error: unknown): boolean =>
  error instanceof ApiError && error.status === status;

test('payments persist an unsigned pledge and unique signer-bound reference for a linked wallet', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const first = await fixture.create();
  const second = await fixture.create();
  assert.equal(first.status, 'pending');
  assert.equal(first.signature, null);
  assert.equal(first.expiresAt - first.createdAt, 15 * 60);
  assert.equal(first.wallet, WALLET);
  assert.equal(first.cluster, 'devnet');
  assert.notEqual(first.reference, second.reference);
  assert.equal(Buffer.from(first.memoInstruction.dataHex, 'hex').toString('utf8'), first.reference);
  assert.deepEqual(first.memoInstruction.accounts, [{ pubkey: WALLET, signer: true, writable: false }]);
  assert.deepEqual(new PaymentRepository(fixture.db).get(USER, first.id), first);
  assert.equal(fixture.service.list(USER).length, 2);
  assert.deepEqual(fixture.service.list(OTHER_USER), []);
  assert.equal(fixture.calls.length, 0);
});

test('payments reject unlinked wallets, invalid addresses, zero, unsafe numeric values and u64 overflow', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  for (const amount of ['0', '-1', '1.5', '01', '18446744073709551616', 1000]) {
    await assert.rejects(fixture.service.create(USER, {
      campaign: CAMPAIGN, wallet: WALLET, amount: amount as string,
    }), rejectsWithStatus(400));
  }
  await assert.rejects(fixture.service.create(USER, {
    campaign: 'invalid', wallet: WALLET, amount: '1',
  }), rejectsWithStatus(400));
  fixture.unlink();
  await assert.rejects(fixture.create(), rejectsWithStatus(403));
  assert.deepEqual(fixture.service.list(USER), []);
});

test('confirmation requires finalized success and persists settlement idempotently', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  fixture.setResponse(null);
  await assert.rejects(fixture.service.confirm(USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(409));
  assert.equal(fixture.service.get(USER, payment.id).status, 'pending');
  fixture.setResponse(transactionFor(payment));
  fixture.setNow(NOW + 2000);
  const confirmed = await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.signature, SIGNATURE);
  assert.equal(confirmed.confirmedAt, NOW / 1000 + 2);
  assert.deepEqual(fixture.calls[1], {
    signature: SIGNATURE,
    config: { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 1 },
  });
  const callCount = fixture.calls.length;
  assert.deepEqual(await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE }), confirmed);
  assert.equal(fixture.calls.length, callCount);
  await assert.rejects(fixture.service.confirm(USER, payment.id, { signature: OTHER_SIGNATURE }), rejectsWithStatus(409));
});

test('confirmation resolves v0/v1 loaded lookup table accounts', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  const transaction = transactionFor(payment, true);
  assert.ok(transaction.meta.loadedAddresses.writable.length > 0);
  fixture.setResponse(transaction);
  assert.equal((await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE })).status, 'confirmed');
});

test('confirmation rejects failed, unsigned, mismatched and expired transactions', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  const cases: Array<[string, (transaction: RawTransaction) => void]> = [
    ['failure', (transaction) => { transaction.meta.err = { InstructionError: [0, 'Custom'] }; }],
    ['signature mismatch', (transaction) => { transaction.transaction.signatures[0] = OTHER_SIGNATURE; }],
    ['unsigned wallet', (transaction) => { transaction.transaction.message.header.numRequiredSignatures = 0; }],
    ['wrong campaign', (transaction) => {
      const keys = transaction.transaction.message.accountKeys;
      keys[keys.indexOf(CAMPAIGN)] = OTHER_ACCOUNT;
    }],
    ['wrong amount', (transaction) => {
      const data = Buffer.from(payment.instruction.dataHex, 'hex');
      data.writeBigUInt64LE(1n, 8);
      transaction.transaction.message.instructions[0]!.data = getBase58Decoder().decode(data);
    }],
    ['wrong program', (transaction) => { transaction.transaction.message.instructions[0]!.programIdIndex = 0; }],
    ['missing pledge', (transaction) => { transaction.transaction.message.instructions.shift(); }],
    ['missing memo', (transaction) => { transaction.transaction.message.instructions.pop(); }],
    ['wrong reference', (transaction) => {
      transaction.transaction.message.instructions[1]!.data = getBase58Decoder().decode(Buffer.from('another-payment'));
    }],
    ['unsigned memo signer', (transaction) => {
      transaction.transaction.message.instructions[1]!.accounts = [];
    }],
    ['expired', (transaction) => { transaction.blockTime = BigInt(payment.expiresAt + 1); }],
  ];
  for (const [name, mutate] of cases) {
    const transaction = transactionFor(payment);
    mutate(transaction);
    fixture.setResponse(transaction);
    await assert.rejects(fixture.service.confirm(USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(422), name);
    assert.equal(fixture.service.get(USER, payment.id).status, 'pending', name);
  }
});

test('an old pledge cannot settle a new intent with the same campaign, wallet and amount', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const old = await fixture.create();
  const current = await fixture.create();
  fixture.setResponse(transactionFor(old));
  await assert.rejects(fixture.service.confirm(USER, current.id, { signature: SIGNATURE }), rejectsWithStatus(422));
  await fixture.service.confirm(USER, old.id, { signature: SIGNATURE });
  await assert.rejects(fixture.service.confirm(USER, current.id, { signature: SIGNATURE }), rejectsWithStatus(409));
});

test('only the payment owner may retrieve or confirm it', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  assert.throws(() => fixture.service.get(OTHER_USER, payment.id), rejectsWithStatus(404));
  await assert.rejects(fixture.service.confirm(OTHER_USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(404));
  assert.equal(fixture.calls.length, 0);
});

test('reusing the database on another cluster cannot settle an existing payment', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  let verificationCalls = 0;
  const changedCluster = new PaymentService({
    repository: fixture.repository,
    wallets: { requireLinked: () => undefined },
    instructions: { pledge: async () => payment.instruction },
    verifier: { verify: async () => { verificationCalls += 1; } },
    cluster: 'localnet',
    now: () => NOW,
  });
  await assert.rejects(changedCluster.confirm(USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(409));
  assert.equal(verificationCalls, 0);
  assert.equal(fixture.service.get(USER, payment.id).status, 'pending');
  fixture.setResponse(transactionFor(payment));
  await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE });
  await assert.rejects(changedCluster.confirm(USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(409));
  assert.equal(verificationCalls, 0);
});

test('a finalized transaction within its validity period may be confirmed after expiry', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  fixture.setResponse(transactionFor(payment));
  fixture.setNow((payment.expiresAt + 60) * 1000);
  assert.equal((await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE })).status, 'confirmed');
});

test('Solana estimated block time may precede intent creation while the unique memo binds settlement', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  const transaction = transactionFor(payment);
  transaction.blockTime = BigInt(payment.createdAt - 5);
  fixture.setResponse(transaction);
  assert.equal((await fixture.service.confirm(USER, payment.id, { signature: SIGNATURE })).status, 'confirmed');
});

test('malformed RPC data cannot mark an intent paid', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const payment = await fixture.create();
  for (const response of [undefined, {}, { meta: { err: null }, transaction: { message: { header: {} } } }]) {
    fixture.setResponse(response);
    await assert.rejects(fixture.service.confirm(USER, payment.id, { signature: SIGNATURE }), rejectsWithStatus(422));
  }
  assert.equal(fixture.service.get(USER, payment.id).status, 'pending');
});

test('payment HTTP API authenticates requests, isolates accounts, and settles from chain data', async (t) => {
  const fixture = setup();
  t.after(() => fixture.db.close());
  const app = express();
  app.use(express.json());
  app.use('/api/accounts/payments', new PaymentEndpoints(fixture.service, (req, res, next) => {
    const user = req.header('x-test-user');
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.locals.user = { id: user };
    next();
  }).router);
  app.use(errorHandler);
  const testFetch = createTestFetch(app);
  const base = 'http://backend.test/api/accounts/payments';
  const request = async (path: string, user?: string, body?: unknown) => {
    const response = await testFetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('')).status, 401);
  assert.equal((await request('', USER, { campaign: CAMPAIGN, wallet: WALLET, amount: 1 })).status, 422);
  const created = await request('', USER, { campaign: CAMPAIGN, wallet: WALLET, amount: '1000000000' });
  assert.equal(created.status, 201);
  const payment = created.body as PaymentDto;
  assert.equal(payment.instruction.name, 'pledge');
  assert.equal(payment.memoInstruction.name, 'payment_reference');
  assert.equal(((await request('', USER)).body as PaymentDto[]).length, 1);
  assert.deepEqual((await request('', OTHER_USER)).body, []);
  assert.equal((await request(`/${payment.id}`, OTHER_USER)).status, 404);
  assert.equal((await request(`/${payment.id}/confirm`, OTHER_USER, { signature: SIGNATURE })).status, 404);
  fixture.setResponse(null);
  assert.equal((await request(`/${payment.id}/confirm`, USER, { signature: SIGNATURE })).status, 409);
  fixture.setResponse(transactionFor(payment));
  const settled = await request(`/${payment.id}/confirm`, USER, { signature: SIGNATURE });
  assert.equal(settled.status, 200);
  assert.equal((settled.body as PaymentDto).status, 'confirmed');
  assert.equal(((await request(`/${payment.id}`, USER)).body as PaymentDto).signature, SIGNATURE);
});
