import type { Router } from 'express';
import { config } from '../../config.js';
import type { Store } from '../../db/index.js';
import { CampaignsService, SystemEndpoints, SystemService } from '../../sectors/chain/index.js';
import { bus } from '../../util/bus.js';

export function systemRouter(store: Store): Router {
  return new SystemEndpoints(new SystemService(store, new CampaignsService(store), config, bus)).router;
}
