import { Router, type RequestHandler } from 'express';
import type { EventEmitter } from 'node:events';
import { config } from '../../config.js';
import type { Store } from '../../db/index.js';
import { PROGRAM_ID } from '../../solana/program.js';
import { bus } from '../../util/bus.js';
import { CampaignsService, CampaignsEndpoints } from './campaigns/index.js';
import { InstructionsService, InstructionsEndpoints, type CampaignAccountReader } from './instructions/index.js';
import { SystemService, SystemEndpoints, type ChainNetworkConfig } from './system/index.js';

export interface ChainSectorOptions {
  authorizeMetadata?: RequestHandler;
  readCampaignAccount?: CampaignAccountReader;
  /** Overrides must match the runtime network used by program builders and the indexer. */
  network?: Readonly<ChainNetworkConfig>;
  events?: EventEmitter;
  now?: () => number;
  uptime?: () => number;
}

export class ChainSector {
  public readonly campaigns: CampaignsService;
  public readonly instructions: InstructionsService;
  public readonly system: SystemService;
  public readonly router = Router();

  public constructor(store: Store, options: ChainSectorOptions = {}) {
    const network = Object.freeze({
      cluster: config.cluster,
      rpcUrl: config.rpcUrl,
      programId: PROGRAM_ID,
    });
    if (options.network && (['cluster', 'rpcUrl', 'programId'] as const).some((field) => options.network![field] !== network[field])) {
      throw new TypeError('Chain network must match the runtime configuration. Set CLUSTER, SOLANA_RPC_URL and CHARITY_VAULT_PROGRAM_ID before starting the backend.');
    }
    this.campaigns = new CampaignsService(store);
    this.instructions = new InstructionsService(options.readCampaignAccount, options.now);
    this.system = new SystemService(store, this.campaigns, network, options.events ?? bus, options.now, options.uptime);
    this.router.use(new SystemEndpoints(this.system).router);
    this.router.use('/campaigns', new CampaignsEndpoints(this.campaigns, options.authorizeMetadata).router);
    this.router.use('/instructions', new InstructionsEndpoints(this.instructions).router);
  }
}

export { CampaignsService, CampaignsEndpoints, campaignsEndpoints } from './campaigns/index.js';
export { InstructionsService, InstructionsEndpoints, instructionsEndpoints } from './instructions/index.js';
export { SystemService, SystemEndpoints, systemEndpoints } from './system/index.js';
export type * from './types.js';
