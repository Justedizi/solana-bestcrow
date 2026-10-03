import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAddressEncoder, type Address } from '@solana/kit';
import {
  CAMPAIGN_ACCOUNT_SIZE,
  CAMPAIGN_DISCRIMINATOR,
  DONOR_LEDGER_ACCOUNT_SIZE,
  DONOR_LEDGER_DISCRIMINATOR,
  claimRefundPlan,
  decodeCampaignAccount,
  decodeDonorLedger,
  finalizePlan,
  fromHex,
  getCampaignPda,
  getDonorLedgerPda,
  getVaultPda,
  instructionDiscriminators,
  pledgePlan,
  refundAllPlan,
  sha256,
  toHex,
} from '../src/solana/program.js';
import { verifyDescription } from '../src/services/campaigns.js';

const encoder = getAddressEncoder();

const CREATOR = 'F1EjmWkLJRSYqzwswQCDDADPE8mXNrgiX8AEq17PBdW3' as Address;
const CAMPAIGN = 'So11111111111111111111111111111111111111112' as Address;
const DONOR = '11111111111111111111111111111111' as Address;
const DONOR_TWO = 'SysvarRent111111111111111111111111111111111' as Address;

function writeAddress(target: Uint8Array, offset: number, value: Address): void {
  target.set(encoder.encode(value), offset);
}

function writeU64(target: Uint8Array, offset: number, value: bigint): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setBigUint64(offset, value, true);
}

function writeI64(target: Uint8Array, offset: number, value: bigint): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setBigInt64(offset, value, true);
}

function buildCampaign(options: {
  creator?: Address;
  campaignId?: bigint;
  goal?: bigint;
  deadline?: bigint;
  raised?: bigint;
  paid?: boolean;
  status?: number;
  donors?: Address[];
} = {}): Uint8Array {
  const data = new Uint8Array(CAMPAIGN_ACCOUNT_SIZE);
  data.set(CAMPAIGN_DISCRIMINATOR, 0);
  writeAddress(data, 8, options.creator ?? CREATOR);
  writeU64(data, 40, options.campaignId ?? 42n);
  writeU64(data, 48, options.goal ?? 1_000_000_000n);
  writeI64(data, 56, options.deadline ?? 2_000_000_000n);
  data.set(fromHex('ab'.repeat(32)), 64);
  writeU64(data, 96, options.raised ?? 500n);
  data[104] = options.paid ? 1 : 0;
  data[105] = options.status ?? 0;
  const donors = options.donors ?? [DONOR, DONOR_TWO];
  data[106] = donors.length;
  donors.forEach((donor, index) => writeAddress(data, 107 + index * 32, donor));
  data[CAMPAIGN_ACCOUNT_SIZE - 1] = 254;
  return data;
}

function buildLedger(campaign: Address, donor: Address, amount: bigint, claimed: boolean): Uint8Array {
  const data = new Uint8Array(DONOR_LEDGER_ACCOUNT_SIZE);
  data.set(DONOR_LEDGER_DISCRIMINATOR, 0);
  writeAddress(data, 8, campaign);
  writeAddress(data, 40, donor);
  writeU64(data, 72, amount);
  data[80] = claimed ? 1 : 0;
  data[81] = 253;
  return data;
}

test('instruction discriminators match the published IDL', () => {
  assert.equal(toHex(instructionDiscriminators.createCampaign), '6f83bb62a0c172f4');
  assert.equal(toHex(instructionDiscriminators.pledge), 'eb2f9cfe0058d48e');
  assert.equal(toHex(instructionDiscriminators.finalize), 'ab3dda387f730cd9');
  assert.equal(toHex(instructionDiscriminators.claimSuccess), 'fdec213446628f57');
  assert.equal(toHex(instructionDiscriminators.claimRefund), '0f101ea1ffe4613c');
  assert.equal(toHex(instructionDiscriminators.refundAll), 'ae57de7e173bbd9b');
});

test('account discriminators match the account names', () => {
  assert.equal(toHex(CAMPAIGN_DISCRIMINATOR), 'a706cdb7dc9cc871');
  assert.equal(toHex(DONOR_LEDGER_DISCRIMINATOR), 'f0595dee7793d62f');
});

test('decodeCampaignAccount round-trips all fields', () => {
  const decoded = decodeCampaignAccount(CAMPAIGN, buildCampaign());
  assert.ok(decoded);
  assert.equal(decoded.creator, CREATOR);
  assert.equal(decoded.campaignId, 42n);
  assert.equal(decoded.goal, 1_000_000_000n);
  assert.equal(decoded.deadline, 2_000_000_000n);
  assert.equal(decoded.raised, 500n);
  assert.equal(decoded.status, 'active');
  assert.equal(decoded.donorCount, 2);
  assert.deepEqual(decoded.donors, [DONOR, DONOR_TWO]);
  assert.equal(decoded.bump, 254);
});

test('decodeCampaignAccount rejects wrong discriminator and wrong size', () => {
  const wrong = buildCampaign();
  wrong[0] = 0;
  assert.equal(decodeCampaignAccount(CAMPAIGN, wrong), null);
  assert.equal(decodeCampaignAccount(CAMPAIGN, buildCampaign().subarray(0, 100)), null);
});

test('decodeCampaignAccount rejects an out-of-range status', () => {
  assert.equal(decodeCampaignAccount(CAMPAIGN, buildCampaign({ status: 9 })), null);
});

test('decodeDonorLedger round-trips all fields', () => {
  const decoded = decodeDonorLedger(DONOR, buildLedger(CAMPAIGN, DONOR, 123n, true));
  assert.ok(decoded);
  assert.equal(decoded.campaign, CAMPAIGN);
  assert.equal(decoded.donor, DONOR);
  assert.equal(decoded.amount, 123n);
  assert.equal(decoded.claimed, true);
  assert.equal(decoded.bump, 253);
});

test('PDA derivation is deterministic and seed-dependent', async () => {
  const first = await getCampaignPda(CREATOR, 1n);
  const second = await getCampaignPda(CREATOR, 1n);
  const third = await getCampaignPda(CREATOR, 2n);
  assert.equal(first, second);
  assert.notEqual(first, third);

  const vault = await getVaultPda(first);
  assert.notEqual(vault, first);

  const ledger = await getDonorLedgerPda(first, DONOR);
  assert.equal(ledger, await getDonorLedgerPda(first, DONOR));
  assert.notEqual(ledger, await getDonorLedgerPda(first, DONOR_TWO));
});

test('instruction plans expose the expected accounts', async () => {
  const pledge = await pledgePlan({ donor: DONOR, campaign: CAMPAIGN, amount: 10n });
  assert.equal(pledge.accounts.length, 5);
  assert.equal(pledge.accounts[0]!.signer, true);
  assert.equal(pledge.accounts[0]!.writable, true);
  assert.equal(pledge.dataHex, 'eb2f9cfe0058d48e' + '0a00000000000000');

  const finalize = finalizePlan({ caller: DONOR, campaign: CAMPAIGN });
  assert.equal(finalize.accounts.length, 2);
  assert.equal(finalize.dataHex, 'ab3dda387f730cd9');

  const refundAll = await refundAllPlan({ caller: DONOR, campaign: CAMPAIGN, donors: [DONOR, DONOR_TWO] });
  assert.equal(refundAll.accounts.length, 3 + 4);
  assert.equal(refundAll.dataHex, 'ae57de7e173bbd9b');

  const claim = await claimRefundPlan({ donor: DONOR, campaign: CAMPAIGN });
  assert.equal(claim.accounts.length, 4);
});

test('verifyDescription accepts a matching hash and rejects a mismatch', () => {
  const description = 'Help us build a community garden';
  const hashHex = toHex(sha256(description));
  assert.equal(verifyDescription(hashHex, description), true);
  assert.equal(verifyDescription(hashHex, `  ${description}  `), true);
  assert.equal(verifyDescription(hashHex, 'tampered description'), false);
});

test('hex helpers round-trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(fromHex(toHex(bytes)), bytes);
});
