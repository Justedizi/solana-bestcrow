import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from '@solana/kit';
import type { AppClient } from '../providers';

export const PROGRAM_ID = address(process.env.NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID || '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG');
const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
const encoder = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();
const base64 = getBase64Encoder();
const MAX_DONORS = 12;
const MAX_MILESTONES = 5;
const MAX_SPLIT_RECIPIENTS = 5;
export const CAMPAIGN_SIZE =
  8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32 + 1
  + 1 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 1 + 8 + 1;
export const MILESTONE_SIZE = 8 + 32 + 1 + 8 + 8 + 32 + 1 + 8 + 8 + 1 + 1;export const SPLIT_SIZE = 8 + 32 + 1 + MAX_SPLIT_RECIPIENTS * 32 + MAX_SPLIT_RECIPIENTS * 2 + 1;
export const CLAIM_SIZE = 8 + 32 + 1 + 32 + 8 + 8 + 8 + 8 + 1;
const LEDGER_SIZE = 8 + 32 + 32 + 8 + 1 + 1;
const MAX_U64 = (1n << 64n) - 1n;

export const BPS_DENOM = 10_000;
/** A milestone vote releases at 70% approval. */
export const APPROVE_BPS = 7_000;
/** No milestone may allocate more than 50% of the base budget. */
export const MAX_MILESTONE_BPS = 5_000;

export type CampaignStatus = 'Active' | 'Succeeded' | 'Refunded';
export type MilestoneStatusName = 'Pending' | 'Submitted' | 'Revision' | 'Released' | 'Rejected';

export type Campaign = {
  address: Address;
  creator: Address;
  campaignId: bigint;
  goal: bigint;
  deadline: number;
  descHash: Uint8Array;
  raised: bigint;
  paid: boolean;
  status: CampaignStatus;
  donors: Address[];
  // ---- Bundle A: staged funding ----
  staged: boolean;
  baseBudget: bigint;
  initialTranche: bigint;
  released: bigint;
  bond: bigint;
  bondForfeited: boolean;
  terminated: boolean;
  milestoneCount: number;
  allocated: bigint;
  rejections: number;
  refundPool: bigint;
  refundsClaimed: number;
};

export type Ledger = { campaign: Address; donor: Address; amount: bigint; claimed: boolean };

export type Milestone = {
  address: Address;
  campaign: Address;
  index: number;
  amount: bigint;
  deadline: number;
  evidenceHash: Uint8Array;
  status: MilestoneStatusName;
  approveWeight: bigint;
  rejectWeight: bigint;
  round: number;
};

export type VoteRecord = { milestone: Address; backer: Address; approve: boolean; weight: bigint };

export type Split = {
  campaign: Address;
  count: number;
  recipients: Address[];
  sharesBps: number[];
};

export type Claim = {
  campaign: Address;
  milestoneIndex: number;
  recipient: Address;
  total: bigint;
  claimed: bigint;
  start: number;
  duration: number;
};

export async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function discriminator(namespace: 'account' | 'global', name: string) {
  return (await digest(`${namespace}:${name}`)).slice(0, 8);
}

function u64(value: bigint) {
  if (value < 0n || value > MAX_U64) throw new Error('Amount is outside the supported range.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function i64(value: number | bigint) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid timestamp.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}

function u8(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Value is outside the u8 range.');
  return new Uint8Array([value]);
}

function u16(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) throw new Error('Value is outside the u16 range.');
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

/** Borsh `Vec<T>` with a u32 length prefix. */
function vec(items: Uint8Array[]) {
  const body = items.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(4 + body);
  new DataView(out.buffer).setUint32(0, items.length, true);
  let offset = 4;
  for (const item of items) {
    out.set(item, offset);
    offset += item.length;
  }
  return out;
}

const addressBytes = (value: Address): Uint8Array => new Uint8Array(addressEncoder.encode(value));


export function parseSol(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value)) throw new Error('Enter a positive SOL amount (up to 9 decimal places).');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (amount === 0n || amount > MAX_U64) throw new Error('Enter a positive SOL amount within range.');
  return amount;
}

export function formatSol(amount: bigint) {
  const whole = amount / 1_000_000_000n;
  const fraction = (amount % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function shortAddress(value: string) { return `${value.slice(0, 5)}…${value.slice(-5)}`; }

/**
 * Campaign content that lives off the public chain (the description, a title,
 * and milestone labels). The on-chain account commits only to a SHA-256 hash of
 * this content, so the text is carried in the shareable page URL (public by
 * design — no secrets) and re-verified against `desc_hash` on load.
 */
export type CampaignContent = {
  title?: string;
  description?: string;
  milestones?: { title?: string; description?: string }[];
};

export function encodeContent(content: CampaignContent): string {
  const bytes = encoder.encode(JSON.stringify(content));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeContent(value: string | null | undefined): CampaignContent | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as CampaignContent;
  } catch {
    return null;
  }
}

/** Render a byte hash as a short hex string for display. */
export function shortHash(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 6))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** True when the given text hashes to the campaign's on-chain desc_hash. */
export async function contentMatchesHash(text: string, descHash: Uint8Array): Promise<boolean> {
  const actual = await digest(text);
  if (actual.length !== descHash.length) return false;
  for (let i = 0; i < actual.length; i += 1) if (actual[i] !== descHash[i]) return false;
  return true;
}
export function explorerTx(signature: string) { return `https://explorer.solana.com/tx/${signature}?cluster=devnet`; }
export function explorerAddress(value: string) { return `https://explorer.solana.com/address/${value}?cluster=devnet`; }

function key(data: Uint8Array, offset: number) { return addressDecoder.decode(data.slice(offset, offset + 32)); }
function bytes(encoded: readonly [string, string]) {
  if (encoded[1] !== 'base64') throw new Error('Unexpected account encoding.');
  return new Uint8Array(base64.encode(encoded[0]));
}

function decodeCampaign(accountAddress: Address, data: Uint8Array): Campaign {
  if (data.length !== CAMPAIGN_SIZE || !data.slice(0, 8).every((byte, i) => byte === (campaignDiscriminator[i]))) {
    throw new Error('Invalid campaign account.');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = data[106];
  const status = data[105];
  if (count > MAX_DONORS || status > 2 || data[104] > 1) throw new Error('Invalid campaign state.');
  const deadline = Number(view.getBigInt64(56, true));
  if (!Number.isSafeInteger(deadline)) throw new Error('Invalid campaign deadline.');
  // Bundle A fields begin at the bump byte's end. bump is at offset 491, so the
  // staged tail starts at 107 + MAX_DONORS*32 + 1 = 492.
  const tail = 107 + MAX_DONORS * 32 + 1;
  const staged = data[tail] === 1;
  const baseBudget = view.getBigUint64(tail + 1, true);
  const initialTranche = view.getBigUint64(tail + 9, true);
  const released = view.getBigUint64(tail + 17, true);
  const bond = view.getBigUint64(tail + 25, true);
  const bondForfeited = data[tail + 33] === 1;
  const terminated = data[tail + 34] === 1;
  const milestoneCount = data[tail + 35];
  if (milestoneCount > MAX_MILESTONES) throw new Error('Invalid campaign milestone count.');
  const allocated = view.getBigUint64(tail + 36, true);
  const rejections = data[tail + 44];
  const refundPool = view.getBigUint64(tail + 45, true);
  const refundsClaimed = data[tail + 53];
  return {
    address: accountAddress,
    creator: key(data, 8),
    campaignId: view.getBigUint64(40, true),
    goal: view.getBigUint64(48, true),
    deadline,
    descHash: data.slice(64, 96),
    raised: view.getBigUint64(96, true),
    paid: data[104] === 1,
    status: (['Active', 'Succeeded', 'Refunded'] as const)[status],
    donors: Array.from({ length: count }, (_, i) => key(data, 107 + i * 32)),
    staged,
    baseBudget,
    initialTranche,
    released,
    bond,
    bondForfeited,
    terminated,
    milestoneCount,
    allocated,
    rejections,
    refundPool,
    refundsClaimed,
  };
}

function decodeMilestone(accountAddress: Address, data: Uint8Array): Milestone | null {
  if (data.length !== MILESTONE_SIZE || !data.slice(0, 8).every((byte, i) => byte === milestoneDiscriminator[i])) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const status = data[89];
  const deadline = Number(view.getBigInt64(49, true));
  if (status > 4 || !Number.isSafeInteger(deadline)) return null;
  const names: MilestoneStatusName[] = ['Pending', 'Submitted', 'Revision', 'Released', 'Rejected'];
  return {
    address: accountAddress,
    campaign: key(data, 8),
    index: data[40],
    amount: view.getBigUint64(41, true),
    deadline,
    evidenceHash: data.slice(57, 89),
    status: names[status]!,
    approveWeight: view.getBigUint64(90, true),
    rejectWeight: view.getBigUint64(98, true),
    round: data[106],
  };
}

function decodeSplit(accountAddress: Address, data: Uint8Array): Split | null {
  if (data.length !== SPLIT_SIZE || !data.slice(0, 8).every((byte, i) => byte === splitDiscriminator[i])) return null;
  const count = data[40];
  if (count > MAX_SPLIT_RECIPIENTS) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const recipients: Address[] = [];
  for (let i = 0; i < count; i += 1) recipients.push(key(data, 41 + i * 32));
  const sharesBase = 41 + MAX_SPLIT_RECIPIENTS * 32;
  const sharesBps: number[] = [];
  for (let i = 0; i < count; i += 1) sharesBps.push(view.getUint16(sharesBase + i * 2, true));
  return { campaign: key(data, 8), count, recipients, sharesBps };
}

function decodeClaim(accountAddress: Address, data: Uint8Array): Claim | null {
  if (data.length !== CLAIM_SIZE || !data.slice(0, 8).every((byte, i) => byte === claimDiscriminator[i])) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // campaign 8..40, milestone_index 40, recipient 41..73, total 73..81,
  // claimed 81..89, start 89..97, duration 97..105, bump 105.
  const start = Number(view.getBigInt64(89, true));
  const duration = Number(view.getBigInt64(97, true));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(duration)) return null;
  return {
    campaign: key(data, 8),
    milestoneIndex: data[40],
    recipient: key(data, 41),
    total: view.getBigUint64(73, true),
    claimed: view.getBigUint64(81, true),
    start,
    duration,
  };
}

// Anchor's default SHA-256 discriminators for the Rust account struct names.
const campaignDiscriminator = new Uint8Array([167, 6, 205, 183, 220, 156, 200, 113]);
const ledgerDiscriminator = new Uint8Array([240, 89, 93, 238, 119, 147, 214, 47]);
const milestoneDiscriminator = new Uint8Array([21, 222, 32, 140, 43, 166, 109, 19]);
const splitDiscriminator = new Uint8Array([96, 124, 192, 177, 178, 219, 22, 146]);
const claimDiscriminator = new Uint8Array([113, 109, 47, 96, 242, 219, 61, 165]);

export async function getCampaign(client: AppClient, accountAddress: Address) {
  const { value } = await client.rpc.getAccountInfo(accountAddress, { encoding: 'base64', commitment: 'confirmed' }).send();
  if (!value) return null;
  if (value.owner !== PROGRAM_ID || value.executable) throw new Error('This account is not a Charity Vault campaign.');
  return decodeCampaign(accountAddress, bytes(value.data));
}

export async function getCampaigns(client: AppClient) {
  const accounts = await client.rpc.getProgramAccounts(PROGRAM_ID, {
    encoding: 'base64', commitment: 'confirmed', filters: [{ dataSize: BigInt(CAMPAIGN_SIZE) }],
  }).send();
  const campaigns: Campaign[] = [];
  for (const { pubkey, account } of accounts) {
    if (account.owner !== PROGRAM_ID || account.executable) continue;
    try { campaigns.push(decodeCampaign(pubkey, bytes(account.data))); } catch { /* Ignore unrelated program accounts. */ }
  }
  return campaigns.sort((a, b) => b.deadline - a.deadline);
}

export async function getLedger(client: AppClient, campaign: Address, donor: Address) {
  const ledgerAddress = await donorPda(campaign, donor);
  const { value } = await client.rpc.getAccountInfo(ledgerAddress, { encoding: 'base64', commitment: 'confirmed' }).send();
  if (!value) return null;
  if (value.owner !== PROGRAM_ID || value.executable) throw new Error('Invalid donor ledger owner.');
  const data = bytes(value.data);
  if (data.length !== LEDGER_SIZE || !data.slice(0, 8).every((byte, i) => byte === ledgerDiscriminator[i]) ||
      key(data, 8) !== campaign || key(data, 40) !== donor || data[80] > 1) throw new Error('Invalid donor ledger.');
  return { campaign, donor, amount: new DataView(data.buffer, data.byteOffset).getBigUint64(72, true), claimed: data[80] === 1 } satisfies Ledger;
}

async function getAccount<T>(client: AppClient, accountAddress: Address, decode: (address: Address, data: Uint8Array) => T | null): Promise<T | null> {
  const { value } = await client.rpc.getAccountInfo(accountAddress, { encoding: 'base64', commitment: 'confirmed' }).send();
  if (!value || value.owner !== PROGRAM_ID || value.executable) return null;
  try {
    return decode(accountAddress, bytes(value.data));
  } catch {
    return null;
  }
}

export async function getMilestone(client: AppClient, campaign: Address, index: number): Promise<Milestone | null> {
  return getAccount(client, await milestonePda(campaign, index), decodeMilestone);
}

/** Read every milestone the campaign has added, in index order. */
export async function getMilestones(client: AppClient, campaign: Campaign): Promise<Milestone[]> {
  const items = await Promise.all(
    Array.from({ length: campaign.milestoneCount }, (_, index) => getMilestone(client, campaign.address, index)),
  );
  return items.filter((item): item is Milestone => item !== null);
}

export async function getSplit(client: AppClient, campaign: Address): Promise<Split | null> {
  return getAccount(client, await splitPda(campaign), decodeSplit);
}

export async function getClaim(client: AppClient, campaign: Address, index: number): Promise<Claim | null> {
  return getAccount(client, await claimPda(campaign, index), decodeClaim);
}

export async function campaignPda(creator: Address, id: bigint) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['campaign', addressEncoder.encode(creator), u64(id)] });
  return pda;
}
export async function vaultPda(campaign: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['vault', addressEncoder.encode(campaign)] });
  return pda;
}
export async function bondPda(campaign: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['bond', addressEncoder.encode(campaign)] });
  return pda;
}
export async function donorPda(campaign: Address, donor: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['donor', addressEncoder.encode(campaign), addressEncoder.encode(donor)] });
  return pda;
}
export async function milestonePda(campaign: Address, index: number) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['milestone', addressEncoder.encode(campaign), u8(index)] });
  return pda;
}
export async function votePda(milestone: Address, round: number, backer: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['vote', addressEncoder.encode(milestone), u8(round), addressEncoder.encode(backer)] });
  return pda;
}
export async function splitPda(campaign: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['split', addressEncoder.encode(campaign)] });
  return pda;
}
export async function claimPda(campaign: Address, index: number) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['claim', addressEncoder.encode(campaign), u8(index)] });
  return pda;
}

type Meta = { address: Address; role: AccountRole };
const writable = (address: Address): Meta => ({ address, role: AccountRole.WRITABLE });
const signer = (address: Address): Meta => ({ address, role: AccountRole.WRITABLE_SIGNER });
const readonly = (address: Address): Meta => ({ address, role: AccountRole.READONLY });
const readonlySigner = (address: Address): Meta => ({ address, role: AccountRole.READONLY_SIGNER });

async function instruction(name: string, accounts: Meta[], args: Uint8Array[] = []): Promise<Instruction> {
  const parts = [await discriminator('global', name), ...args];
  const data = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  return { programAddress: PROGRAM_ID, accounts, data };
}

export async function createCampaignIx(creator: Address, id: bigint, goal: bigint, deadline: number, hash: Uint8Array) {
  if (hash.length !== 32 || !Number.isSafeInteger(deadline)) throw new Error('Invalid campaign terms.');
  const campaign = await campaignPda(creator, id);
  const vault = await vaultPda(campaign);
  return { campaign, ix: await instruction('create_campaign', [signer(creator), writable(campaign), writable(vault), readonly(SYSTEM_PROGRAM)], [u64(id), u64(goal), i64(deadline), hash]) };
}
export async function pledgeIx(donor: Address, campaign: Address, amount: bigint) {
  return instruction('pledge', [signer(donor), writable(campaign), writable(await donorPda(campaign, donor)), writable(await vaultPda(campaign)), readonly(SYSTEM_PROGRAM)], [u64(amount)]);
}
export async function finalizeIx(caller: Address, campaign: Address) {
  return instruction('finalize', [signer(caller), writable(campaign)]);
}
export async function claimSuccessIx(creator: Address, campaign: Address) {
  return instruction('claim_success', [signer(creator), writable(campaign), writable(await vaultPda(campaign))]);
}
export async function claimRefundIx(donor: Address, campaign: Address) {
  return instruction('claim_refund', [signer(donor), writable(campaign), writable(await donorPda(campaign, donor)), writable(await vaultPda(campaign))]);
}

export async function refundAllIx(caller: Address, campaign: Campaign) {
  const remaining: Meta[] = [];
  for (const donor of campaign.donors) remaining.push(writable(await donorPda(campaign.address, donor)), writable(donor));
  return instruction('refund_all', [signer(caller), writable(campaign.address), writable(await vaultPda(campaign.address)), writable(campaign.creator), ...remaining]);
}

// ---------------------------------------------------------------------------
// Bundle A: staged funding
// ---------------------------------------------------------------------------

export async function createStagedCampaignIx(
  creator: Address,
  id: bigint,
  goal: bigint,
  deadline: number,
  hash: Uint8Array,
  baseBudget: bigint,
  initialTranche: bigint,
  bond: bigint,
) {
  if (hash.length !== 32 || !Number.isSafeInteger(deadline)) throw new Error('Invalid campaign terms.');
  const campaign = await campaignPda(creator, id);
  return {
    campaign,
    ix: await instruction(
      'create_staged_campaign',
      [signer(creator), writable(campaign), writable(await vaultPda(campaign)), writable(await bondPda(campaign)), readonly(SYSTEM_PROGRAM)],
      [u64(id), u64(goal), i64(deadline), hash, u64(baseBudget), u64(initialTranche), u64(bond)],
    ),
  };
}

export async function addMilestoneIx(creator: Address, campaign: Address, index: number, amount: bigint, deadline: number, evidenceHash: Uint8Array) {
  if (evidenceHash.length !== 32) throw new Error('Evidence hash must be 32 bytes.');
  return instruction(
    'add_milestone',
    [signer(creator), writable(campaign), writable(await milestonePda(campaign, index)), readonly(SYSTEM_PROGRAM)],
    [u8(index), u64(amount), i64(deadline), evidenceHash],
  );
}

export async function submitEvidenceIx(creator: Address, campaign: Address, index: number, evidenceHash: Uint8Array) {
  if (evidenceHash.length !== 32) throw new Error('Evidence hash must be 32 bytes.');
  return instruction(
    'submit_evidence',
    [signer(creator), readonly(campaign), writable(await milestonePda(campaign, index))],
    [u8(index), evidenceHash],
  );
}

export async function voteMilestoneIx(backer: Address, campaign: Address, index: number, round: number, approve: boolean, milestone?: Address) {
  const milestoneAddress = milestone ?? (await milestonePda(campaign, index));
  return instruction(
    'vote_milestone',
    [
      signer(backer),
      readonly(campaign),
      writable(milestoneAddress),
      readonly(await donorPda(campaign, backer)),
      writable(await votePda(milestoneAddress, round, backer)),
      readonly(SYSTEM_PROGRAM),
    ],
    [u8(index), u8(approve ? 1 : 0)],
  );
}

export async function finalizeVoteIx(caller: Address, campaign: Address, index: number) {
  return instruction(
    'finalize_vote',
    [readonlySigner(caller), writable(campaign), writable(await milestonePda(campaign, index))],
    [u8(index)],
  );
}

export async function releaseInitialIx(creator: Address, campaign: Address) {
  return instruction('release_initial', [signer(creator), writable(campaign), writable(await vaultPda(campaign))]);
}

export async function setSplitIx(creator: Address, campaign: Address, recipients: Address[], sharesBps: number[]) {
  if (recipients.length === 0 || recipients.length !== sharesBps.length) throw new Error('Split recipients and shares must be the same non-zero length.');
  const total = sharesBps.reduce((sum, share) => sum + share, 0);
  if (total !== BPS_DENOM) throw new Error('Split shares must add up to 10000 basis points.');
  return instruction(
    'set_split',
    [signer(creator), readonly(campaign), writable(await splitPda(campaign)), readonly(SYSTEM_PROGRAM)],
    [vec(recipients.map(addressBytes)), vec(sharesBps.map(u16))],
  );
}

export async function releaseTrancheIx(creator: Address, campaign: Address, index: number, durationSeconds: number) {
  return instruction(
    'release_tranche',
    [signer(creator), writable(campaign), writable(await milestonePda(campaign, index)), writable(await claimPda(campaign, index)), readonly(SYSTEM_PROGRAM)],
    [u8(index), i64(durationSeconds)],
  );
}

/** `split` is the campaign's split PDA when one exists, otherwise any program-owned account. */
export async function withdrawClaimIx(caller: Address, campaign: Address, index: number, split: Address, recipients: Address[]) {
  const accounts: Meta[] = [
    readonlySigner(caller),
    readonly(campaign),
    writable(await vaultPda(campaign)),
    writable(await claimPda(campaign, index)),
    readonly(split),
  ];
  for (const recipient of recipients) accounts.push(writable(recipient));
  return instruction('withdraw_claim', accounts, [u8(index)]);
}

export async function terminateIx(caller: Address, campaign: Address) {
  return instruction(
    'terminate',
    [readonlySigner(caller), writable(campaign), writable(await vaultPda(campaign)), writable(await bondPda(campaign))],
  );
}

export async function claimTerminationRefundIx(donor: Address, campaign: Campaign) {
  return instruction(
    'claim_termination_refund',
    [signer(donor), writable(campaign.address), writable(await donorPda(campaign.address, donor)), writable(await vaultPda(campaign.address)), writable(campaign.creator)],
  );
}

export async function claimBondIx(creator: Address, campaign: Address) {
  return instruction('claim_bond', [signer(creator), readonly(campaign), writable(await bondPda(campaign))]);
}
