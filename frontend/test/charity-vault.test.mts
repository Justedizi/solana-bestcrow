import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_SIZE, formatSol, parseSol } from '../app/lib/charity-vault.ts';

// Money conversion is the fund-critical path on the client: a parsing bug sends
// the wrong amount on-chain. These cover the pure helpers before they reach the
// wallet/transaction code.
test('parseSol converts SOL strings to lamports', () => {
  assert.equal(parseSol('0.000000001'), 1n);
  assert.equal(parseSol('1'), 1_000_000_000n);
  assert.equal(parseSol('2.5'), 2_500_000_000n);
  assert.throws(() => parseSol('0'));
  assert.throws(() => parseSol('-1'));
  assert.throws(() => parseSol('1.0000000001'));
  assert.throws(() => parseSol('abc'));
});

test('formatSol round-trips lamports', () => {
  assert.equal(formatSol(1n), '0.000000001');
  assert.equal(formatSol(1_000_000_000n), '1');
  assert.equal(formatSol(2_500_000_000n), '2.5');
  assert.equal(parseSol(formatSol(123_456_789n)), 123_456_789n);
});

// Keeps the frontend decoder in step with MAX_DONORS = 12 in the Rust program.
test('campaign account size matches the on-chain layout', () => {
  assert.equal(CAMPAIGN_SIZE, 546);
});

// The fee-payer error surfaces from the RPC plugin nested several levels deep.
// These lock in the translation a user actually sees.
import { describeSendError, sendCampaignInstruction } from '../app/lib/send-campaign.ts';

function nested(codes: number[], message = 'outer'): unknown {
  let node: unknown = { name: 'SolanaError', message, context: { __code: codes[codes.length - 1] } };
  for (let i = codes.length - 2; i >= 0; i -= 1) {
    node = { name: 'SolanaError', message: 'wrapper', context: { __code: codes[i] }, cause: node };
  }
  return node;
}

test('describeSendError explains an empty fee payer', () => {
  const message = describeSendError(nested([11, 5663037, 7050003]));
  assert.match(message, /no devnet SOL/);
  assert.match(message, /faucet\.solana\.com/);
});

test('describeSendError explains a missing program', () => {
  assert.match(describeSendError(nested([7050004])), /not deployed/);
});

test('describeSendError explains a campaign ID collision', () => {
  const error = {
    context: {
      __code: -32002,
      logs: ['Program log: Instruction: CreateCampaign', 'Allocate: account address already in use'],
    },
  };
  assert.match(describeSendError(error), /already used.*new campaign ID/);
});

test('describeSendError does not hide a nested preflight cause', () => {
  const insufficientFunds = {
    context: { __code: -32002, logs: [], unitsConsumed: 0n },
    cause: { context: { __code: 7050005 } },
  };
  const expiredBlockhash = {
    context: { __code: -32002, logs: [], unitsConsumed: 0n },
    cause: { context: { __code: 7050008 } },
  };

  assert.match(describeSendError(insufficientFunds), /not have enough devnet SOL/);
  assert.match(describeSendError(expiredBlockhash), /recent blockhash/);
});

test('describeSendError falls back to the original message', () => {
  assert.equal(describeSendError(new Error('boom')), 'boom');
  assert.equal(describeSendError('nope'), 'Transaction failed');
});

test('campaign creation checks account rent before asking the wallet to sign', async () => {
  const client = {
    rpc: {
      getBalance: () => ({ send: async () => ({ value: 1n }) }),
      getMinimumBalanceForRentExemption: (size: bigint) => ({
        send: async () => size === 0n ? 20n : 100n,
      }),
    },
  };

  await assert.rejects(
    sendCampaignInstruction(client as never, 'payer' as never, {} as never, {} as never),
    /campaign creation currently needs about.*account rent/,
  );
});
