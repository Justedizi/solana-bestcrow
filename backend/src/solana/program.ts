import { createHash } from 'node:crypto';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from '@solana/kit';
import { config } from '../config.js';

export const PROGRAM_ID: Address = address(config.programId);
export const SYSTEM_PROGRAM_ID: Address = address('11111111111111111111111111111111');

export const CAMPAIGN_SEED = 'campaign';
export const DONOR_SEED = 'donor';
export const VAULT_SEED = 'vault';

export const MAX_DONORS = 12;

/** 8 (discriminator) + CampaignAccount::INIT_SPACE. */
export const CAMPAIGN_ACCOUNT_SIZE =
  8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32 + 1
  + 1 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 1 + 8 + 1;

/** Offset of the bump byte in CampaignAccount (the Bundle A fields follow it). */
export const CAMPAIGN_BUMP_OFFSET = 8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32;
/** 8 (discriminator) + DonorLedgerAccount::INIT_SPACE. */
export const DONOR_LEDGER_ACCOUNT_SIZE = 82;

export type CampaignStatus = 'active' | 'succeeded' | 'refunded';

export interface CampaignAccount {
  address: Address;
  creator: Address;
  campaignId: bigint;
  goal: bigint;
  deadline: bigint;
  descHash: Uint8Array;
  raised: bigint;
  paid: boolean;
  status: CampaignStatus;
  donorCount: number;
  donors: Address[];
  bump: number;
}

export interface DonorLedgerAccount {
  address: Address;
  campaign: Address;
  donor: Address;
  amount: bigint;
  claimed: boolean;
  bump: number;
}

const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

const STATUS_VALUES: CampaignStatus[] = ['active', 'succeeded', 'refunded'];

export const sha256 = (data: Uint8Array | string): Uint8Array =>
  new Uint8Array(createHash('sha256').update(data).digest());

/** Anchor 8-byte instruction/account/event discriminator: sha256("namespace:name")[0..8]. */
export const anchorDiscriminator = (namespace: 'global' | 'account' | 'event', name: string): Uint8Array =>
  sha256(`${namespace}:${name}`).slice(0, 8);

export const CAMPAIGN_DISCRIMINATOR = anchorDiscriminator('account', 'CampaignAccount');
export const DONOR_LEDGER_DISCRIMINATOR = anchorDiscriminator('account', 'DonorLedgerAccount');

export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
export const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));

const u64Le = (value: bigint): Uint8Array => {
  if (value < 0n || value > (1n << 64n) - 1n) throw new RangeError('Value is outside the u64 range');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
};

const i64Le = (value: bigint): Uint8Array => {
  if (value < -(1n << 63n) || value > (1n << 63n) - 1n) throw new RangeError('Value is outside the i64 range');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
};

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const matches = (data: Uint8Array, discriminator: Uint8Array, offset = 0): boolean => {
  if (data.length < offset + 8) return false;
  for (let i = 0; i < 8; i += 1) {
    if (data[offset + i] !== discriminator[i]) return false;
  }
  return true;
};

export const parseBigInt = (value: string | number | bigint): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new RangeError('Integer must be represented without precision loss');
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) throw new TypeError('Expected an integer string');
  return BigInt(value);
};

export async function getCampaignPda(creator: Address, campaignId: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [textEncoder.encode(CAMPAIGN_SEED), addressEncoder.encode(creator), u64Le(campaignId)],
  });
  return pda;
}

export async function getVaultPda(campaign: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [textEncoder.encode(VAULT_SEED), addressEncoder.encode(campaign)],
  });
  return pda;
}

export async function getDonorLedgerPda(campaign: Address, donor: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [textEncoder.encode(DONOR_SEED), addressEncoder.encode(campaign), addressEncoder.encode(donor)],
  });
  return pda;
}

export function decodeCampaignAccount(accountAddress: Address, data: Uint8Array): CampaignAccount | null {
  if (data.length !== CAMPAIGN_ACCOUNT_SIZE || !matches(data, CAMPAIGN_DISCRIMINATOR)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const statusByte = data[105] ?? 0;
  const donorCount = data[106] ?? 0;
  if (statusByte > 2 || donorCount > MAX_DONORS || (data[104] !== 0 && data[104] !== 1)) return null;
  const donors: Address[] = [];
  for (let i = 0; i < donorCount; i += 1) {
    const start = 107 + i * 32;
    donors.push(addressDecoder.decode(data.subarray(start, start + 32)));
  }
  return {
    address: accountAddress,
    creator: addressDecoder.decode(data.subarray(8, 40)),
    campaignId: view.getBigUint64(40, true),
    goal: view.getBigUint64(48, true),
    deadline: view.getBigInt64(56, true),
    descHash: data.slice(64, 96),
    raised: view.getBigUint64(96, true),
    paid: data[104] === 1,
    status: STATUS_VALUES[statusByte] ?? 'active',
    donorCount,
    donors,
    bump: data[CAMPAIGN_BUMP_OFFSET] ?? 0,
  };
}

export function decodeDonorLedger(accountAddress: Address, data: Uint8Array): DonorLedgerAccount | null {
  if (data.length !== DONOR_LEDGER_ACCOUNT_SIZE || !matches(data, DONOR_LEDGER_DISCRIMINATOR)) return null;
  if (data[80] !== 0 && data[80] !== 1) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    address: accountAddress,
    campaign: addressDecoder.decode(data.subarray(8, 40)),
    donor: addressDecoder.decode(data.subarray(40, 72)),
    amount: view.getBigUint64(72, true),
    claimed: data[80] === 1,
    bump: data[81] ?? 0,
  };
}

export interface AccountMetaPlan {
  pubkey: Address;
  signer: boolean;
  writable: boolean;
}

export interface InstructionPlan {
  name: string;
  programId: Address;
  accounts: AccountMetaPlan[];
  /** Hex-encoded instruction data (discriminator + borsh args). */
  dataHex: string;
}

const plan = (name: string, accounts: AccountMetaPlan[], data: Uint8Array): InstructionPlan => ({
  name,
  programId: PROGRAM_ID,
  accounts,
  dataHex: toHex(data),
});

export const instructionDiscriminators = {
  createCampaign: anchorDiscriminator('global', 'create_campaign'),
  pledge: anchorDiscriminator('global', 'pledge'),
  finalize: anchorDiscriminator('global', 'finalize'),
  claimSuccess: anchorDiscriminator('global', 'claim_success'),
  claimRefund: anchorDiscriminator('global', 'claim_refund'),
  refundAll: anchorDiscriminator('global', 'refund_all'),
} as const;

export const createCampaignPlan = async (args: {
  creator: Address;
  campaignId: bigint;
  goal: bigint;
  deadline: bigint;
  descHash: Uint8Array;
}): Promise<InstructionPlan> => {
  if (args.descHash.length !== 32) throw new RangeError('Description hash must contain 32 bytes');
  if (args.goal <= 0n) throw new RangeError('Campaign goal must be greater than zero');
  const campaign = await getCampaignPda(args.creator, args.campaignId);
  const vault = await getVaultPda(campaign);
  return plan(
    'create_campaign',
    [
      { pubkey: args.creator, signer: true, writable: true },
      { pubkey: campaign, signer: false, writable: true },
      { pubkey: vault, signer: false, writable: true },
      { pubkey: SYSTEM_PROGRAM_ID, signer: false, writable: false },
    ],
    concatBytes(
      instructionDiscriminators.createCampaign,
      u64Le(args.campaignId),
      u64Le(args.goal),
      i64Le(args.deadline),
      args.descHash,
    ),
  );
};

export const pledgePlan = async (args: {
  donor: Address;
  campaign: Address;
  amount: bigint;
}): Promise<InstructionPlan> => {
  if (args.amount <= 0n) throw new RangeError('Pledge amount must be greater than zero');
  return plan(
    'pledge',
    [
      { pubkey: args.donor, signer: true, writable: true },
      { pubkey: args.campaign, signer: false, writable: true },
      { pubkey: await getDonorLedgerPda(args.campaign, args.donor), signer: false, writable: true },
      { pubkey: await getVaultPda(args.campaign), signer: false, writable: true },
      { pubkey: SYSTEM_PROGRAM_ID, signer: false, writable: false },
    ],
    concatBytes(instructionDiscriminators.pledge, u64Le(args.amount)),
  );
};

export const finalizePlan = (args: { caller: Address; campaign: Address }): InstructionPlan =>
  plan(
    'finalize',
    [
      { pubkey: args.caller, signer: true, writable: false },
      { pubkey: args.campaign, signer: false, writable: true },
    ],
    instructionDiscriminators.finalize,
  );

export const claimSuccessPlan = async (args: {
  creator: Address;
  campaign: Address;
}): Promise<InstructionPlan> =>
  plan(
    'claim_success',
    [
      { pubkey: args.creator, signer: true, writable: true },
      { pubkey: args.campaign, signer: false, writable: true },
      { pubkey: await getVaultPda(args.campaign), signer: false, writable: true },
    ],
    instructionDiscriminators.claimSuccess,
  );

export const claimRefundPlan = async (args: {
  donor: Address;
  campaign: Address;
}): Promise<InstructionPlan> =>
  plan(
    'claim_refund',
    [
      { pubkey: args.donor, signer: true, writable: true },
      { pubkey: args.campaign, signer: false, writable: true },
      { pubkey: await getDonorLedgerPda(args.campaign, args.donor), signer: false, writable: true },
      { pubkey: await getVaultPda(args.campaign), signer: false, writable: true },
    ],
    instructionDiscriminators.claimRefund,
  );

export const refundAllPlan = async (args: {
  caller: Address;
  campaign: Address;
  creator: Address;
  donors: Address[];
}): Promise<InstructionPlan> => {
  if (args.donors.length > MAX_DONORS || new Set(args.donors).size !== args.donors.length) {
    throw new RangeError('Refund donors must be unique and within the campaign donor limit');
  }
  const accounts: AccountMetaPlan[] = [
    { pubkey: args.caller, signer: true, writable: true },
    { pubkey: args.campaign, signer: false, writable: true },
    { pubkey: await getVaultPda(args.campaign), signer: false, writable: true },
    { pubkey: args.creator, signer: false, writable: true },
  ];
  for (const donor of args.donors) {
    accounts.push({ pubkey: await getDonorLedgerPda(args.campaign, donor), signer: false, writable: true });
    accounts.push({ pubkey: donor, signer: false, writable: true });
  }
  return plan('refund_all', accounts, instructionDiscriminators.refundAll);
};
