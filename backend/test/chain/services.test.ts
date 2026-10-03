import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { type Address } from '@solana/kit';
import type { RequestHandler } from 'express';
import { Store } from '../../src/db/index.js';
import { config } from '../../src/config.js';
import {
  ChainSector, CampaignsEndpoints, CampaignsService, InstructionsService, SystemService,
} from '../../src/sectors/chain/index.js';
import { ApiError } from '../../src/api/middleware/error.js';
import {
  PROGRAM_ID, createCampaignPlan, getCampaignPda, parseBigInt, pledgePlan,
  sha256, toHex, type CampaignAccount,
} from '../../src/solana/program.js';

const CREATOR = '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG' as Address;
const CAMPAIGN = 'So11111111111111111111111111111111111111112' as Address;
const SECOND_CAMPAIGN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
const DONOR = '11111111111111111111111111111111' as Address;
const SECOND_DONOR = 'SysvarRent111111111111111111111111111111111' as Address;
const DESCRIPTION = 'A community campaign';
const NOW = 1_700_000_000_000;

function campaignAccount(): CampaignAccount {
  return {
    address: CAMPAIGN, creator: CREATOR, campaignId: 1n, goal: 1_000n,
    deadline: 2_000_000_000n, descHash: sha256(DESCRIPTION), raised: 100n,
    paid: false, status: 'refunded', donorCount: 2,
    donors: [DONOR, SECOND_DONOR], bump: 254,
  };
}

function seed(store: Store, address: string = CAMPAIGN, raised = 100n): void {
  store.upsertCampaign({
    address, creator: CREATOR, campaignId: address === CAMPAIGN ? 1n : 2n,
    goal: 1_000n, deadline: 2_000_000_000n, descHash: toHex(sha256(DESCRIPTION)),
    raised, paid: false, status: 'active', donorCount: 0, bump: 254,
    vault: null, vaultLamports: 0n, slot: 100,
  });
}

function isStatus(status: number): (error: unknown) => boolean {
  return (error) => error instanceof ApiError && error.status === status;
}

test('standalone campaign endpoints reject metadata writes when no authorization dependency is supplied', () => {
  const store = new Store(':memory:');
  try {
    const endpoints = new CampaignsEndpoints(new CampaignsService(store));
    const layers = endpoints.router.stack as Array<{
      route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> };
    }>;
    const route = layers.find((layer) => layer.route?.path === '/:address/metadata' && layer.route.methods.put)?.route;
    assert.ok(route);
    let error: unknown;
    route.stack[0]!.handle({} as Parameters<RequestHandler>[0], {} as Parameters<RequestHandler>[1], (failure) => { error = failure; });
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Metadata updates require an authenticated account');
  } finally {
    store.close();
  }
});

test('chain sector composes injected services with the authoritative runtime network', () => {
  const store = new Store(':memory:');
  try {
    const sector = new ChainSector(store, {
      network: { programId: PROGRAM_ID, cluster: config.cluster, rpcUrl: config.rpcUrl },
      events: new EventEmitter(), now: () => NOW, uptime: () => 42.9,
    });
    assert.ok(sector.campaigns instanceof CampaignsService);
    assert.ok(sector.instructions instanceof InstructionsService);
    assert.deepEqual(sector.system.config().transactionVersions, [0, 1]);
    assert.equal(sector.system.config().cluster, config.cluster);
    assert.equal(sector.system.config().programId, PROGRAM_ID);
    assert.equal(sector.system.config().rpcUrl, config.rpcUrl);
    assert.equal(sector.system.health().uptimeSeconds, 42);
    assert.equal(sector.system.health().timestamp, new Date(NOW).toISOString());
  } finally {
    store.close();
  }
});

test('chain sector refuses advertised network overrides that differ from instruction and RPC configuration', () => {
  const store = new Store(':memory:');
  try {
    for (const override of [
      { programId: DONOR },
      { cluster: `${config.cluster}-different` },
      { rpcUrl: 'https://different.example.test' },
    ]) {
      assert.throws(() => new ChainSector(store, {
        network: { programId: PROGRAM_ID, cluster: config.cluster, rpcUrl: config.rpcUrl, ...override },
      }), /Chain network must match the runtime configuration/);
    }
  } finally {
    store.close();
  }
});

test('campaign metadata patches preserve the committed description and verified flag', () => {
  const store = new Store(':memory:');
  try {
    seed(store);
    const service = new CampaignsService(store);
    service.updateMetadata(CAMPAIGN, { title: 'Fund', description: DESCRIPTION, rewards: [{ title: 'Badge' }] });
    const updated = service.updateMetadata(CAMPAIGN, { title: 'Renamed fund' });
    assert.equal(updated.title, 'Renamed fund');
    assert.equal(updated.description, DESCRIPTION);
    assert.equal(updated.verified, true);
    assert.deepEqual(updated.rewards, [{ title: 'Badge' }]);
    assert.throws(() => service.updateMetadata(CAMPAIGN, { description: 'tampered' }), isStatus(409));
    assert.equal(service.metadata(CAMPAIGN)!.description, DESCRIPTION);
  } finally {
    store.close();
  }
});

test('campaign sorting compares lamports above Number.MAX_SAFE_INTEGER without rounding', () => {
  const store = new Store(':memory:');
  try {
    seed(store, CAMPAIGN, 9_007_199_254_740_992n);
    seed(store, SECOND_CAMPAIGN, 9_007_199_254_740_993n);
    const service = new CampaignsService(store);
    const page = service.list({ sort: 'raised', order: 'desc', limit: 1 });
    assert.equal(page.items[0]!.address, SECOND_CAMPAIGN);
    assert.equal(page.total, 2);
    assert.equal(service.getByPda(CREATOR, '01')!.address, CAMPAIGN);
    assert.throws(() => service.list({ limit: Infinity }), isStatus(400));
  } finally {
    store.close();
  }
});

test('class instruction builders require only public addresses and never read a signer', async () => {
  let accountReads = 0;
  const service = new InstructionsService(async () => { accountReads += 1; throw new Error('No RPC expected'); }, () => NOW);
  const plan = await service.pledge({ donor: DONOR, campaign: CAMPAIGN, amount: '10' });
  assert.equal(plan.accounts[0]!.pubkey, DONOR);
  assert.equal(plan.accounts[0]!.signer, true);
  assert.equal(plan.dataHex, 'eb2f9cfe0058d48e0a00000000000000');
  assert.equal(accountReads, 0);
  const create = await service.create({ creator: CREATOR, campaignId: '1', goal: '10', deadline: '2000000000' });
  assert.equal(create.name, 'create_campaign');
  assert.equal(create.dataHex.length, (8 + 8 + 8 + 8 + 32) * 2);
  assert.equal(accountReads, 0);
});

test('instruction API rejects u64 overflow, zero amounts, malformed numbers and signed deadline overflow', async () => {
  const service = new InstructionsService(undefined, () => NOW);
  for (const amount of ['18446744073709551616', '-1', '0', '1.5', '1e9']) {
    await assert.rejects(service.pledge({ donor: DONOR, campaign: CAMPAIGN, amount }), isStatus(400));
  }
  for (const deadline of ['9223372036854775808', '-9223372036854775809', '1700000000']) {
    await assert.rejects(service.create({ creator: CREATOR, campaignId: '1', goal: '10', deadline }), isStatus(400));
  }
  await assert.rejects(service.create({ creator: CREATOR, campaignId: '18446744073709551616', goal: '10', deadline: '2000000000' }), isStatus(400));
  await assert.rejects(service.create({ creator: CREATOR, campaignId: '1', goal: '10', deadline: '2000000000', descHash: 'ab' }), isStatus(400));
});

test('low-level encoders reject overflow instead of silently truncating u64 and i64', async () => {
  await assert.rejects(getCampaignPda(CREATOR, -1n), RangeError);
  await assert.rejects(getCampaignPda(CREATOR, 1n << 64n), RangeError);
  await assert.rejects(pledgePlan({ donor: DONOR, campaign: CAMPAIGN, amount: 1n << 64n }), RangeError);
  await assert.rejects(createCampaignPlan({ creator: CREATOR, campaignId: 1n, goal: 10n, deadline: 1n << 63n, descHash: new Uint8Array(32) }), RangeError);
  assert.throws(() => parseBigInt(Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => parseBigInt(1.5), RangeError);
  assert.equal(parseBigInt('18446744073709551615'), (1n << 64n) - 1n);
});

test('refundAll uses on-chain donor order and includes previously closed donor ledgers', async () => {
  const service = new InstructionsService(async (address) => {
    assert.equal(address, CAMPAIGN);
    return campaignAccount();
  });
  const plan = await service.refundAll({ caller: DONOR, campaign: CAMPAIGN });
  assert.equal(plan.accounts[0]!.writable, true);
  assert.equal(plan.accounts[5]!.pubkey, DONOR);
  assert.equal(plan.accounts[7]!.pubkey, SECOND_DONOR);
  assert.equal(plan.accounts.length, 8);
});

test('refundAll reports a missing chain account and a failed reader without building a stale plan', async () => {
  await assert.rejects(new InstructionsService(async () => null).refundAll({ caller: DONOR, campaign: CAMPAIGN }), isStatus(404));
  await assert.rejects(new InstructionsService(async () => { throw new Error('RPC unavailable'); }).refundAll({ caller: DONOR, campaign: CAMPAIGN }), isStatus(503));
});

test('system service allows isolated read dependencies and cleans up stream subscriptions', () => {
  const store = new Store(':memory:');
  const events = new EventEmitter();
  try {
    const network = { programId: PROGRAM_ID, cluster: 'localnet', rpcUrl: 'http://127.0.0.1:8899' };
    const service = new SystemService(
      { getSyncState: (key) => key === 'slot' ? '123' : null },
      new CampaignsService(store), network, events,
    );
    network.cluster = 'mainnet-beta';
    assert.equal(service.health().lastIndexedSlot, 123);
    assert.equal(service.config().walletChain, null);
    const received: unknown[] = [];
    const unsubscribe = service.subscribe((event) => received.push(event));
    events.emit('sync', { slot: 124 });
    unsubscribe();
    events.emit('sync', { slot: 125 });
    assert.deepEqual(received, [{ slot: 124 }]);
    assert.equal(events.listenerCount('sync'), 0);
  } finally {
    store.close();
  }
});

test('program information projects only public network fields from wider runtime config', () => {
  const store = new Store(':memory:');
  try {
    const service = new SystemService(store, new CampaignsService(store), config, new EventEmitter());
    assert.deepEqual(Object.keys(service.program()).sort(), ['accounts', 'cluster', 'instructions', 'programId', 'rpcUrl']);
    const info = service.program() as unknown as Record<string, unknown>;
    assert.equal(info.dbPath, undefined);
    assert.equal(info.indexer, undefined);
    assert.equal(info.port, undefined);
  } finally {
    store.close();
  }
});
