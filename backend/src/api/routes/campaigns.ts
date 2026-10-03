import { Router } from 'express';
import { z } from 'zod';
import { address as parseAddressValue } from '@solana/kit';
import type { Store } from '../../db/index.js';
import {
  getCampaign,
  getCampaignByPda,
  listCampaigns,
  toEventDto,
  toMetadataDto,
  toDonorDto,
  verifyDescription,
  type ListCampaignFilters,
} from '../../services/campaigns.js';
import { ApiError, badRequest, notFound, wrap } from '../middleware/error.js';

const rewardSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(500).optional(),
  minSol: z.string().max(40).optional(),
  quantity: z.number().int().positive().optional(),
});

const metadataSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().max(20_000).optional(),
    website: z.string().url().max(500).optional(),
    imageUrl: z.string().url().max(1_000).optional(),
    rewards: z.array(rewardSchema).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const parseAddress = (value: string): string => {
  try {
    return parseAddressValue(value);
  } catch {
    throw badRequest(`Invalid Solana address: ${value}`);
  }
};

const parsePagination = (query: Record<string, unknown>): { limit: number; offset: number } => ({
  limit: Math.min(Math.max(Number.parseInt(String(query.limit ?? '50'), 10) || 50, 1), 200),
  offset: Math.max(Number.parseInt(String(query.offset ?? '0'), 10) || 0, 0),
});

export function campaignsRouter(store: Store): Router {
  const router = Router();

  router.get(
    '/',
    wrap(async (req, res) => {
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'created';
      const filters: ListCampaignFilters = {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        creator: typeof req.query.creator === 'string' ? parseAddress(req.query.creator) : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        sort: (['deadline', 'created', 'raised', 'progress'] as const).includes(
          sortParam as ListCampaignFilters['sort'] & string,
        )
          ? (sortParam as ListCampaignFilters['sort'])
          : 'created',
        order: req.query.order === 'asc' ? 'asc' : 'desc',
        limit,
        offset,
      };
      res.json(listCampaigns(store, filters));
    }),
  );

  router.get(
    '/by-pda',
    wrap(async (req, res) => {
      const creator = typeof req.query.creator === 'string' ? parseAddress(req.query.creator) : null;
      const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : null;
      if (!creator || !campaignId || !/^\d+$/.test(campaignId)) {
        throw badRequest('creator and numeric campaignId are required');
      }
      const campaign = getCampaignByPda(store, creator, campaignId);
      if (!campaign) throw notFound('Campaign not found');
      res.json(campaign);
    }),
  );

  router.get(
    '/:address',
    wrap(async (req, res) => {
      const campaign = getCampaign(store, parseAddress(req.params.address!));
      if (!campaign) throw notFound('Campaign not found');
      res.json(campaign);
    }),
  );

  router.get(
    '/:address/donors',
    wrap(async (req, res) => {
      const campaign = getCampaign(store, parseAddress(req.params.address!));
      if (!campaign) throw notFound('Campaign not found');
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const donors = store.listDonors(campaign.address).map(toDonorDto);
      res.json({ items: donors.slice(offset, offset + limit), total: donors.length, limit, offset });
    }),
  );

  router.get(
    '/:address/events',
    wrap(async (req, res) => {
      const campaignAddress = parseAddress(req.params.address!);
      if (!store.getCampaign(campaignAddress)) throw notFound('Campaign not found');
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const events = store.listEvents(campaignAddress, limit, offset).map(toEventDto);
      res.json({ items: events, total: store.countEvents(campaignAddress), limit, offset });
    }),
  );

  router.get(
    '/:address/metadata',
    wrap(async (req, res) => {
      const campaignAddress = parseAddress(req.params.address!);
      const row = store.getMetadata(campaignAddress);
      if (!row) throw notFound('No metadata for this campaign');
      res.json(toMetadataDto(row));
    }),
  );

  router.put(
    '/:address/metadata',
    wrap(async (req, res) => {
      const campaignAddress = parseAddress(req.params.address!);
      const campaign = store.getCampaign(campaignAddress);
      if (!campaign) throw notFound('Campaign not found');
      const body = metadataSchema.parse(req.body);

      let verified = false;
      if (body.description !== undefined) {
        if (!verifyDescription(campaign.desc_hash, body.description)) {
          throw new ApiError(
            409,
            'Description does not match the on-chain SHA-256 commitment',
          );
        }
        verified = true;
      }

      store.upsertMetadata({
        campaign: campaignAddress,
        title: body.title ?? null,
        description: body.description ?? null,
        website: body.website ?? null,
        imageUrl: body.imageUrl ?? null,
        rewards: body.rewards ? JSON.stringify(body.rewards) : null,
        verified,
      });
      res.status(200).json(toMetadataDto(store.getMetadata(campaignAddress)!));
    }),
  );

  return router;
}
