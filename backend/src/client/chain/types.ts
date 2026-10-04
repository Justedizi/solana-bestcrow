export type {
  CampaignDto,
  DonorDto,
  EventDto,
  MetadataDto,
  ListCampaignFilters,
  Paginated,
  ProgramStats,
  MetadataInput,
  RewardInput,
  CreateCampaignInput,
  PledgeInput,
  FinalizeInput,
  ClaimSuccessInput,
  ClaimRefundInput,
  RefundAllInput,
  ChainConfig,
  ProgramInfo,
  HealthInfo,
  InstructionPlanDto,
} from '../../sectors/chain/types.js';

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface CampaignPdaInput {
  creator: string;
  campaignId: string;
}
