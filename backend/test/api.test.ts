import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { type Address } from '@solana/kit';
import { createServer } from '../src/api/server.js';
import { Store } from '../src/db/index.js';
import { sha256, toHex } from '../src/solana/program.js';

const CREATOR = 'F1EjmWkLJRSYqzwswQCDDADPE8mXNrgiX8AEq17PBdW3' as Address;
const CAMPAIGN_ONE = 'So11111111111111111111111111111111111111112' as Address;
const CAMPAIGN_TWO = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
const DONOR = '11111111111111111111111111111111' as Address;
const DONOR_TWO = 'SysvarRent111111111111111111111111111111111' as Address;
const DESCRIPTION = 'We are building a transparent community fund.';

let store: Store;
let server: Server;
let base: string;

async function get(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
}

async function put(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  store = new Store(':memory:');
  store.upsertCampaign({
    address: CAMPAIGN_ONE,
    creator: CREATOR,
    campaignId: 1n,
    goal: 10_000_000_000n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3_600),
    descHash: toHex(sha256(DESCRIPTION)),
    raised: 3_000_000_000n,
    paid: false,
    status: 'active',
    donorCount: 2,
    bump: 254,
    vault: 'Vault111111111111111111111111111111111111111',
    vaultLamports: 3_000_000_000n,
    slot: 100,
  });
  store.upsertCampaign({
    address: CAMPAIGN_TWO,
    creator: DONOR,
    campaignId: 2n,
    goal: 5_000_000_000n,
    deadline: BigInt(Math.floor(Date.now() / 1000) - 10),
    descHash: '00'.repeat(32),
    raised: 0n,
    paid: false,
    status: 'refunded',
    donorCount: 0,
    bump: 253,
    vault: 'Vault222222222222222222222222222222222222222',
    vaultLamports: 0n,
    slot: 101,
  });
  store.upsertDonor({ campaign: CAMPAIGN_ONE, donor: DONOR, amount: 1_000_000_000n, claimed: false, bump: 252 });
  store.upsertDonor({ campaign: CAMPAIGN_ONE, donor: DONOR_TWO, amount: 2_000_000_000n, claimed: true, bump: 251 });
  store.upsertEvent({
    signature: 'signature-one',
    slot: 100,
    blockTime: 1_700_000_000,
    eventName: 'PledgeReceived',
    campaign: CAMPAIGN_ONE,
    donor: DONOR,
    amount: 1_000_000_000n,
    status: null,
    payload: JSON.stringify({ donor: DONOR, amount: '1000000000' }),
  });

  const app = createServer(store);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const info = server.address();
  if (!info || typeof info === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${info.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
});

test('GET /api/health', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.programId, CREATOR);
});

test('GET /api/program exposes discriminators', async () => {
  const { status, body } = await get('/api/program');
  assert.equal(status, 200);
  assert.equal(body.accounts.campaign.size, 620);
  assert.equal(body.instructions.pledge, 'eb2f9cfe0058d48e');
});

test('GET /api/stats aggregates campaigns', async () => {
  const { status, body } = await get('/api/stats');
  assert.equal(status, 200);
  assert.equal(body.campaigns, 2);
  assert.equal(body.active, 1);
  assert.equal(body.refunded, 1);
  assert.equal(body.totalRaised, '3000000000');
  assert.equal(body.uniqueCreators, 2);
});

test('GET /api/campaigns lists and filters', async () => {
  const all = await get('/api/campaigns');
  assert.equal(all.body.total, 2);
  const active = await get('/api/campaigns?status=active');
  assert.equal(active.body.total, 1);
  assert.equal(active.body.items[0].address, CAMPAIGN_ONE);
  const byCreator = await get(`/api/campaigns?creator=${CREATOR}`);
  assert.equal(byCreator.body.total, 1);
  const search = await get('/api/campaigns?q=does-not-exist');
  assert.equal(search.body.total, 0);
});

test('GET /api/campaigns/:address returns donors and vault', async () => {
  const { status, body } = await get(`/api/campaigns/${CAMPAIGN_ONE}`);
  assert.equal(status, 200);
  assert.equal(body.address, CAMPAIGN_ONE);
  assert.equal(body.goalSol, '10');
  assert.equal(body.raisedSol, '3');
  assert.equal(body.progress, 30);
  assert.equal(body.donors.length, 2);
  assert.equal(body.vault, 'Vault111111111111111111111111111111111111111');
});

test('GET /api/campaigns/:address rejects unknown and invalid addresses', async () => {
  assert.equal((await get(`/api/campaigns/${CAMPAIGN_TWO}`)).status, 200);
  assert.equal((await get('/api/campaigns/11111111111111111111111111111111')).status, 404);
  assert.equal((await get('/api/campaigns/not-an-address')).status, 400);
});

test('GET /api/campaigns/:address/donors sorts by amount', async () => {
  const { status, body } = await get(`/api/campaigns/${CAMPAIGN_ONE}/donors`);
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.equal(body.items[0].donor, DONOR_TWO);
  assert.equal(body.items[0].amountSol, '2');
});

test('GET /api/campaigns/:address/events returns indexed history', async () => {
  const { status, body } = await get(`/api/campaigns/${CAMPAIGN_ONE}/events`);
  assert.equal(status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.items[0].eventName, 'PledgeReceived');
});

test('GET /api/campaigns/by-pda resolves a campaign', async () => {
  const { status, body } = await get(`/api/campaigns/by-pda?creator=${CREATOR}&campaignId=1`);
  assert.equal(status, 200);
  assert.equal(body.address, CAMPAIGN_ONE);
});

test('PUT metadata verifies the on-chain description commitment', async () => {
  const mismatch = await put(`/api/campaigns/${CAMPAIGN_ONE}/metadata`, {
    title: 'Community fund',
    description: 'not the committed description',
  });
  assert.equal(mismatch.status, 409);

  const ok = await put(`/api/campaigns/${CAMPAIGN_ONE}/metadata`, {
    title: 'Community fund',
    description: DESCRIPTION,
    website: 'https://example.org',
    rewards: [{ title: 'Supporter badge', minSol: '0.1' }],
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.verified, true);
  assert.equal(ok.body.rewards[0].title, 'Supporter badge');

  const fetched = await get(`/api/campaigns/${CAMPAIGN_ONE}/metadata`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.title, 'Community fund');
});

test('PUT metadata rejects an empty body', async () => {
  const { status } = await put(`/api/campaigns/${CAMPAIGN_ONE}/metadata`, {});
  assert.equal(status, 422);
});

test('GET /api/instructions/finalize builds an unsigned plan', async () => {
  const { status, body } = await get(
    `/api/instructions/finalize?caller=${DONOR}&campaign=${CAMPAIGN_ONE}`,
  );
  assert.equal(status, 200);
  assert.equal(body.accounts.length, 2);
  assert.equal(body.dataHex, 'ab3dda387f730cd9');
});

test('GET /api/instructions/refund-all enumerates indexed donors', async () => {
  const { status, body } = await get(`/api/instructions/refund-all/${CAMPAIGN_ONE}?caller=${DONOR}`);
  assert.equal(status, 200);
  assert.equal(body.accounts.length, 3 + 4);
});

test('unknown route returns 404 JSON', async () => {
  const { status, body } = await get('/does-not-exist');
  assert.equal(status, 404);
  assert.equal(body.error, 'Not found');
});
