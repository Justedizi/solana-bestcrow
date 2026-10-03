import { Router, type RequestHandler } from 'express';
import { wrap } from '../../../api/middleware/error.js';
import { RateLimiter } from '../../../core/rateLimiter.js';
import { AuthService } from '../auth/service.js';
import { WalletService } from './service.js';

export class WalletEndpoints {
  public readonly router = Router();

  public constructor(wallets: WalletService, auth: AuthService, requireSession: RequestHandler, limiter: RateLimiter) {
    this.router.post('/challenge', limiter.middleware, wrap(async (req, res) => {
      const userId = req.body?.purpose === 'link' ? auth.authenticate(req.headers.authorization).user.id : undefined;
      res.status(201).json(wallets.challenge(req.body, userId));
    }));
    this.router.get('/', requireSession, wrap(async (_req, res) => {
      res.json(wallets.list(res.locals.user.id as string));
    }));
    this.router.post('/link', limiter.middleware, requireSession, wrap(async (req, res) => {
      res.status(201).json(wallets.link(res.locals.user.id as string, req.body));
    }));
    this.router.delete('/:address', requireSession, wrap(async (req, res) => {
      wallets.unlink(res.locals.user.id as string, req.params.address!);
      res.json({ ok: true });
    }));
  }
}
