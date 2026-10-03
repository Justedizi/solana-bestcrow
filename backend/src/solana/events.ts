import { getAddressDecoder } from '@solana/kit';
import { anchorDiscriminator, toHex } from './program.js';

export type IndexedEventName =
  | 'CampaignCreated'
  | 'PledgeReceived'
  | 'CampaignFinalized'
  | 'SuccessClaimed'
  | 'RefundIssued';

export interface DecodedEvent {
  name: IndexedEventName;
  campaign: string;
  donor?: string;
  creator?: string;
  amount?: bigint;
  raised?: bigint;
  goal?: bigint;
  deadline?: bigint;
  campaignId?: bigint;
  descHash?: string;
  status?: 'active' | 'succeeded' | 'refunded';
  payload: Record<string, unknown>;
}

const addressDecoder = getAddressDecoder();

const u64 = (data: Uint8Array, offset: number): bigint =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);

const i64 = (data: Uint8Array, offset: number): bigint =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(offset, true);

const addr = (data: Uint8Array, offset: number): string =>
  addressDecoder.decode(data.subarray(offset, offset + 32));

const STATUS: Array<'active' | 'succeeded' | 'refunded'> = ['active', 'succeeded', 'refunded'];

interface EventDefinition {
  name: IndexedEventName;
  decode: (data: Uint8Array) => DecodedEvent;
}

const definitions: EventDefinition[] = [
  {
    name: 'CampaignCreated',
    decode: (data) => {
      const campaign = addr(data, 8);
      const creator = addr(data, 40);
      const campaignId = u64(data, 72);
      const goal = u64(data, 80);
      const deadline = i64(data, 88);
      const descHash = toHex(data.subarray(96, 128));
      return {
        name: 'CampaignCreated',
        campaign,
        creator,
        campaignId,
        goal,
        deadline,
        descHash,
        payload: { campaign, creator, campaignId: campaignId.toString(), goal: goal.toString(), deadline: deadline.toString(), descHash },
      };
    },
  },
  {
    name: 'PledgeReceived',
    decode: (data) => {
      const campaign = addr(data, 8);
      const donor = addr(data, 40);
      const amount = u64(data, 72);
      const raised = u64(data, 80);
      return {
        name: 'PledgeReceived',
        campaign,
        donor,
        amount,
        raised,
        payload: { campaign, donor, amount: amount.toString(), raised: raised.toString() },
      };
    },
  },
  {
    name: 'CampaignFinalized',
    decode: (data) => {
      const campaign = addr(data, 8);
      const status = STATUS[data[40] ?? 0] ?? 'active';
      return { name: 'CampaignFinalized', campaign, status, payload: { campaign, status } };
    },
  },
  {
    name: 'SuccessClaimed',
    decode: (data) => {
      const campaign = addr(data, 8);
      const creator = addr(data, 40);
      const amount = u64(data, 72);
      return {
        name: 'SuccessClaimed',
        campaign,
        creator,
        amount,
        payload: { campaign, creator, amount: amount.toString() },
      };
    },
  },
  {
    name: 'RefundIssued',
    decode: (data) => {
      const campaign = addr(data, 8);
      const donor = addr(data, 40);
      const amount = u64(data, 72);
      return {
        name: 'RefundIssued',
        campaign,
        donor,
        amount,
        payload: { campaign, donor, amount: amount.toString() },
      };
    },
  },
];

const byDiscriminator = new Map<string, EventDefinition>(
  definitions.map((definition) => [toHex(anchorDiscriminator('event', definition.name)), definition]),
);

export interface TransactionLogInput {
  signature: string;
  slot: number;
  blockTime: number | null;
  logMessages: readonly string[];
  err: unknown | null;
}

/** Extract and decode every Anchor event emitted by the charity-vault program in a transaction. */
export function decodeEventsFromLogs(input: TransactionLogInput): DecodedEvent[] {
  if (input.err) return [];
  const events: DecodedEvent[] = [];
  for (const line of input.logMessages) {
    const marker = 'Program data: ';
    const index = line.indexOf(marker);
    if (index === -1) continue;
    const encoded = line.slice(index + marker.length).trim();
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(encoded, 'base64'));
    } catch {
      continue;
    }
    if (bytes.length < 8) continue;
    const definition = byDiscriminator.get(toHex(bytes.subarray(0, 8)));
    if (!definition) continue;
    try {
      events.push(definition.decode(bytes));
    } catch {
      // Ignore events we cannot decode rather than failing the whole transaction.
    }
  }
  return events;
}
