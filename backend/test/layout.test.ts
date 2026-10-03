import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CAMPAIGN_ACCOUNT_SIZE,
  DONOR_LEDGER_ACCOUNT_SIZE,
  MAX_DONORS,
} from '../src/solana/program.js';

// Account sizes are a cross-language contract: the Rust program decides the
// on-chain layout, while the backend and frontend decode accounts at fixed
// offsets. These tests fail loudly if the mirrors drift from the program, which
// would otherwise silently break indexing and account decoding.
const rustConstants = readFileSync(
  new URL('../../../rust/programs/charity-vault/src/constants.rs', import.meta.url),
  'utf8',
);
const frontendLib = readFileSync(
  new URL('../../../frontend/app/lib/charity-vault.ts', import.meta.url),
  'utf8',
);

const readInt = (source: string, name: string): number => {
  const match = new RegExp(`${name}(?:\\s*:\\s*\\w+)?\\s*=\\s*(\\d+)`).exec(source);
  assert.ok(match, `could not find ${name}`);
  return Number(match![1]);
};

const rustMaxDonors = readInt(rustConstants, 'MAX_DONORS');
const frontendMaxDonors = readInt(frontendLib, 'MAX_DONORS');

test('backend account layout matches the Rust program', () => {
  assert.equal(MAX_DONORS, rustMaxDonors, 'backend MAX_DONORS must match constants.rs');
  assert.equal(
    CAMPAIGN_ACCOUNT_SIZE,
    8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32 + 1,
    'CAMPAIGN_ACCOUNT_SIZE must match CampaignAccount::INIT_SPACE + discriminator',
  );
  assert.equal(DONOR_LEDGER_ACCOUNT_SIZE, 8 + 32 + 32 + 8 + 1 + 1);
});

test('frontend account layout matches the Rust program', () => {
  assert.equal(frontendMaxDonors, rustMaxDonors, 'frontend MAX_DONORS must match constants.rs');
  assert.match(
    frontendLib,
    /CAMPAIGN_SIZE\s*=\s*[^;]*MAX_DONORS\s*\*\s*32/,
    'frontend CAMPAIGN_SIZE must be derived from MAX_DONORS',
  );
});
