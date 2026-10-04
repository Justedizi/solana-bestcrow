import { Router, type RequestHandler } from 'express';
import { wrap } from '../../../api/middleware/error.js';
import { RateLimiter } from '../../../core/rateLimiter.js';
import { AuthService } from './service.js';
import { WalletService } from '../wallets/service.js';

export class AuthEndpoints {
  public readonly router = Router();

  public constructor(auth: AuthService, wallets: WalletService, requireSession: RequestHandler, limiter: RateLimiter) {
    this.router.post('/register', limiter.middleware, wrap(async (req, res) => {
      res.status(201).json(await auth.register(req.body));
    }));
    this.router.post('/login', limiter.middleware, wrap(async (req, res) => {
      res.json(await auth.login(req.body));
    }));
    this.router.post('/wallet-login', limiter.middleware, wrap(async (req, res) => {
      res.json(wallets.login(req.body));
    }));
    this.router.post('/logout', requireSession, wrap(async (_req, res) => {
      auth.logout(res.locals.sessionId as string);
      res.json({ ok: true });
    }));
  }
}
