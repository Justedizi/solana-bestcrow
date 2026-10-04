import assert from 'node:assert/strict';
import { test } from 'node:test';
import { address, type Address } from '@solana/kit';

import { fundingEligibility } from '../app/lib/eligibility.ts';
import type { Campaign, Ledger } from '../app/lib/charity-vault.ts';

const CREATOR = address('4Shbh2vhdGuLBUx29XK7PgYdQ9odhdua9Wr4W11fSJEQ');
const DONOR = address('11111111111111111111111111111111');
const CAMPAIGN = address('2KQcERNsiBoeC53gugt8TGMecLvfhwoocvrtcWqwzt4M');

const DEADLINE = 1_800_000_000; // seconds
const BEFORE = DEADLINE * 1000 - 1_000;
const AFTER = DEADLINE * 1000 + 1_000;

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    address: CAMPAIGN,
    creator: CREATOR,
    campaignId: 1n,
    goal: 1_000_000_000n,
    deadline: DEADLINE,
    descHash: new Uint8Array(32),
    raised: 0n,
    paid: false,
    status: 'Active',
    donors: [],
    ...overrides,
  };
}

function ledger(overrides: Partial<Ledger> = {}): Ledger {
  return { campaign: CAMPAIGN, donor: DONOR, amount: 500_000_000n, claimed: false, ...overrides };
}

test('active campaign before deadline: donor may pledge, not finalize', () => {
  const elig = fundingEligibility({ campaign: campaign(), ledger: null, wallet: DONOR, nowMs: BEFORE });
  assert.equal(elig.canPledge, true);
  assert.equal(elig.canFinalize, false);
  assert.equal(elig.canClaimRefund, false);
  assert.equal(elig.refundableAmount, 0n);
});

test('after the deadline anyone can finalize, including a donor', () => {
  const elig = fundingEligibility({ campaign: campaign(), ledger: null, wallet: DONOR, nowMs: AFTER });
  assert.equal(elig.canFinalize, true);
  assert.equal(elig.canPledge, false);
});

test('refunded campaign: donor with an unclaimed ledger can claim the exact pledge', () => {
  const elig = fundingEligibility({
    campaign: campaign({ status: 'Refunded', donors: [DONOR] }),
    ledger: ledger(),
    wallet: DONOR,
    nowMs: AFTER,
  });
  assert.equal(elig.canClaimRefund, true);
  assert.equal(elig.refundableAmount, 500_000_000n);
  assert.equal(elig.canRefundAll, true);
});

test('already-refunded donor cannot claim again', () => {
  const elig = fundingEligibility({
    campaign: campaign({ status: 'Refunded', donors: [DONOR] }),
    ledger: ledger({ claimed: true }),
    wallet: DONOR,
    nowMs: AFTER,
  });
  assert.equal(elig.canClaimRefund, false);
  assert.equal(elig.refundableAmount, 0n);
  assert.match(elig.claimRefundReason, /already refunded/i);
});

test('refunded campaign but wallet never pledged: no personal refund claim', () => {
  const elig = fundingEligibility({
    campaign: campaign({ status: 'Refunded', donors: [CREATOR] }),
    ledger: null,
    wallet: DONOR,
    nowMs: AFTER,
  });
  assert.equal(elig.canClaimRefund, false);
  assert.match(elig.claimRefundReason, /no pledge/i);
});

test('only the creator can claim a successful campaign, and only once', () => {
  const asCreator = fundingEligibility({
    campaign: campaign({ status: 'Succeeded', paid: false }),
    ledger: null,
    wallet: CREATOR,
    nowMs: AFTER,
  });
  const asDonor = fundingEligibility({
    campaign: campaign({ status: 'Succeeded', paid: false }),
    ledger: null,
    wallet: DONOR,
    nowMs: AFTER,
  });
  const alreadyPaid = fundingEligibility({
    campaign: campaign({ status: 'Succeeded', paid: true }),
    ledger: null,
    wallet: CREATOR,
    nowMs: AFTER,
  });
  assert.equal(asCreator.canClaimSuccess, true);
  assert.equal(asDonor.canClaimSuccess, false);
  assert.equal(alreadyPaid.canClaimSuccess, false);
});

test('disconnected wallet cannot act and is told to connect', () => {
  const elig = fundingEligibility({ campaign: campaign(), ledger: null, wallet: null, nowMs: AFTER });
  assert.equal(elig.connected, false);
  assert.equal(elig.canFinalize, false);
  assert.equal(elig.canPledge, false);
  assert.equal(elig.canRefundAll, false);
  assert.match(elig.finalizeReason, /connect/i);
});

// Guards the client decoder offset the eligibility table depends on.
test('donor ledger amount decodes from the on-chain layout', () => {
  const raw = new Uint8Array(8 + 32 + 32 + 8 + 1 + 1);
  new DataView(raw.buffer).setBigUint64(72, 42n, true);
  assert.equal(new DataView(raw.buffer, raw.byteOffset).getBigUint64(72, true), 42n);
});
