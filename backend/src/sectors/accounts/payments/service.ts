import { randomUUID } from 'node:crypto';
import { address, createSolanaRpc, getBase58Encoder, signature as parseSignature } from '@solana/kit';
import { ApiError, badRequest, notFound } from '../../../api/middleware/error.js';
import type { InstructionPlan } from '../../../solana/program.js';
import { PaymentRepository } from './repository.js';
import type {
  ConfirmPaymentInput,
  CreatePaymentInput,
  LinkedWallets,
  PaymentDto,
  PaymentInstructions,
  PaymentTransactionRpc,
  PaymentVerifier,
} from './types.js';

const PAYMENT_LIFETIME_SECONDS = 15 * 60;
const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const MAX_U64 = (1n << 64n) - 1n;

interface PaymentServiceDependencies {
  repository: PaymentRepository;
  wallets: LinkedWallets;
  instructions: PaymentInstructions;
  verifier: PaymentVerifier;
  cluster: string;
  now?: () => number;
}

export class PaymentService {
  private readonly now: () => number;

  constructor(private readonly dependencies: PaymentServiceDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async create(userId: string, input: CreatePaymentInput): Promise<PaymentDto> {
    let wallet;
    let campaign;
    try {
      wallet = address(input.wallet);
      campaign = address(input.campaign);
    } catch {
      throw badRequest('Invalid Solana wallet or campaign address');
    }
    if (typeof input.amount !== 'string' || input.amount.length > 20 || !/^[1-9][0-9]*$/.test(input.amount)
      || BigInt(input.amount) > MAX_U64) {
      throw badRequest('amount must be a positive u64 integer string in lamports');
    }
    await this.dependencies.wallets.requireLinked(userId, wallet);
    const instruction = await this.dependencies.instructions.pledge({
      campaign,
      donor: wallet,
      amount: input.amount,
    });
    const id = randomUUID();
    const reference = `bestcrow:payment:${id}`;
    const createdAt = Math.floor(this.now() / 1000);
    const memoInstruction: InstructionPlan = {
      name: 'payment_reference',
      programId: MEMO_PROGRAM,
      accounts: [{ pubkey: wallet, signer: true, writable: false }],
      dataHex: Buffer.from(reference, 'utf8').toString('hex'),
    };
    return this.dependencies.repository.create({
      id,
      userId,
      campaign,
      wallet,
      amount: input.amount,
      status: 'pending',
      signature: null,
      createdAt,
      expiresAt: createdAt + PAYMENT_LIFETIME_SECONDS,
      confirmedAt: null,
      instruction,
      memoInstruction,
      reference,
      cluster: this.dependencies.cluster,
    });
  }

  list(userId: string): PaymentDto[] {
    return this.dependencies.repository.list(userId);
  }

  get(userId: string, id: string): PaymentDto {
    const payment = this.dependencies.repository.get(userId, id);
    if (!payment) throw notFound('Payment not found');
    return payment;
  }

  async confirm(userId: string, id: string, input: ConfirmPaymentInput): Promise<PaymentDto> {
    const payment = this.get(userId, id);
    if (payment.cluster !== this.dependencies.cluster) {
      throw new ApiError(409, 'Payment belongs to a different Solana cluster');
    }
    try {
      parseSignature(input.signature);
    } catch {
      throw badRequest('Invalid transaction signature');
    }
    if (payment.status === 'confirmed') {
      if (payment.signature === input.signature) return payment;
      throw new ApiError(409, 'Payment already confirmed with a different transaction');
    }
    if (this.dependencies.repository.hasSignature(input.signature, id)) {
      throw new ApiError(409, 'Transaction already used for another payment');
    }
    await this.dependencies.verifier.verify(payment, input.signature);
    return this.dependencies.repository.confirm(userId, id, input.signature, Math.floor(this.now() / 1000));
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const integer = (value: unknown): number | null => {
  const number = typeof value === 'bigint' ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

interface TransactionAccount {
  address: string;
  signer: boolean;
  writable: boolean;
}

/** Reads settlement only; wallets keep the private keys and submit transactions. */
export class RpcPaymentVerifier implements PaymentVerifier {
  private readonly rpc: PaymentTransactionRpc;

  constructor(rpcUrl: string, rpc?: PaymentTransactionRpc) {
    this.rpc = rpc ?? createSolanaRpc(rpcUrl);
  }

  async verify(payment: PaymentDto, signature: string): Promise<void> {
    const result = await this.rpc.getTransaction(parseSignature(signature), {
      encoding: 'json',
      commitment: 'finalized',
      maxSupportedTransactionVersion: 1,
    }).send();
    if (result === null) throw new ApiError(409, 'Transaction has not finalized on this cluster');
    const transactionResult = record(result);
    const meta = record(transactionResult?.meta);
    const transaction = record(transactionResult?.transaction);
    const message = record(transaction?.message);
    const header = record(message?.header);
    if (!meta || meta.err !== null || !message || !header) {
      throw new ApiError(422, 'Transaction failed or RPC returned invalid transaction data');
    }
    const signatures = strings(transaction?.signatures);
    if (signatures?.[0] !== signature) throw new ApiError(422, 'Transaction signature does not match');
    const blockTime = integer(transactionResult?.blockTime);
    // Solana's estimated block time can lag server time; the unique signed memo prevents old-payment replay.
    if (blockTime === null || blockTime > payment.expiresAt) {
      throw new ApiError(422, 'Transaction falls outside the payment validity period');
    }
    const accounts = this.accounts(message, header, meta);
    if (!accounts.some((account) => account.address === payment.wallet && account.signer)) {
      throw new ApiError(422, 'Payment wallet must sign the transaction');
    }
    const instructions = message.instructions;
    if (!Array.isArray(instructions)
      || !instructions.some((instruction) => this.matches(instruction, accounts, payment.instruction))
      || !instructions.some((instruction) => this.matches(instruction, accounts, payment.memoInstruction))) {
      throw new ApiError(422, 'Transaction does not contain the expected pledge and payment reference');
    }
  }

  private accounts(
    message: Record<string, unknown>,
    header: Record<string, unknown>,
    meta: Record<string, unknown>,
  ): TransactionAccount[] {
    const keys = strings(message.accountKeys);
    const signed = integer(header.numRequiredSignatures);
    const readonlySigned = integer(header.numReadonlySignedAccounts);
    const readonlyUnsigned = integer(header.numReadonlyUnsignedAccounts);
    if (!keys || signed === null || readonlySigned === null || readonlyUnsigned === null
      || signed > keys.length || readonlySigned > signed || readonlyUnsigned > keys.length - signed) {
      throw new ApiError(422, 'RPC returned invalid transaction accounts');
    }
    const accounts = keys.map((key, index) => ({
      address: key,
      signer: index < signed,
      writable: index < signed ? index < signed - readonlySigned : index < keys.length - readonlyUnsigned,
    }));
    const loaded = record(meta.loadedAddresses);
    if (loaded) {
      const writable = strings(loaded.writable);
      const readonly = strings(loaded.readonly);
      if (!writable || !readonly) throw new ApiError(422, 'RPC returned invalid lookup table accounts');
      accounts.push(...writable.map((key) => ({ address: key, signer: false, writable: true })));
      accounts.push(...readonly.map((key) => ({ address: key, signer: false, writable: false })));
    }
    return accounts;
  }

  private matches(value: unknown, accounts: TransactionAccount[], plan: InstructionPlan): boolean {
    const instruction = record(value);
    if (!instruction || typeof instruction.data !== 'string' || !Array.isArray(instruction.accounts)) return false;
    const accountIndices = instruction.accounts;
    const programIndex = integer(instruction.programIdIndex);
    if (programIndex === null || accounts[programIndex]?.address !== plan.programId
      || instruction.accounts.length !== plan.accounts.length) return false;
    let dataHex: string;
    try {
      dataHex = Buffer.from(getBase58Encoder().encode(instruction.data)).toString('hex');
    } catch {
      return false;
    }
    return dataHex === plan.dataHex && plan.accounts.every((expected, index) => {
      const accountIndex = integer(accountIndices[index]);
      if (accountIndex === null) return false;
      const actual = accounts[accountIndex];
      return actual?.address === expected.pubkey
        && (!expected.signer || actual.signer)
        && (!expected.writable || actual.writable);
    });
  }
}
