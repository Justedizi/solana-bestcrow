import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../../../api/middleware/error.js';
import type { PaymentDto } from './types.js';

interface PaymentRow {
  id: string;
  user_id: string;
  campaign: string;
  wallet: string;
  amount: string;
  status: PaymentDto['status'];
  signature: string | null;
  created_at: number;
  expires_at: number;
  confirmed_at: number | null;
  instruction: string;
  memo_instruction: string;
  reference: string;
  cluster: string;
}

export class PaymentRepository {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS account_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        campaign TEXT NOT NULL,
        wallet TEXT NOT NULL,
        amount TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
        signature TEXT UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        confirmed_at INTEGER,
        instruction TEXT NOT NULL,
        memo_instruction TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        cluster TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_account_payments_user ON account_payments(user_id, created_at);
    `);
  }

  create(payment: PaymentDto): PaymentDto {
    this.db.prepare(`
      INSERT INTO account_payments (
        id, user_id, campaign, wallet, amount, status, signature,
        created_at, expires_at, confirmed_at, instruction, memo_instruction, reference, cluster
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.id, payment.userId, payment.campaign, payment.wallet, payment.amount,
      payment.status, payment.signature, payment.createdAt, payment.expiresAt, payment.confirmedAt,
      JSON.stringify(payment.instruction), JSON.stringify(payment.memoInstruction), payment.reference, payment.cluster,
    );
    return payment;
  }

  get(userId: string, id: string): PaymentDto | null {
    const row = this.db.prepare('SELECT * FROM account_payments WHERE id = ? AND user_id = ?')
      .get(id, userId) as unknown as PaymentRow | undefined;
    return row ? this.toDto(row) : null;
  }

  list(userId: string): PaymentDto[] {
    const rows = this.db.prepare('SELECT * FROM account_payments WHERE user_id = ? ORDER BY created_at DESC, id')
      .all(userId) as unknown as PaymentRow[];
    return rows.map((row) => this.toDto(row));
  }

  hasSignature(signature: string, exceptId: string): boolean {
    return this.db.prepare('SELECT id FROM account_payments WHERE signature = ? AND id <> ?')
      .get(signature, exceptId) !== undefined;
  }

  confirm(userId: string, id: string, signature: string, confirmedAt: number): PaymentDto {
    const existing = this.get(userId, id);
    if (!existing) throw new ApiError(404, 'Payment not found');
    if (existing.status === 'confirmed') {
      if (existing.signature === signature) return existing;
      throw new ApiError(409, 'Payment already confirmed with a different transaction');
    }
    if (this.hasSignature(signature, id)) throw new ApiError(409, 'Transaction already used for another payment');
    try {
      this.db.prepare(`
        UPDATE account_payments SET status = 'confirmed', signature = ?, confirmed_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).run(signature, confirmedAt, id, userId);
    } catch (error) {
      if (this.hasSignature(signature, id)) throw new ApiError(409, 'Transaction already used for another payment');
      throw error;
    }
    const confirmed = this.get(userId, id);
    if (!confirmed || confirmed.signature !== signature) {
      throw new ApiError(409, 'Payment was confirmed by another request');
    }
    return confirmed;
  }

  private toDto(row: PaymentRow): PaymentDto {
    return {
      id: row.id,
      userId: row.user_id,
      campaign: row.campaign,
      wallet: row.wallet,
      amount: row.amount,
      status: row.status,
      signature: row.signature,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      instruction: JSON.parse(row.instruction) as PaymentDto['instruction'],
      memoInstruction: JSON.parse(row.memo_instruction) as PaymentDto['memoInstruction'],
      reference: row.reference,
      cluster: row.cluster,
    };
  }
}
