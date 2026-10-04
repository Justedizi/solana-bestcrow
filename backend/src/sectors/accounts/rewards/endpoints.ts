import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { wrap } from '../../../api/middleware/error.js';
import { WalletService } from '../wallets/service.js';
import { RewardService } from './service.js';

export class RewardEndpoints {
  public readonly router = Router();
  public constructor(private readonly rewards: RewardService, private readonly wallets: WalletService, requireSession: RequestHandler) {
    this.router.get('/campaigns/:campaign/rewards', wrap(async (req, res) => res.json(rewards.list(req.params.campaign!))));
    this.router.use(requireSession);
    this.router.get('/me/reward-claims', wrap(async (_req, res) => res.json(rewards.claims(wallets.list(res.locals.user.id as string)))));
    this.router.post('/rewards', wrap(async (req, res) => res.status(201).json(rewards.create(req.body, wallets.list(res.locals.user.id as string)))));
    this.router.post('/rewards/:id/claim', wrap(async (req, res) => res.status(201).json(rewards.claim(req.params.id!, z.unknown().parse(req.body?.delivery), wallets.list(res.locals.user.id as string)))));
  }
}
