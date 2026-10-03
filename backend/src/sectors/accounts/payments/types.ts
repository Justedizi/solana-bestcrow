import type { InstructionPlan } from '../../../solana/program.js';
import type { Signature } from '@solana/kit';

export interface CreatePaymentInput {
  campaign: string;
  wallet: string;
  /** SOL amount in lamports; decimal integer, never a JavaScript number. */
  amount: string;
}

export interface ConfirmPaymentInput {
  signature: string;
}

export interface PaymentDto extends CreatePaymentInput {
  id: string;
  userId: string;
  status: 'pending' | 'confirmed';
  signature: string | null;
  /** All payment timestamps are Unix seconds. */
  createdAt: number;
  expiresAt: number;
  confirmedAt: number | null;
  instruction: InstructionPlan;
  memoInstruction: InstructionPlan;
  reference: string;
  cluster: string;
}

export interface PaymentVerifier {
  verify(payment: PaymentDto, signature: string): Promise<void>;
}

export interface LinkedWallets {
  requireLinked(userId: string, wallet: string): unknown | Promise<unknown>;
}

export interface PaymentInstructions {
  pledge(input: { campaign: string; donor: string; amount: string }): Promise<InstructionPlan>;
}

export interface PaymentTransactionRpc {
  getTransaction(
    signature: Signature,
    config: { commitment: 'finalized'; encoding: 'json'; maxSupportedTransactionVersion: 1 },
  ): { send(): Promise<unknown> };
}
