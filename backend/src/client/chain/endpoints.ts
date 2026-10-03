import type { EndpointDefinition } from '../../core/endpoint.js';
import type {
  CampaignDto,
  CampaignPdaInput,
  ChainConfig,
  ClaimRefundInput,
  ClaimSuccessInput,
  CreateCampaignInput,
  DonorDto,
  EventDto,
  FinalizeInput,
  HealthInfo,
  InstructionPlanDto,
  ListCampaignFilters,
  MetadataDto,
  MetadataInput,
  Paginated,
  PaginationInput,
  PledgeInput,
  ProgramInfo,
  ProgramStats,
} from './types.js';

type Empty = Record<string, never>;
type CampaignPath = { path: { address: string } };
type CampaignPage = CampaignPath & { query?: PaginationInput };

export interface ChainEndpoints {
  config: EndpointDefinition<Empty, ChainConfig>;
  health: EndpointDefinition<Empty, HealthInfo>;
  program: EndpointDefinition<Empty, ProgramInfo>;
  stats: EndpointDefinition<Empty, ProgramStats>;
  campaigns: EndpointDefinition<{ query?: ListCampaignFilters }, Paginated<CampaignDto>>;
  campaign: EndpointDefinition<CampaignPath, CampaignDto>;
  campaignByPda: EndpointDefinition<{ query: CampaignPdaInput }, CampaignDto>;
  donors: EndpointDefinition<CampaignPage, Paginated<DonorDto>>;
  events: EndpointDefinition<CampaignPage, Paginated<EventDto>>;
  metadata: EndpointDefinition<CampaignPath, MetadataDto>;
  updateMetadata: EndpointDefinition<CampaignPath & { body: MetadataInput }, MetadataDto>;
  createCampaign: EndpointDefinition<{ query: CreateCampaignInput }, InstructionPlanDto>;
  pledge: EndpointDefinition<{ query: PledgeInput }, InstructionPlanDto>;
  finalize: EndpointDefinition<{ query: FinalizeInput }, InstructionPlanDto>;
  claimSuccess: EndpointDefinition<{ query: ClaimSuccessInput }, InstructionPlanDto>;
  claimRefund: EndpointDefinition<{ query: ClaimRefundInput }, InstructionPlanDto>;
  refundAll: EndpointDefinition<{ path: { campaign: string }; query: { caller: string } }, InstructionPlanDto>;
}

export const chainEndpoints: ChainEndpoints = {
  config: { path: 'api/chain/config', method: 'GET', auth: 'public' },
  health: { path: 'api/health', method: 'GET', auth: 'public' },
  program: { path: 'api/program', method: 'GET', auth: 'public' },
  stats: { path: 'api/stats', method: 'GET', auth: 'public' },
  campaigns: { path: 'api/campaigns', method: 'GET', auth: 'public' },
  campaign: { path: 'api/campaigns/:address', method: 'GET', auth: 'public' },
  campaignByPda: { path: 'api/campaigns/by-pda', method: 'GET', auth: 'public' },
  donors: { path: 'api/campaigns/:address/donors', method: 'GET', auth: 'public' },
  events: { path: 'api/campaigns/:address/events', method: 'GET', auth: 'public' },
  metadata: { path: 'api/campaigns/:address/metadata', method: 'GET', auth: 'public' },
  updateMetadata: { path: 'api/campaigns/:address/metadata', method: 'PUT', auth: 'required' },
  createCampaign: { path: 'api/instructions/create', method: 'GET', auth: 'public' },
  pledge: { path: 'api/instructions/pledge', method: 'GET', auth: 'public' },
  finalize: { path: 'api/instructions/finalize', method: 'GET', auth: 'public' },
  claimSuccess: { path: 'api/instructions/claim-success', method: 'GET', auth: 'public' },
  claimRefund: { path: 'api/instructions/claim-refund', method: 'GET', auth: 'public' },
  refundAll: { path: 'api/instructions/refund-all/:campaign', method: 'GET', auth: 'public' },
};
