import { createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { address, getAddressEncoder } from '@solana/kit';
import { z } from 'zod';
import { ApiError } from '../../../api/middleware/error.js';
import { AccountRepository } from '../repository.js';
import { AuthService } from '../auth/service.js';
import type { SessionDto } from '../auth/types.js';
import type { WalletChallengeDto, WalletChallengeInput, WalletDto, WalletProofInput } from './types.js';

const proofSchema = z.object({
  challengeId: z.string().uuid(),
  signatureBase64: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});

function walletAddress(value: string): string {
  try { return address(value); } catch { throw new ApiError(400, 'Invalid Solana wallet address'); }
}

export class WalletService {
  public constructor(
    private readonly repository: AccountRepository,
    private readonly auth: AuthService,
    private readonly options: { origin: string; cluster: string; challengeTtlSeconds?: number },
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  public list(userId: string): WalletDto[] {
    return this.repository.listWallets(userId);
  }

  public requireLinked(userId: string, value: string): WalletDto {
    const wallet = this.repository.findWallet(walletAddress(value));
    if (!wallet || wallet.userId !== userId) throw new ApiError(403, 'Wallet is not linked to this account');
    return wallet;
  }

  public challenge(input: WalletChallengeInput, userId?: string): WalletChallengeDto {
    const body = z.object({ address: z.string(), purpose: z.enum(['link', 'login']) }).parse(input);
    const value = walletAddress(body.address);
    const wallet = this.repository.findWallet(value);
    if (body.purpose === 'link') {
      if (!userId) throw new ApiError(401, 'Sign in before linking a wallet');
      if (wallet && wallet.userId !== userId) throw new ApiError(409, 'Wallet is already linked to another account');
    } else {
      if (!wallet) throw new ApiError(404, 'Wallet is not linked to an account');
      userId = wallet.userId;
    }
    if (!userId || !this.repository.getUser(userId)) throw new ApiError(401, 'Account not found');
    const id = randomUUID();
    const now = this.now();
    const expiresAt = now + (this.options.challengeTtlSeconds ?? 300);
    const message = [
      'Bestcrow wallet verification',
      `Origin: ${this.options.origin}`,
      `Network: ${this.options.cluster}`,
      `Action: ${body.purpose}`,
      `Account: ${userId}`,
      `Wallet: ${value}`,
      `Nonce: ${randomBytes(32).toString('hex')}`,
      `Issued at: ${new Date(now * 1000).toISOString()}`,
      `Expires at: ${new Date(expiresAt * 1000).toISOString()}`,
      'This signature verifies wallet ownership. It does not authorize a payment.',
    ].join('\n');
    this.repository.createChallenge({ id, userId, address: value, purpose: body.purpose, message, expiresAt }, now);
    return { id, message, expiresAt };
  }

  private verifyProof(input: WalletProofInput, purpose: 'link' | 'login', userId?: string) {
    const body = proofSchema.parse(input);
    const challenge = this.repository.getChallenge(body.challengeId);
    const now = this.now();
    if (!challenge || challenge.usedAt !== null || challenge.expiresAt <= now || challenge.purpose !== purpose ||
      (userId !== undefined && challenge.userId !== userId)) {
      throw new ApiError(401, 'Wallet challenge is invalid, expired, or already used');
    }
    const signature = Buffer.from(body.signatureBase64, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== body.signatureBase64) {
      throw new ApiError(400, 'Signature must contain 64 bytes encoded as base64');
    }
    // Ed25519 public keys use a fixed SPKI prefix; the address supplies the 32 key bytes.
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'),
        new Uint8Array(getAddressEncoder().encode(address(challenge.address)))]),
      format: 'der', type: 'spki',
    });
    if (!verify(null, Buffer.from(challenge.message, 'utf8'), key, signature)) {
      throw new ApiError(401, 'Wallet signature is invalid');
    }
    if (!this.repository.consumeChallenge(challenge.id, now)) throw new ApiError(401, 'Wallet challenge already used');
    return challenge;
  }

  public link(userId: string, input: WalletProofInput): WalletDto {
    const challenge = this.verifyProof(input, 'link', userId);
    const existing = this.repository.findWallet(challenge.address);
    if (existing) {
      if (existing.userId !== userId) throw new ApiError(409, 'Wallet is already linked to another account');
      return existing;
    }
    return this.repository.createWallet(userId, challenge.address, this.now());
  }

  public login(input: WalletProofInput): SessionDto {
    const challenge = this.verifyProof(input, 'login');
    this.requireLinked(challenge.userId, challenge.address);
    return this.auth.issueSession(challenge.userId);
  }

  public unlink(userId: string, value: string): void {
    this.requireLinked(userId, value);
    this.repository.deleteWallet(userId, value);
  }
}
