import { Router } from 'express';
import { wrap } from '../../../api/middleware/error.js';
import { queryString } from '../validation.js';
import type { InstructionsService } from './service.js';

export const instructionsEndpoints = {
  create: { method: 'GET', path: '/instructions/create', auth: false },
  pledge: { method: 'GET', path: '/instructions/pledge', auth: false },
  finalize: { method: 'GET', path: '/instructions/finalize', auth: false },
  claimSuccess: { method: 'GET', path: '/instructions/claim-success', auth: false },
  claimRefund: { method: 'GET', path: '/instructions/claim-refund', auth: false },
  refundAll: { method: 'GET', path: '/instructions/refund-all/:campaign', auth: false },
} as const;

export class InstructionsEndpoints {
  public readonly router = Router();

  public constructor(service: InstructionsService) {
    const router = this.router;
    router.get('/create', wrap(async (req, res) => res.json(await service.create({
      creator: queryString(req.query.creator), campaignId: queryString(req.query.campaignId),
      goal: queryString(req.query.goal), deadline: queryString(req.query.deadline),
      descHash: queryString(req.query.descHash) || undefined,
    }))));
    router.get('/pledge', wrap(async (req, res) => res.json(await service.pledge({
      donor: queryString(req.query.donor), campaign: queryString(req.query.campaign), amount: queryString(req.query.amount),
    }))));
    router.get('/finalize', wrap(async (req, res) => res.json(service.finalize({
      caller: queryString(req.query.caller), campaign: queryString(req.query.campaign),
    }))));
    router.get('/claim-success', wrap(async (req, res) => res.json(await service.claimSuccess({
      creator: queryString(req.query.creator), campaign: queryString(req.query.campaign),
    }))));
    router.get('/claim-refund', wrap(async (req, res) => res.json(await service.claimRefund({
      donor: queryString(req.query.donor), campaign: queryString(req.query.campaign),
    }))));
    router.get('/refund-all/:campaign', wrap(async (req, res) => res.json(await service.refundAll({
      caller: queryString(req.query.caller), campaign: req.params.campaign!,
    }))));
  }
}
