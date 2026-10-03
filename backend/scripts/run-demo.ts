/**
 * Bestcrow / Charity Vault end-to-end demo.
 *
 * Runs the full crowdfunding lifecycle on-chain against whatever cluster
 * SOLANA_RPC_URL points at (devnet by default):
 *
 *   1. create two campaigns (a goal-missed one and a goal-met one)
 *   2. three donors pledge to each
 *   3. wait for the deadline
 *   4. finalize both: one -> Refunded, one -> Succeeded
 *   5. refund_all  -> every donor repaid in a single transaction (hero beat)
 *   6. claim_success -> the creator receives the raised funds
 *
 * It reuses the backend's encoded instruction discriminators and PDA helpers,
 * so the demo signs the exact same bytes the web client and API produce.
 *
 * Run with:  npm run demo            (from backend/)
 * Env:
 *   SOLANA_RPC_URL        cluster RPC           (default https://api.devnet.solana.com)
 *   DEMO_KEYPAIR          payer/creator keypair (default ~/.config/solana/id.json)
 *   DEMO_DEADLINE_SECS    seconds until deadline (default 30)
 *   DEMO_DONORS           number of donors       (default 3)
 *   DEMO_FUND_LAMPORTS    SOL funded per donor   (default 500000000 = 0.5 SOL)
 *   DEMO_MODE             both | refund | success (default both)
 *   DEMO_AIRDROP=1        request an airdrop if the payer is short
 */

import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from '@solana/kit';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  decodeCampaignAccount,
  fromHex,
  getCampaignPda,
  getDonorLedgerPda,
  getVaultPda,
  instructionDiscriminators,
  PROGRAM_ID,
  sha256,
  toHex,
  SYSTEM_PROGRAM_ID,
} from '../src/solana/program.js';

const SOL = 1_000_000_000n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const deadlineSecs = Number(process.env.DEMO_DEADLINE_SECS || 30);
const donorCount = Number(process.env.DEMO_DONORS || 3);
const fundLamports = BigInt(process.env.DEMO_FUND_LAMPORTS || '500000000');
const mode = (process.env.DEMO_MODE || 'both') as 'both' | 'refund' | 'success' | 'seed';
const seedDeadlineSecs = Number(process.env.DEMO_SEED_DEADLINE_SECS || 86_400);
const payerPath = resolve(process.env.DEMO_KEYPAIR || `${homedir()}/.config/solana/id.json`);
const wantAirdrop = ['1', 'true', 'yes'].includes((process.env.DEMO_AIRDROP || '').toLowerCase());

const rpc = createSolanaRpc(rpcUrl);
const cluster = rpcUrl.includes('devnet')
  ? 'devnet'
  : rpcUrl.includes('testnet')
    ? 'testnet'
    : rpcUrl.includes('mainnet')
      ? 'mainnet-beta'
      : 'custom';

const dim = (s: string) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[2m${s}\u001b[0m` : s);
const bold = (s: string) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[1m${s}\u001b[0m` : s);
const green = (s: string) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[32m${s}\u001b[0m` : s);

const step = (n: number, text: string) => console.log(`\n${bold(`[${n}]`)} ${text}`);
const detail = (text: string) => console.log(`    ${text}`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sol(lamports: bigint): string {
  const negative = lamports < 0n;
  const value = negative ? -lamports : lamports;
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function explorerTx(signature: string): string {
  const suffix = cluster === 'custom' ? `custom&customUrl=${encodeURIComponent(rpcUrl)}` : cluster;
  return `https://explorer.solana.com/tx/${signature}?cluster=${suffix}`;
}
function explorerAddress(value: string): string {
  const suffix = cluster === 'custom' ? `custom&customUrl=${encodeURIComponent(rpcUrl)}` : cluster;
  return `https://explorer.solana.com/address/${value}?cluster=${suffix}`;
}

// ---------------------------------------------------------------------------
// Encoding + instruction builders (mirror backend/src/solana/program.ts)
// ---------------------------------------------------------------------------

const u64Le = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
};
const i64Le = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

type IxAccount = NonNullable<Instruction['accounts']>[number];
const writable = (address: Address): IxAccount => ({ address, role: AccountRole.WRITABLE });
const readonly = (address: Address): IxAccount => ({ address, role: AccountRole.READONLY });
// In every demo instruction the only signer is also the transaction fee payer, so
// the signature is supplied by setTransactionMessageFeePayerSigner. The account
// meta only needs the signer role bit set.
const signerWritable = (signer: TransactionSigner): IxAccount => ({
  address: signer.address,
  role: AccountRole.WRITABLE_SIGNER,
});
const signerReadonly = (signer: TransactionSigner): IxAccount => ({
  address: signer.address,
  role: AccountRole.READONLY_SIGNER,
});

const ix = (accounts: IxAccount[], data: Uint8Array): Instruction => ({
  programAddress: PROGRAM_ID,
  accounts,
  data,
});

async function createCampaignIx(
  creator: TransactionSigner,
  campaignId: bigint,
  goal: bigint,
  deadline: bigint,
  descHash: Uint8Array,
): Promise<{ campaign: Address; instruction: Instruction }> {
  const campaign = await getCampaignPda(creator.address, campaignId);
  const vault = await getVaultPda(campaign);
  return {
    campaign,
    instruction: ix(
      [signerWritable(creator), writable(campaign), writable(vault), readonly(SYSTEM_PROGRAM_ID)],
      concat(instructionDiscriminators.createCampaign, u64Le(campaignId), u64Le(goal), i64Le(deadline), descHash),
    ),
  };
}

async function pledgeIx(donor: TransactionSigner, campaign: Address, amount: bigint): Promise<Instruction> {
  const ledger = await getDonorLedgerPda(campaign, donor.address);
  const vault = await getVaultPda(campaign);
  return ix(
    [signerWritable(donor), writable(campaign), writable(ledger), writable(vault), readonly(SYSTEM_PROGRAM_ID)],
    concat(instructionDiscriminators.pledge, u64Le(amount)),
  );
}

const finalizeIx = (caller: TransactionSigner, campaign: Address): Instruction =>
  ix([signerReadonly(caller), writable(campaign)], instructionDiscriminators.finalize);

async function claimSuccessIx(creator: TransactionSigner, campaign: Address): Promise<Instruction> {
  return ix(
    [signerWritable(creator), writable(campaign), writable(await getVaultPda(campaign))],
    instructionDiscriminators.claimSuccess,
  );
}

async function refundAllIx(
  caller: TransactionSigner,
  campaign: Address,
  donors: Address[],
): Promise<Instruction> {
  const accounts: IxAccount[] = [
    signerReadonly(caller),
    writable(campaign),
    writable(await getVaultPda(campaign)),
  ];
  for (const donor of donors) {
    accounts.push(writable(await getDonorLedgerPda(campaign, donor)));
    accounts.push(writable(donor));
  }
  return ix(accounts, instructionDiscriminators.refundAll);
}

function transferIx(from: TransactionSigner, to: Address, lamports: bigint): Instruction {
  const data = new Uint8Array(12);
  new DataView(data.buffer).setUint32(0, 2, true);
  new DataView(data.buffer).setBigUint64(4, lamports, true);
  return { programAddress: SYSTEM_PROGRAM_ID, accounts: [signerWritable(from), writable(to)], data };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

async function send(instructions: Instruction[], feePayer: TransactionSigner): Promise<Signature> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
    })
    .send();
  await confirm(signature);
  return signature;
}

async function confirm(signature: Signature): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
    await sleep(700);
  }
  throw new Error(`Timed out waiting for ${signature}`);
}

async function balance(address: Address): Promise<bigint> {
  const { value } = await rpc.getBalance(address, { commitment: 'confirmed' }).send();
  return BigInt(value);
}

async function fetchCampaign(campaign: Address) {
  const { value } = await rpc
    .getAccountInfo(campaign, { encoding: 'base64', commitment: 'confirmed' })
    .send();
  if (!value) return null;
  const data = new Uint8Array(Buffer.from((value.data as readonly [string, string])[0], 'base64'));
  return decodeCampaignAccount(campaign, data);
}

async function waitForDeadline(deadline: bigint): Promise<void> {
  for (;;) {
    const left = Number(deadline) - Math.floor(Date.now() / 1000);
    if (left <= 0) break;
    process.stdout.write(`\r    deadline in ${String(left).padStart(3)}s  `);
    await sleep(1000);
  }
  process.stdout.write('\r    deadline reached          \n');
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

async function loadPayer(): Promise<TransactionSigner> {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(JSON.parse(readFileSync(payerPath, 'utf8')) as number[]);
  } catch {
    throw new Error(`Could not read keypair at ${payerPath}. Set DEMO_KEYPAIR to a funded keypair.`);
  }
  return createKeyPairSignerFromBytes(bytes);
}

async function seedActiveCampaigns(
  payer: TransactionSigner,
  donors: TransactionSigner[],
): Promise<void> {
  step(2, `Seeding active campaigns (open for ${seedDeadlineSecs}s)`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + seedDeadlineSecs);
  const baseId = BigInt(Math.floor(Date.now() / 1000));

  const campaigns: { id: bigint; goal: bigint; amounts: bigint[] }[] = [
    { id: baseId, goal: 10n * SOL, amounts: [SOL, SOL / 2n, 0n] },
    { id: baseId + 1n, goal: 25n * SOL, amounts: [2n * SOL, 0n, 0n] },
  ];

  for (const { id, goal, amounts } of campaigns) {
    const { campaign, instruction } = await createCampaignIx(
      payer,
      id,
      goal,
      deadline,
      sha256(`Bestcrow showcase campaign ${id}`),
    );
    const createSig = await send([instruction], payer);
    detail(`active campaign ${campaign}  goal=${sol(goal)} SOL  ${explorerTx(createSig)}`);

    let raised = 0n;
    for (let i = 0; i < donors.length; i += 1) {
      const amount = amounts[i] ?? 0n;
      if (amount === 0n) continue;
      const donor = donors[i]!;
      const signature = await send([await pledgeIx(donor, campaign, amount)], donor);
      raised += amount;
      detail(`pledge ${sol(amount)} SOL by ${donor.address}  ${explorerTx(signature)}`);
    }
    console.log(`      raised ${sol(raised)} / ${sol(goal)} SOL  ${explorerAddress(campaign)}`);
  }
}

async function ensureFunded(payer: TransactionSigner, required: bigint): Promise<void> {
  let current = await balance(payer.address);
  if (current >= required) return;
  if (wantAirdrop) {
    detail(`payer has ${sol(current)} SOL, requesting airdrop`);
    const airdropLamports = (required * 2n) as unknown as Parameters<typeof rpc.requestAirdrop>[1];
    await rpc.requestAirdrop(payer.address, airdropLamports).send();
    await sleep(2_000);
    current = await balance(payer.address);
  }
  if (current < required) {
    throw new Error(
      `Payer ${payer.address} has ${sol(current)} SOL but the demo needs ~${sol(required)} SOL. ` +
        `Fund it (devnet: solana airdrop 2 ${payer.address}) or lower DEMO_FUND_LAMPORTS.`,
    );
  }
}

interface CampaignResult {
  kind: 'refund' | 'success';
  campaign: Address;
  goal: bigint;
  raised: bigint;
  signatures: { label: string; signature: Signature }[];
}

async function main(): Promise<void> {
  console.log(bold('\nBestcrow / Charity Vault — end-to-end demo'));
  console.log(`    cluster : ${cluster} (${rpcUrl})`);
  console.log(`    program : ${PROGRAM_ID}`);
  console.log(`    mode    : ${mode}`);

  const payer = await loadPayer();
  const needed = fundLamports * BigInt(donorCount) + 2n * SOL + BigInt(donorCount + 4) * 5_000n;
  await ensureFunded(payer, needed);
  console.log(`    payer   : ${payer.address}  (${sol(await balance(payer.address))} SOL)`);

  const donors: TransactionSigner[] = [];
  for (let i = 0; i < donorCount; i += 1) donors.push(await generateKeyPairSigner());

  const runRefund = mode === 'both' || mode === 'refund';
  const runSuccess = mode === 'both' || mode === 'success';

  // Unique campaign ids so repeated runs never collide.
  const baseId = BigInt(Math.floor(Date.now() / 1000));

  // ---- Fund donors (>0 so they can pay their own pledge fees).
  step(1, `Funding ${donorCount} donor wallets from the payer`);
  const fundIxs = donors.map((donor) => transferIx(payer, donor.address, fundLamports));
  const fundSig = await send(fundIxs, payer);
  donors.forEach((donor, i) => detail(`donor[${i}] ${donor.address}`));
  detail(`explorer: ${explorerTx(fundSig)}`);

  if (mode === 'seed') {
    await seedActiveCampaigns(payer, donors);
    console.log(green('\nSeed complete. Open the app (npm run dev) to browse the campaigns.'));
    return;
  }

  // ---- Create campaigns.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSecs);
  step(2, `Creating campaigns with a ${deadlineSecs}s deadline (${new Date(Number(deadline) * 1000).toISOString()})`);

  const results: CampaignResult[] = [];
  const refundRaised = SOL; // per donor

  if (runRefund) {
    const goal = refundRaised * BigInt(donorCount + 2); // deliberately unreachable
    const { campaign, instruction } = await createCampaignIx(
      payer,
      baseId,
      goal,
      deadline,
      sha256(`Bestcrow refund demo ${baseId}`),
    );
    const signature = await send([instruction], payer);
    detail(`refund campaign  ${campaign}  goal=${sol(goal)} SOL`);
    detail(`explorer: ${explorerTx(signature)}`);
    results.push({ kind: 'refund', campaign, goal, raised: 0n, signatures: [{ label: 'create_campaign', signature }] });
  }

  if (runSuccess) {
    const goal = 2n * SOL; // met by donor[0] + donor[1]
    const { campaign, instruction } = await createCampaignIx(
      payer,
      baseId + 1n,
      goal,
      deadline,
      sha256(`Bestcrow success demo ${baseId}`),
    );
    const signature = await send([instruction], payer);
    detail(`success campaign ${campaign}  goal=${sol(goal)} SOL`);
    detail(`explorer: ${explorerTx(signature)}`);
    results.push({ kind: 'success', campaign, goal, raised: 0n, signatures: [{ label: 'create_campaign', signature }] });
  }

  // ---- Pledge.
  step(3, 'Donors pledge 1 SOL each');
  for (const result of results) {
    const pledgers = result.kind === 'refund' ? donors : donors.slice(0, 2);
    for (const donor of pledgers) {
      const signature = await send([await pledgeIx(donor, result.campaign, SOL)], donor);
      result.raised += SOL;
      detail(`${result.kind.padEnd(7)} pledge ${donor.address}  ${explorerTx(signature)}`);
      result.signatures.push({ label: 'pledge', signature });
    }
  }

  // ---- Wait once for both campaigns.
  step(4, 'Waiting for the deadline (finalize unlocks only after it passes)');
  await waitForDeadline(deadline);

  // ---- Finalize.
  step(5, 'Finalizing both campaigns (anyone can call)');
  const refundResult = results.find((r) => r.kind === 'refund');
  const successResult = results.find((r) => r.kind === 'success');

  for (const result of results) {
    const signature = await send([finalizeIx(payer, result.campaign)], payer);
    result.signatures.push({ label: 'finalize', signature });
    const account = await fetchCampaign(result.campaign);
    detail(`${result.kind.padEnd(7)} -> status ${account?.status ?? 'unknown'}  ${explorerTx(signature)}`);
    if (account) result.raised = account.raised;
  }

  // ---- Hero beat: refund_all.
  if (refundResult) {
    const account = await fetchCampaign(refundResult.campaign);
    const donorsOnChain = account?.donors ?? [];
    step(6, `refund_all: repaying ${donorsOnChain.length} donors in ONE transaction`);
    const before = await Promise.all(donorsOnChain.map((donor) => balance(donor)));
    const signature = await send([await refundAllIx(payer, refundResult.campaign, donorsOnChain)], payer);
    const after = await Promise.all(donorsOnChain.map((donor) => balance(donor)));
    donorsOnChain.forEach((donor, i) => {
      const delta = after[i]! - before[i]!;
      detail(`donor[${i}] ${donor}  +${sol(delta)} SOL`);
    });
    detail(`explorer: ${explorerTx(signature)}`);
    refundResult.signatures.push({ label: 'refund_all', signature });
  }

  // ---- Success beat: claim_success.
  if (successResult) {
    step(7, 'claim_success: creator withdraws the raised funds');
    const before = await balance(payer.address);
    const signature = await send([await claimSuccessIx(payer, successResult.campaign)], payer);
    const after = await balance(payer.address);
    detail(`creator delta: +${sol(after - before)} SOL`);
    detail(`explorer: ${explorerTx(signature)}`);
    successResult.signatures.push({ label: 'claim_success', signature });
  }

  // ---- Summary.
  console.log(bold('\nSummary'));
  for (const result of results) {
    const account = await fetchCampaign(result.campaign);
    console.log(
      `    ${result.kind.padEnd(7)} ${result.campaign}  ` +
        `raised=${sol(account?.raised ?? 0n)}/${sol(account?.goal ?? 0n)} SOL  status=${account?.status ?? '?'}`,
    );
    console.log(`            ${explorerAddress(result.campaign)}`);
    for (const { label, signature } of result.signatures) {
      console.log(dim(`            ${label.padEnd(14)} ${signature}`));
    }
  }
  console.log(green('\nDemo complete.'));
}

main().catch((error: unknown) => {
  console.error(`\n\u001b[31mDemo failed:\u001b[0m ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
