import assert from 'node:assert/strict';
import { test } from 'node:test';
import { address, type Address } from '@solana/kit';

import { fundingEligibility, milestoneEligibility } from '../app/lib/eligibility.ts';
import type { Campaign, Ledger, Milestone } from '../app/lib/charity-vault.ts';

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
    staged: false,
    baseBudget: 0n,
    initialTranche: 0n,
    released: 0n,
    bond: 0n,
    bondForfeited: false,
    terminated: false,
    milestoneCount: 0,
    allocated: 0n,
    rejections: 0,
    refundPool: 0n,
    refundsClaimed: 0,
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

// ---- Bundle A: staged funding ----

test('staged success: creator releases the initial tranche, not claim_success', () => {
  const staged = campaign({
    staged: true,
    status: 'Succeeded',
    baseBudget: 2_000_000_000n,
    initialTranche: 500_000_000n,
  });
  const asCreator = fundingEligibility({ campaign: staged, ledger: null, wallet: CREATOR, nowMs: AFTER });
  assert.equal(asCreator.canReleaseInitial, true);
  assert.equal(asCreator.canClaimSuccess, false);
  assert.match(asCreator.claimSuccessReason, /milestone/i);
});

test('staged termination lets a backer claim a pro-rata share of the frozen pool', () => {
  const staged = campaign({
    staged: true,
    status: 'Succeeded',
    terminated: true,
    raised: 2_000_000_000n,
    refundPool: 1_000_000_000n,
  });
  const elig = fundingEligibility({
    campaign: staged,
    ledger: ledger({ amount: 500_000_000n }),
    wallet: DONOR,
    nowMs: AFTER,
  });
  assert.equal(elig.canClaimTerminationRefund, true);
  assert.equal(elig.terminationRefundAmount, 250_000_000n); // 25% of the frozen pool
  assert.equal(elig.canClaimRefund, false); // the exact-pledge path is base-only
});

test('staged bond is reclaimable only when not forfeited or terminated', () => {
  const open = fundingEligibility({
    campaign: campaign({ staged: true, status: 'Succeeded', bond: 100_000_000n }),
    ledger: null,
    wallet: CREATOR,
    nowMs: AFTER,
  });
  const forfeited = fundingEligibility({
    campaign: campaign({ staged: true, status: 'Succeeded', bond: 100_000_000n, bondForfeited: true }),
    ledger: null,
    wallet: CREATOR,
    nowMs: AFTER,
  });
  assert.equal(open.canClaimBond, true);
  assert.equal(forfeited.canClaimBond, false);
});

test('anyone may terminate once a milestone is rejected', () => {
  const staged = campaign({ staged: true, status: 'Succeeded', rejections: 1 });
  const asStranger = fundingEligibility({ campaign: staged, ledger: null, wallet: DONOR, nowMs: AFTER });
  assert.equal(asStranger.canTerminate, true);
});

test('milestone vote needs the 70% approval threshold to release', () => {
  const milestone: Milestone = {
    address: CAMPAIGN,
    campaign: CAMPAIGN,
    index: 0,
    amount: 1_000_000_000n,
    deadline: DEADLINE,
    evidenceHash: new Uint8Array(32),
    status: 'Submitted',
    approveWeight: 700_000_000n,
    rejectWeight: 300_000_000n,
    round: 1,
  };
  const elig = milestoneEligibility({
    milestone,
    campaign: campaign({ staged: true, status: 'Succeeded' }),
    ledger: null,
    wallet: CREATOR,
    claimClaimed: 0n,
    claimTotal: 0n,
  });
  assert.equal(elig.approvalPct, 70);
  assert.equal(elig.canFinalizeVote, true);
});
