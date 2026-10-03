import { Router } from 'express';
import { address as parseAddressValue, type Address } from '@solana/kit';
import type { Store } from '../../db/index.js';
import {
  claimRefundPlan,
  claimSuccessPlan,
  createCampaignPlan,
  finalizePlan,
  fromHex,
  pledgePlan,
  refundAllPlan,
} from '../../solana/program.js';
import { badRequest, notFound, wrap } from '../middleware/error.js';

const parseAddress = (value: string): Address => {
  try {
    return parseAddressValue(value);
  } catch {
    throw badRequest(`Invalid Solana address: ${value}`);
  }
};

const requireU64 = (value: unknown, field: string): bigint => {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  if (!/^\d+$/.test(raw)) throw badRequest(`${field} must be an unsigned integer string`);
  return BigInt(raw);
};

const query = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Stateless instruction builders: returns the accounts and hex-encoded data a client
 * needs to assemble a transaction. No signing happens here.
 */
export function instructionsRouter(store: Store): Router {
  const router = Router();

  router.get(
    '/create',
    wrap(async (req, res) => {
      const creator = parseAddress(String(req.query.creator ?? ''));
      const campaignId = requireU64(req.query.campaignId, 'campaignId');
      const goal = requireU64(req.query.goal, 'goal');
      const deadline = requireU64(req.query.deadline, 'deadline');
      const descHashRaw = query(req.query.descHash) ?? '00'.repeat(32);
      if (!/^[0-9a-fA-F]{64}$/.test(descHashRaw)) throw badRequest('descHash must be 32 hex-encoded bytes');
      const plan = await createCampaignPlan({
        creator,
        campaignId,
        goal,
        deadline,
        descHash: fromHex(descHashRaw),
      });
      res.json(plan);
    }),
  );

  router.get(
    '/pledge',
    wrap(async (req, res) => {
      const donor = parseAddress(String(req.query.donor ?? ''));
      const campaign = parseAddress(String(req.query.campaign ?? ''));
      const amount = requireU64(req.query.amount, 'amount');
      res.json(await pledgePlan({ donor, campaign, amount }));
    }),
  );

  router.get(
    '/finalize',
    wrap(async (req, res) => {
      const caller = parseAddress(String(req.query.caller ?? ''));
      const campaign = parseAddress(String(req.query.campaign ?? ''));
      res.json(finalizePlan({ caller, campaign }));
    }),
  );

  router.get(
    '/claim-success',
    wrap(async (req, res) => {
      const creator = parseAddress(String(req.query.creator ?? ''));
      const campaign = parseAddress(String(req.query.campaign ?? ''));
      res.json(await claimSuccessPlan({ creator, campaign }));
    }),
  );

  router.get(
    '/claim-refund',
    wrap(async (req, res) => {
      const donor = parseAddress(String(req.query.donor ?? ''));
      const campaign = parseAddress(String(req.query.campaign ?? ''));
      res.json(await claimRefundPlan({ donor, campaign }));
    }),
  );

  router.get(
    '/refund-all/:campaign',
    wrap(async (req, res) => {
      const campaignAddress = parseAddress(req.params.campaign!);
      const caller = parseAddress(String(req.query.caller ?? ''));
      const campaign = store.getCampaign(campaignAddress);
      if (!campaign) throw notFound('Campaign not found');
      const donors = store.listDonors(campaignAddress).map((row) => row.donor as Address);
      res.json(
        await refundAllPlan({
          caller,
          campaign: campaignAddress,
          creator: campaign.creator as Address,
          donors,
        }),
      );
    }),
  );

  return router;
}
