import { createSolanaRpc, type Address, type Signature } from '@solana/kit';
import { config } from '../config.js';
import { withRpcRetry } from './retry.js';

export const rpc = createSolanaRpc(config.rpcUrl);
const retryOptions = {
  attempts: config.rpcRetryAttempts,
  baseDelayMs: config.rpcRetryBaseDelayMs,
};

export interface RawAccount {
  address: Address;
  owner: Address;
  lamports: bigint;
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
  const accounts = await withRpcRetry(() => rpc
    .getProgramAccounts(config.programId as Address, {
      encoding: 'base64',
      commitment: 'confirmed',
      filters: [{ dataSize: BigInt(dataSize) }],
    })
    .send(), retryOptions);
  return accounts.map((entry) => ({
    address: entry.pubkey,
    owner: entry.account.owner,
    lamports: entry.account.lamports,
    data: readData(entry.account.data as unknown as readonly [string, string]),
  }));
}

export async function getAccount(addressValue: Address): Promise<RawAccount | null> {
  const response = await withRpcRetry(
    () => rpc.getAccountInfo(addressValue, { encoding: 'base64', commitment: 'confirmed' }).send(),
    retryOptions,
  );
  if (!response.value) return null;
  return {
    address: addressValue,
    owner: response.value.owner,
    lamports: response.value.lamports,
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
  const entries = await withRpcRetry(
    () => rpc.getSignaturesForAddress(config.programId as Address, { limit, commitment: 'confirmed' }).send(),
    retryOptions,
  );
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
  const response = await withRpcRetry(() => rpc
    .getTransaction(signature as Signature, {
      maxSupportedTransactionVersion: 1,
      encoding: 'json',
      commitment: 'confirmed',
    })
    .send(), retryOptions);
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
    const response = await withRpcRetry(
      () => rpc.getMultipleAccounts(chunk, { encoding: 'base64', commitment: 'confirmed' }).send(),
      retryOptions,
    );
    response.value.forEach((value, index) => {
      const owner = chunk[index];
      if (!value || owner === undefined) {
        results.push(null);
        return;
      }
      results.push({
        address: owner,
        owner: value.owner,
        lamports: value.lamports,
        data: readData(value.data as unknown as readonly [string, string]),
      });
    });
  }
  return results;
}

export async function getSlot(): Promise<number> {
  return Number(await withRpcRetry(() => rpc.getSlot({ commitment: 'confirmed' }).send(), retryOptions));
}

export async function getVaultBalance(vault: Address): Promise<bigint> {
  const info = await getAccount(vault);
  return info?.lamports ?? 0n;
}
