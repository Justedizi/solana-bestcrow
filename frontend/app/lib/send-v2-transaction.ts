import type { Address, Instruction, TransactionSigner } from '@solana/kit';
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
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
import { withRpcRetry } from './rpc-retry.ts';

export type V2TransactionResult = {
  signature: string;
  confirmation: 'confirmed' | 'submitted';
};

function stringifyRpcValue(value: unknown): string {
  return JSON.stringify(value, (_, child) => typeof child === 'bigint' ? child.toString() : child);
}

/**
 * Simulate, request one wallet signature, submit, then poll confirmation.
 * The caller must render its human-readable transaction summary before calling
 * this function. It deliberately never retries by asking for a second signature.
 */
export async function sendV2Transaction(
  client: AppClient,
  payer: Address,
  walletSigner: TransactionSigner,
  instructions: Instruction[],
): Promise<V2TransactionResult> {
  if (instructions.length === 0) throw new Error('Transaction has no instructions.');
  const connection = client.wallet.getState().connected;
  if (!connection || connection.account.address !== payer) throw new Error('The connected wallet changed. Review the transaction again.');
  const version = connection.supportedTransactionVersions.has(1)
    ? 1 as const
    : connection.supportedTransactionVersions.has(0)
      ? 0 as const
      : null;
  if (version === null) throw new Error('This wallet cannot sign Solana v0 or v1 transactions.');

  try {
    const { context, value: latestBlockhash } = await withRpcRetry(
      () => client.rpc.getLatestBlockhash({ commitment: 'finalized' }).send(),
    );
    const message = pipe(
      createTransactionMessage({ version }),
      (value) => setTransactionMessageFeePayerSigner(walletSigner, value),
      (value) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, value),
      (value) => appendTransactionMessageInstructions(instructions, value),
    );

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
      const logs = simulation.value.logs?.slice(-4).join(' | ');
      throw new Error(`Devnet simulation failed: ${stringifyRpcValue(simulation.value.err)}${logs ? ` — ${logs}` : ''}`);
    }

    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    const signature = getSignatureFromTransaction(signed);
    const send = sendTransactionWithoutConfirmingFactory({ rpc: client.rpc });
    await withRpcRetry(() => send(signed, {
      commitment: 'confirmed',
      minContextSlot: context.slot,
      skipPreflight: true,
    }));

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const { value } = await withRpcRetry(() => client.rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send());
      const status = value[0];
      if (status?.err) throw new Error(`Transaction ${signature} failed: ${stringifyRpcValue(status.err)}`);
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return { confirmation: 'confirmed', signature };
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return { confirmation: 'submitted', signature };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transaction failed.';
    if (/User rejected|declined|cancelled/i.test(message)) throw new Error('Wallet approval was cancelled. No transaction was sent.');
    throw new Error(message);
  }
}
