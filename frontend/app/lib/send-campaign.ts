import type { Address, Instruction, TransactionSigner } from '@solana/kit';
import {
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import type { AppClient } from '../providers';
import { CAMPAIGN_SIZE } from './charity-vault.ts';
import { withRpcRetry } from './rpc-retry.ts';
import { PUBLIC_DEVNET_RPC_URL } from './rpc-url.ts';

const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Rough ceiling for a single signed v0 transaction: 5000 fee + a small buffer. */
const MIN_FEE_LAMPORTS = 10_000n;
const publicDevnetRpc = createSolanaRpc(PUBLIC_DEVNET_RPC_URL);

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Solana `AccountNotFound` transaction error code. */
const ACCOUNT_NOT_FOUND = 7050003;
const PROGRAM_ACCOUNT_NOT_FOUND = 7050004;
const INSUFFICIENT_FUNDS_FOR_FEE = 7050005;
const BLOCKHASH_NOT_FOUND = 7050008;
const INSUFFICIENT_FUNDS_FOR_RENT = 7050031;
const PREFLIGHT_FAILURE = -32002;

type ErrorNode = {
  code?: number;
  context?: { __code?: number; logs?: readonly string[] | null; unitsConsumed?: bigint | null };
  cause?: unknown;
  message?: string;
};

function errorCode(error: unknown): number | undefined {
  const node = error as ErrorNode;
  return node.context?.__code ?? node.code;
}

function hasEmptyPreflightContext(error: unknown): boolean {
  const node = error as ErrorNode;
  return errorCode(error) === PREFLIGHT_FAILURE
    && Array.isArray(node.context?.logs)
    && node.context?.logs.length === 0
    && node.context?.unitsConsumed === 0n;
}

function hasCampaignIdCollision(error: unknown): boolean {
  const logs = (error as ErrorNode).context?.logs;
  return Array.isArray(logs) && logs.some((log) => /allocate: account .* already in use/i.test(log));
}

function errorChain(error: unknown): ErrorNode[] {
  const nodes: ErrorNode[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const node = current as ErrorNode;
    nodes.push(node);
    current = node.cause;
  }
  return nodes;
}

/**
 * The RPC/send plugins wrap the underlying simulation error several levels
 * deep. Unwrap the chain and translate the useful transaction causes into
 * messages a user can act on.
 */
export function describeSendError(error: unknown): string {
  const nodes = errorChain(error);

  // A sendTransaction preflight error is the outer node and the useful
  // transaction error is its cause. Inspect all specific causes before using
  // the generic empty-simulation fallback.
  for (const node of nodes) {
    const code = errorCode(node);
    if (code === ACCOUNT_NOT_FOUND) {
      return (
        'Your wallet has no devnet SOL, so it cannot pay the network fee for this transaction. ' +
        'Get free devnet SOL from https://faucet.solana.com and try again.'
      );
    }
    if (code === PROGRAM_ACCOUNT_NOT_FOUND) {
      return (
        'This program is not deployed on the cluster your wallet is connected to. ' +
        'Switch your wallet to Devnet or redeploy the program.'
      );
    }
    if (code === INSUFFICIENT_FUNDS_FOR_FEE || code === INSUFFICIENT_FUNDS_FOR_RENT) {
      return (
        'Your wallet does not have enough devnet SOL to create the campaign account and pay the network fee. ' +
        'Get free devnet SOL from https://faucet.solana.com and try again.'
      );
    }
    if (code === BLOCKHASH_NOT_FOUND) {
      return 'The Devnet RPC rejected the recent blockhash before submission. Refresh the page and try once more.';
    }
  }

  if (nodes.some(hasCampaignIdCollision)) {
    return 'This campaign ID is already used by your wallet. Enter a new campaign ID.';
  }
  if (nodes.some(hasEmptyPreflightContext)) {
    return 'The Devnet RPC could not simulate this transaction. Confirm Phantom is on Devnet and try again.';
  }
  return error instanceof Error ? error.message : 'Transaction failed';
}

/**
 * Fail fast with a readable message when the fee payer cannot cover the two
 * new accounts' rent plus the network fee. Without this the RPC can report an
 * opaque preflight failure that looks like an RPC or program problem.
 */
async function assertFeePayerFunded(client: AppClient, payer: Address): Promise<void> {
  const [{ value }, campaignRent, vaultRent] = await Promise.all([
    withRpcRetry(() => client.rpc.getBalance(payer, { commitment: 'confirmed' }).send()),
    withRpcRetry(() => client.rpc
      .getMinimumBalanceForRentExemption(BigInt(CAMPAIGN_SIZE), { commitment: 'confirmed' })
      .send()),
    withRpcRetry(() => client.rpc.getMinimumBalanceForRentExemption(0n, { commitment: 'confirmed' }).send()),
  ]);
  const required = campaignRent + vaultRent + MIN_FEE_LAMPORTS;
  if (value < required) {
    throw new Error(
      `Your wallet has ${formatSol(value)} SOL on devnet, but campaign creation currently needs about ` +
        `${formatSol(required)} SOL for account rent and the network fee. ` +
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
): Promise<{ confirmation: 'confirmed' | 'submitted'; signature: string }> {
  await assertFeePayerFunded(client, payer);

  try {
    // Use a fully propagated blockhash. Shared Devnet providers can return a
    // newer processed/confirmed blockhash from one backend and then reject it
    // on a different backend during submission.
    const { context: blockhashContext, value: latestBlockhash } = await withRpcRetry(
      () => client.rpc.getLatestBlockhash({ commitment: 'finalized' }).send(),
    );

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(ix, m),
    );

    // Simulate the exact message before opening Phantom. Once this succeeds,
    // skip sendTransaction's duplicate preflight so a different provider
    // backend cannot reject the same valid blockhash.
    const unsigned = compileTransaction(message);
    const simulation = await withRpcRetry(() => client.rpc.simulateTransaction(
      getBase64EncodedWireTransaction(unsigned),
      {
        commitment: 'finalized',
        encoding: 'base64',
        replaceRecentBlockhash: false,
        sigVerify: false,
      },
    ).send());
    if (simulation.value.err) {
      const detail = JSON.stringify(
        simulation.value.err,
        (_, value) => typeof value === 'bigint' ? value.toString() : value,
      );
      const logs = simulation.value.logs?.slice(-3).join(' | ');
      throw new Error(`Devnet simulation failed: ${detail}${logs ? ` — ${logs}` : ''}`);
    }

    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    const signature = getSignatureFromTransaction(signed);
    const configuredSend = sendTransactionWithoutConfirmingFactory({ rpc: client.rpc });
    const publicSend = sendTransactionWithoutConfirmingFactory({ rpc: publicDevnetRpc });
    const submissions = await Promise.allSettled([
      withRpcRetry(() => configuredSend(signed, {
        commitment: 'confirmed',
        minContextSlot: blockhashContext.slot,
        skipPreflight: true,
      })),
      withRpcRetry(() => publicSend(signed, {
        commitment: 'confirmed',
        minContextSlot: blockhashContext.slot,
        skipPreflight: true,
      }), { attempts: 1 }),
    ]);
    if (submissions[0].status === 'rejected' && submissions[1].status === 'rejected') {
      throw submissions[0].reason;
    }

    // Websocket confirmation can miss notifications on shared Devnet RPC
    // infrastructure. Poll the accepted signature for a predictable 30 seconds
    // and preserve it if confirmation takes longer.
    const confirmationDeadline = Date.now() + 30_000;
    while (Date.now() < confirmationDeadline) {
      const { value } = await withRpcRetry(() => client.rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send());
      const status = value[0];
      if (status?.err) {
        const detail = JSON.stringify(status.err, (_, value) => typeof value === 'bigint' ? value.toString() : value);
        throw new Error(`Transaction ${signature} failed: ${detail}`);
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return { confirmation: 'confirmed', signature };
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    return { confirmation: 'submitted', signature };
  } catch (error) {
    // Never retry by asking the wallet to sign again inside one submission.
    // If a user genuinely waits past expiry they can submit once more with a
    // fresh blockhash, keeping every click to exactly one wallet approval.
    throw new Error(describeSendError(error));
  }
}
