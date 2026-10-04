import type { Address, Instruction, TransactionSigner } from '@solana/kit';
import {
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import type { AppClient } from '../providers';
import { withRpcRetry } from './rpc-retry.ts';

const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Rough ceiling for a single signed v0 transaction: 5000 fee + a small buffer. */
const MIN_FEE_LAMPORTS = 10_000n;

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Solana `AccountNotFound` transaction error code. */
const ACCOUNT_NOT_FOUND = 7050003;

/**
 * The RPC/send plugins wrap the underlying simulation error several levels
 * deep. Unwrap the chain and translate the two codes that matter here —
 * `AccountNotFound` (empty fee payer) and `ProgramAccountNotFound` (program
 * missing on this cluster) — into messages a user can act on.
 */
export function describeSendError(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const node = current as { message?: string; context?: { __code?: number }; cause?: unknown };
    const code = node.context?.__code;
    if (code === ACCOUNT_NOT_FOUND) {
      return (
        'Your wallet has no devnet SOL, so it cannot pay the network fee for this transaction. ' +
        'Get free devnet SOL from https://faucet.solana.com and try again.'
      );
    }
    if (code === 7050004) {
      return (
        'This program is not deployed on the cluster your wallet is connected to. ' +
        'Switch your wallet to Devnet or redeploy the program.'
      );
    }
    current = node.cause;
  }
  return error instanceof Error ? error.message : 'Transaction failed';
}

/**
 * Fail fast with a readable message when the fee payer cannot cover the network
 * fee. Without this the RPC reports the opaque `AccountNotFound` ("attempt to
 * debit an account but found no record of a prior credit") which reads like a
 * missing program rather than an empty wallet.
 */
async function assertFeePayerFunded(client: AppClient, payer: Address): Promise<void> {
  const { value } = await withRpcRetry(() => client.rpc.getBalance(payer, { commitment: 'confirmed' }).send());
  if (value < MIN_FEE_LAMPORTS) {
    throw new Error(
      `Your wallet has ${formatSol(value)} SOL on devnet — not enough to pay the network fee. ` +
        `Get free devnet SOL from https://faucet.solana.com and try again.`,
    );
  }
}

/**
 * Sign a single instruction with the connected wallet and send it.
 *
 * We build the v0 message ourselves and sign it with the wallet's own signer
 * (`signTransactionMessageWithSigners`) instead of relying on
 * `client.sendTransaction`. That path works for every Wallet Standard wallet:
 * Phantom commonly exposes `signTransaction` but not `signAndSendTransaction`,
 * and the dynamic wallet payer is not always resolved inside the plan executor.
 * Confirmation uses the client's websocket subscriptions.
 */
export async function sendCampaignInstruction(
  client: AppClient,
  payer: Address,
  signer: TransactionSigner,
  ix: Instruction,
): Promise<string> {
  await assertFeePayerFunded(client, payer);

  const { value: latestBlockhash } = await withRpcRetry(
    () => client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send(),
  );

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(ix, m),
  );

  const signed = await (async () => {
    try {
      return await signTransactionMessageWithSigners(message);
    } catch (error) {
      throw new Error(describeSendError(error));
    }
  })();
  assertIsTransactionWithBlockhashLifetime(signed);

  const signature = getSignatureFromTransaction(signed);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: client.rpc,
    rpcSubscriptions: client.rpcSubscriptions,
  });
  try {
    await withRpcRetry(() => sendAndConfirm(signed, { commitment: 'confirmed' }));
  } catch (error) {
    throw new Error(describeSendError(error));
  }
  return signature;
}
