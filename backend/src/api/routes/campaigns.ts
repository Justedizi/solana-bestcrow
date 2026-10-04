import type { Router } from 'express';
import type { Store } from '../../db/index.js';
import { CampaignsEndpoints, CampaignsService } from '../../sectors/chain/index.js';

export function campaignsRouter(store: Store): Router {
  return new CampaignsEndpoints(new CampaignsService(store)).router;
}
