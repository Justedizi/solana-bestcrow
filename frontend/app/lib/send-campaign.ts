import type { Address, Instruction } from '@solana/kit';
import type { AppClient } from '../providers';

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
  const { value } = await client.rpc.getBalance(payer, { commitment: 'confirmed' }).send();
  if (value < MIN_FEE_LAMPORTS) {
    throw new Error(
      `Your wallet has ${formatSol(value)} SOL on devnet — not enough to pay the network fee. ` +
        `Get free devnet SOL from https://faucet.solana.com and try again.`,
    );
  }
}

/**
 * Check funding, then submit a single signed transaction and wait for
 * confirmation.
 *
 * `client.sendTransaction` plans, signs, simulates (for resource limits) and
 * sends through the same client the wallet plugin is attached to, so the
 * simulation reflects the transaction that is actually submitted. Any nested
 * RPC error is unwrapped by {@link describeSendError}.
 */
export async function sendCampaignInstruction(client: AppClient, payer: Address, ix: Instruction) {
  await assertFeePayerFunded(client, payer);

  const result = await (async () => {
    try {
      return await client.sendTransaction([ix]);
    } catch (error) {
      throw new Error(describeSendError(error));
    }
  })();
  const signature = result.context.signature;
  // A signature alone is not proof of success; wait for chain confirmation.
  for (let attempt = 0; attempt < 45; attempt++) {
    const statuses = await client.rpc.getSignatureStatuses([signature]).send();
    const status = statuses.value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return signature;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Confirmation is taking longer than expected. Check transaction ${signature} on Solana Explorer.`);
}
