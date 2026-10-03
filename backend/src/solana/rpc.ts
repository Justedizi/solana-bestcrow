import { createSolanaRpc, type Address, type Signature } from '@solana/kit';
import { config } from '../config.js';

export const rpc = createSolanaRpc(config.rpcUrl);

export interface RawAccount {
  address: Address;
  owner: Address;
  lamports: number;
  data: Uint8Array;
}

const base64ToBytes = (encoded: string): Uint8Array => new Uint8Array(Buffer.from(encoded, 'base64'));

const readData = (value: readonly [string, string] | string): Uint8Array => {
  if (typeof value === 'string') return base64ToBytes(value);
  const [encoded, encoding] = value;
  if (encoding !== 'base64') throw new Error(`Unexpected account encoding: ${encoding}`);
  return base64ToBytes(encoded);
};

export async function getProgramAccounts(dataSize: number): Promise<RawAccount[]> {
  const accounts = await rpc
    .getProgramAccounts(config.programId as Address, {
      encoding: 'base64',
      commitment: 'confirmed',
      filters: [{ dataSize: BigInt(dataSize) }],
    })
    .send();
  return accounts.map((entry) => ({
    address: entry.pubkey,
    owner: entry.account.owner,
    lamports: Number(entry.account.lamports),
    data: readData(entry.account.data as unknown as readonly [string, string]),
  }));
}

export async function getAccount(addressValue: Address): Promise<RawAccount | null> {
  const response = await rpc.getAccountInfo(addressValue, { encoding: 'base64', commitment: 'confirmed' }).send();
  if (!response.value) return null;
  return {
    address: addressValue,
    owner: response.value.owner,
    lamports: Number(response.value.lamports),
    data: readData(response.value.data as unknown as readonly [string, string]),
  };
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown | null;
}

export async function getRecentSignatures(limit: number): Promise<SignatureInfo[]> {
  const entries = await rpc
    .getSignaturesForAddress(config.programId as Address, { limit, commitment: 'confirmed' })
    .send();
  return entries.map((entry) => ({
    signature: entry.signature,
    slot: Number(entry.slot),
    blockTime: entry.blockTime == null ? null : Number(entry.blockTime),
    err: (entry.err as unknown) ?? null,
  }));
}

export interface TransactionLogs {
  logMessages: string[];
  err: unknown | null;
}

export async function getTransactionLogs(signature: string): Promise<TransactionLogs | null> {
  const response = await rpc
    .getTransaction(signature as Signature, {
      maxSupportedTransactionVersion: 0,
      encoding: 'json',
      commitment: 'confirmed',
    })
    .send();
  if (!response) return null;
  return {
    logMessages: [...(response.meta?.logMessages ?? [])],
    err: (response.meta?.err as unknown) ?? null,
  };
}

const MULTIPLE_ACCOUNTS_CHUNK = 100;

export async function getMultipleAccounts(addresses: Address[]): Promise<Array<RawAccount | null>> {
  const results: Array<RawAccount | null> = [];
  for (let i = 0; i < addresses.length; i += MULTIPLE_ACCOUNTS_CHUNK) {
    const chunk = addresses.slice(i, i + MULTIPLE_ACCOUNTS_CHUNK);
    const response = await rpc
      .getMultipleAccounts(chunk, { encoding: 'base64', commitment: 'confirmed' })
      .send();
    response.value.forEach((value, index) => {
      const owner = chunk[index];
      if (!value || owner === undefined) {
        results.push(null);
        return;
      }
      results.push({
        address: owner,
        owner: value.owner,
        lamports: Number(value.lamports),
        data: readData(value.data as unknown as readonly [string, string]),
      });
    });
  }
  return results;
}

export async function getSlot(): Promise<number> {
  return Number(await rpc.getSlot({ commitment: 'confirmed' }).send());
}

export async function getVaultBalance(vault: Address): Promise<number> {
  const info = await getAccount(vault);
  return info?.lamports ?? 0;
}
