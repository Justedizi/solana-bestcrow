import type { Store } from '../db/index.js';
import { CampaignsService } from '../sectors/chain/index.js';
import type { ListCampaignFilters } from '../sectors/chain/types.js';

export type * from '../sectors/chain/campaigns/types.js';
export {
  lamportsToSol, toCampaignDto, toDonorDto, toEventDto, toMetadataDto, verifyDescription,
} from '../sectors/chain/campaigns/service.js';

export const listCampaigns = (store: Store, filters: ListCampaignFilters) => new CampaignsService(store).list(filters);
export const getCampaign = (store: Store, address: string) => new CampaignsService(store).get(address);
export const getCampaignByPda = (store: Store, creator: string, campaignId: string) => new CampaignsService(store).getByPda(creator, campaignId);
export const getStats = (store: Store) => new CampaignsService(store).stats();
