import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from '@solana/kit';
import type { AppClient } from '../providers';

// Simulate an unsigned v0 message before opening the wallet approval dialog.
export async function sendCampaignInstruction(client: AppClient, payer: Address, ix: Instruction) {
  const { value: blockhash } = await client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = appendTransactionMessageInstruction(ix,
    setTransactionMessageLifetimeUsingBlockhash(blockhash,
      setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 }))));
  const simulation = await client.rpc.simulateTransaction(getBase64EncodedWireTransaction(compileTransaction(message)), {
    encoding: 'base64', sigVerify: false, commitment: 'confirmed', replaceRecentBlockhash: true,
  }).send();
  if (simulation.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}${simulation.value.logs ? `\n${simulation.value.logs.join('\n')}` : ''}`);
  }
  const result = await client.sendTransaction([ix]);
  const signature = result.context.signature;
  // A signature alone is not proof of success; wait for chain confirmation.
  for (let attempt = 0; attempt < 45; attempt++) {
    const statuses = await client.rpc.getSignatureStatuses([signature]).send();
    const status = statuses.value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return signature;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Confirmation is taking longer than expected. Check transaction ${signature} on Solana Explorer.`);
}
