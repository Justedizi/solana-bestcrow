import { Router, type RequestHandler } from 'express';
import { ApiError, notFound, wrap } from '../../../api/middleware/error.js';
import { queryPagination, queryString } from '../validation.js';
import type { CampaignsService } from './service.js';
import type { ListCampaignFilters } from './types.js';

export const campaignsEndpoints = {
  list: { method: 'GET', path: '/campaigns', auth: false },
  byPda: { method: 'GET', path: '/campaigns/by-pda', auth: false },
  get: { method: 'GET', path: '/campaigns/:address', auth: false },
  donors: { method: 'GET', path: '/campaigns/:address/donors', auth: false },
  events: { method: 'GET', path: '/campaigns/:address/events', auth: false },
  metadata: { method: 'GET', path: '/campaigns/:address/metadata', auth: false },
  updateMetadata: { method: 'PUT', path: '/campaigns/:address/metadata', auth: true },
} as const;

const requireMetadataAuthentication: RequestHandler = (_req, _res, next) => {
  next(new ApiError(401, 'Metadata updates require an authenticated account'));
};

export class CampaignsEndpoints {
  public readonly router = Router();

  public constructor(service: CampaignsService, authorizeMetadata: RequestHandler = requireMetadataAuthentication) {
    const router = this.router;
    router.get('/', wrap(async (req, res) => {
      const sort = queryString(req.query.sort);
      const filters: ListCampaignFilters = {
        ...queryPagination(req.query), status: queryString(req.query.status) || undefined,
        creator: queryString(req.query.creator) || undefined, q: queryString(req.query.q) || undefined,
        sort: ['deadline', 'created', 'raised', 'progress'].includes(sort) ? sort as ListCampaignFilters['sort'] : 'created',
        order: req.query.order === 'asc' ? 'asc' : 'desc',
      };
      res.json(service.list(filters));
    }));
    router.get('/by-pda', wrap(async (req, res) => {
      const campaign = service.getByPda(queryString(req.query.creator), queryString(req.query.campaignId));
      if (!campaign) throw notFound('Campaign not found');
      res.json(campaign);
    }));
    router.get('/:address', wrap(async (req, res) => res.json(service.require(req.params.address!))));
    router.get('/:address/donors', wrap(async (req, res) => {
      const { limit, offset } = queryPagination(req.query);
      res.json(service.donors(req.params.address!, limit, offset));
    }));
    router.get('/:address/events', wrap(async (req, res) => {
      const { limit, offset } = queryPagination(req.query);
      res.json(service.events(req.params.address!, limit, offset));
    }));
    router.get('/:address/metadata', wrap(async (req, res) => {
      const metadata = service.metadata(req.params.address!);
      if (!metadata) throw notFound('No metadata for this campaign');
      res.json(metadata);
    }));
    router.put('/:address/metadata', authorizeMetadata, wrap(async (req, res) => {
      res.json(service.updateMetadata(req.params.address!, req.body));
    }));
  }
}
