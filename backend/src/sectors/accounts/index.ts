import { Router, type RequestHandler } from 'express';
import { config } from '../../config.js';
import type { Store } from '../../db/index.js';
import { RateLimiter } from '../../core/rateLimiter.js';
import { wrap } from '../../api/middleware/error.js';
import type { ChainSector } from '../chain/index.js';
import { AccountRepository } from './repository.js';
import { AuthEndpoints, AuthService } from './auth/index.js';
import { WalletEndpoints, WalletService } from './wallets/index.js';
import { PaymentEndpoints, PaymentRepository, PaymentService, RpcPaymentVerifier } from './payments/index.js';
import type { PaymentVerifier } from './payments/types.js';
import { z } from 'zod';

export interface AccountSectorOptions {
  origin?: string;
  sessionTtlSeconds?: number;
  challengeTtlSeconds?: number;
  authAttemptsPerMinute?: number;
  paymentVerifier?: PaymentVerifier;
  /** Clock in milliseconds, shared by sessions, wallet challenges and payments. */
  now?: () => number;
}

export class AccountsSector {
  public readonly auth: AuthService;
  public readonly wallets: WalletService;
  public readonly payments: PaymentService;
  public readonly router = Router();

  public constructor(store: Store, chain: ChainSector, options: AccountSectorOptions = {}) {
    const now = options.now ?? Date.now;
    const seconds = () => Math.floor(now() / 1000);
    const repository = new AccountRepository(store.db);
    const network = chain.system.config();
    this.auth = new AuthService(repository, options.sessionTtlSeconds ?? config.accounts.sessionTtlSeconds, seconds);
    this.wallets = new WalletService(repository, this.auth, {
      origin: options.origin ?? config.accounts.origin,
      cluster: network.cluster,
      challengeTtlSeconds: options.challengeTtlSeconds ?? config.accounts.challengeTtlSeconds,
    }, seconds);
    this.payments = new PaymentService({
      repository: new PaymentRepository(store.db),
      wallets: this.wallets,
      instructions: chain.instructions,
      verifier: options.paymentVerifier ?? new RpcPaymentVerifier(network.rpcUrl),
      cluster: network.cluster,
      now,
    });
    const limiter = new RateLimiter(options.authAttemptsPerMinute ?? config.accounts.authAttemptsPerMinute, 60_000, now);
    this.router.use('/auth', new AuthEndpoints(this.auth, this.wallets, this.requireSession, limiter).router);
    this.router.use('/wallets', new WalletEndpoints(this.wallets, this.auth, this.requireSession, limiter).router);
    this.router.use('/payments', new PaymentEndpoints(this.payments, this.requireSession).router);
    this.router.get('/me', this.requireSession, wrap(async (_req, res) => {
      res.json({ user: res.locals.user, wallets: this.wallets.list(res.locals.user.id as string) });
    }));
    this.router.get('/me/contributions', this.requireSession, wrap(async (_req, res) => {
      const wallets = this.wallets.list(res.locals.user.id as string);
      res.json(chain.campaigns.contributions(wallets.map((wallet) => wallet.address)));
    }));
    this.router.get('/me/profile', this.requireSession, wrap(async (_req, res) => {
      res.json(repository.getCreatorProfile(res.locals.user.id as string));
    }));
    this.router.put('/me/profile', this.requireSession, wrap(async (req, res) => {
      const body = z.object({ organizationName: z.string().trim().min(1).max(160).nullable(),
        organizationDescription: z.string().max(4_000).nullable(), website: z.string().url().max(500).nullable() }).parse(req.body);
      res.json(repository.upsertCreatorProfile({ userId: res.locals.user.id as string, ...body }, seconds()));
    }));
  }

  public readonly requireSession: RequestHandler = (req, res, next) => {
    try {
      const session = this.auth.authenticate(req.headers.authorization);
      res.locals.user = session.user;
      res.locals.sessionId = session.sessionId;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { AccountRepository } from './repository.js';
export * from './auth/index.js';
export * from './wallets/index.js';
export * from './payments/index.js';
export type { AccountDto } from './types.js';
