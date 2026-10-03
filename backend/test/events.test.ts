import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAddressEncoder, type Address } from '@solana/kit';
import { anchorDiscriminator } from '../src/solana/program.js';
import { decodeEventsFromLogs } from '../src/solana/events.js';

const encoder = getAddressEncoder();
const CAMPAIGN = 'So11111111111111111111111111111111111111112' as Address;
const DONOR = '11111111111111111111111111111111' as Address;

const concat = (...parts: ArrayLike<number>[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u64 = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
};

const dataLine = (payload: Uint8Array): string =>
  `Program data: ${Buffer.from(payload).toString('base64')}`;

test('decodes a PledgeReceived event from Anchor logs', () => {
  const payload = concat(
    anchorDiscriminator('event', 'PledgeReceived'),
    encoder.encode(CAMPAIGN),
    encoder.encode(DONOR),
    u64(250_000_000n),
    u64(250_000_000n),
  );
  const events = decodeEventsFromLogs({
    signature: 'sig',
    slot: 1,
    blockTime: 1_700_000_000,
    logMessages: ['Program log: Instruction: Pledge', dataLine(payload)],
    err: null,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.name, 'PledgeReceived');
  assert.equal(events[0]!.campaign, CAMPAIGN);
  assert.equal(events[0]!.donor, DONOR);
  assert.equal(events[0]!.amount, 250_000_000n);
  assert.equal(events[0]!.raised, 250_000_000n);
  assert.equal(events[0]!.payload.amount, '250000000');
});

test('decodes a CampaignFinalized status enum', () => {
  const payload = concat(
    anchorDiscriminator('event', 'CampaignFinalized'),
    encoder.encode(CAMPAIGN),
    new Uint8Array([2]),
  );
  const events = decodeEventsFromLogs({
    signature: 'sig',
    slot: 2,
    blockTime: null,
    logMessages: [dataLine(payload)],
    err: null,
  });
  assert.equal(events[0]!.name, 'CampaignFinalized');
  assert.equal(events[0]!.status, 'refunded');
});

test('ignores failed transactions and unknown events', () => {
  const unknown = dataLine(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 1, 2, 3]));
  assert.deepEqual(
    decodeEventsFromLogs({
      signature: 'sig',
      slot: 3,
      blockTime: null,
      logMessages: [unknown],
      err: { InstructionError: [0, 'Custom'] },
    }),
    [],
  );
  assert.deepEqual(
    decodeEventsFromLogs({ signature: 'sig', slot: 4, blockTime: null, logMessages: [unknown], err: null }),
    [],
  );
});

test('ignores malformed program data without throwing', () => {
  assert.deepEqual(
    decodeEventsFromLogs({
      signature: 'sig',
      slot: 5,
      blockTime: null,
      logMessages: ['Program data: !!!not-base64', 'Program data: ', 'unrelated log'],
      err: null,
    }),
    [],
  );
});
