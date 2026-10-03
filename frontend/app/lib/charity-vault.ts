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

export const PROGRAM_ID = address(process.env.NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID || 'F1EjmWkLJRSYqzwswQCDDADPE8mXNrgiX8AEq17PBdW3');
const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
const encoder = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();
const base64 = getBase64Encoder();
const MAX_DONORS = 12;
export const CAMPAIGN_SIZE = 8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + MAX_DONORS * 32 + 1;
const LEDGER_SIZE = 8 + 32 + 32 + 8 + 1 + 1;
const MAX_U64 = (1n << 64n) - 1n;

export type Campaign = {
  address: Address;
  creator: Address;
  campaignId: bigint;
  goal: bigint;
  deadline: number;
  descHash: Uint8Array;
  raised: bigint;
  paid: boolean;
  status: 'Active' | 'Succeeded' | 'Refunded';
  donors: Address[];
};

export type Ledger = { campaign: Address; donor: Address; amount: bigint; claimed: boolean };

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
  };
}

// Anchor's default SHA-256 discriminators for the Rust account struct names.
const campaignDiscriminator = new Uint8Array([167, 6, 205, 183, 220, 156, 200, 113]);
const ledgerDiscriminator = new Uint8Array([240, 89, 93, 238, 119, 147, 214, 47]);

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

export async function campaignPda(creator: Address, id: bigint) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['campaign', addressEncoder.encode(creator), u64(id)] });
  return pda;
}
export async function vaultPda(campaign: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['vault', addressEncoder.encode(campaign)] });
  return pda;
}
export async function donorPda(campaign: Address, donor: Address) {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ['donor', addressEncoder.encode(campaign), addressEncoder.encode(donor)] });
  return pda;
}

type Meta = { address: Address; role: AccountRole };
const writable = (address: Address): Meta => ({ address, role: AccountRole.WRITABLE });
const signer = (address: Address): Meta => ({ address, role: AccountRole.WRITABLE_SIGNER });
const readonly = (address: Address): Meta => ({ address, role: AccountRole.READONLY });

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
  const time = new Uint8Array(8);
  new DataView(time.buffer).setBigInt64(0, BigInt(deadline), true);
  return { campaign, ix: await instruction('create_campaign', [signer(creator), writable(campaign), writable(vault), readonly(SYSTEM_PROGRAM)], [u64(id), u64(goal), time, hash]) };
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
  return instruction('refund_all', [signer(caller), writable(campaign.address), writable(await vaultPda(campaign.address)), ...remaining]);
}
