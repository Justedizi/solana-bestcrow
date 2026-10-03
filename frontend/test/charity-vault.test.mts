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
  assert.equal(CAMPAIGN_SIZE, 492);
});
