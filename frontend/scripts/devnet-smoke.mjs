// Devnet end-to-end smoke test for the deployed Charity Vault program.
// Usage: node scripts/devnet-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getAddressEncoder,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const WS = 'wss://api.devnet.solana.com';
const PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID ?? '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG',
);
const SYSTEM = address('11111111111111111111111111111111');
const KEYPAIR = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), '.config/solana/id.json');

const DISC = {
  create: new Uint8Array([111, 131, 187, 98, 160, 193, 114, 244]),
  pledge: new Uint8Array([235, 47, 156, 254, 0, 88, 212, 142]),
  finalize: new Uint8Array([171, 61, 218, 56, 127, 115, 12, 217]),
  claimRefund: new Uint8Array([15, 16, 30, 161, 255, 228, 97, 60]),
};

const enc = new TextEncoder();
const addrEnc = getAddressEncoder();
const rpc = createSolanaRpc(RPC);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
const signer = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR, 'utf8'))));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const u64 = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
};
const i64 = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, v, true);
  return b;
};
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const meta = (a, role) => ({ address: a, role });
const ix = (accounts, data) => ({ programAddress: PROGRAM_ID, accounts, data });

async function pda(seeds) {
  const [found] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds });
  return found;
}

async function send(label, instructions) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    ...instructions.map((i) => (m) => appendTransactionMessageInstruction(i, m)),
  );
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: 'confirmed' });
  const signature = getSignatureFromTransaction(signed);
  console.log(`${label.padEnd(14)} https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  return signature;
}

const creator = signer.address;
const id = BigInt(Date.now());
const campaign = await pda([enc.encode('campaign'), addrEnc.encode(creator), u64(id)]);
const vault = await pda([enc.encode('vault'), addrEnc.encode(campaign)]);
const ledger = await pda([enc.encode('donor'), addrEnc.encode(campaign), addrEnc.encode(creator)]);
const goal = 1_000_000_000n;
const pledge = 500_000_000n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 30);

console.log(`program ${PROGRAM_ID}`);
console.log(`campaign ${campaign}\n`);

await send('create', [
  ix(
    [meta(creator, AccountRole.WRITABLE_SIGNER), meta(campaign, AccountRole.WRITABLE), meta(vault, AccountRole.WRITABLE), meta(SYSTEM, AccountRole.READONLY)],
    cat(DISC.create, u64(id), u64(goal), i64(deadline), new Uint8Array(32)),
  ),
]);

await send('pledge', [
  ix(
    [meta(creator, AccountRole.WRITABLE_SIGNER), meta(campaign, AccountRole.WRITABLE), meta(ledger, AccountRole.WRITABLE), meta(vault, AccountRole.WRITABLE), meta(SYSTEM, AccountRole.READONLY)],
    cat(DISC.pledge, u64(pledge)),
  ),
]);

console.log('waiting for the deadline to pass…');
await sleep(35_000);

await send('finalize', [
  ix([meta(creator, AccountRole.READONLY_SIGNER), meta(campaign, AccountRole.WRITABLE)], DISC.finalize),
]);

await send('claim_refund', [
  ix(
    [meta(creator, AccountRole.WRITABLE_SIGNER), meta(campaign, AccountRole.WRITABLE), meta(ledger, AccountRole.WRITABLE), meta(vault, AccountRole.WRITABLE)],
    DISC.claimRefund,
  ),
]);

const info = await rpc.getAccountInfo(campaign, { encoding: 'base64' }).send();
const data = Buffer.from(info.value.data[0], 'base64');
console.log(`\nstatus byte ${data[105]} (2 = Refunded), raised ${data.readBigUInt64LE(96)}`);
console.log('devnet end-to-end: OK');
