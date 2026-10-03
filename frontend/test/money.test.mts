import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSol, formatSol, CAMPAIGN_SIZE, MAX_DONORS } from '../app/lib/charity-vault.ts';
test('money', () => { assert.equal(parseSol('1.5'), 1_500_000_000n); assert.equal(formatSol(1_500_000_000n), '1.5'); });
test('size', () => { assert.equal(CAMPAIGN_SIZE, 8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32 + 1); });
