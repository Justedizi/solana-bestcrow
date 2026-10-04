import type { RequestExecutor } from '../../core/requester.js';
import { chainEndpoints } from './endpoints.js';
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
  RefundAllInput,
} from './types.js';

export class ChainService {
  public constructor(private readonly requester: RequestExecutor) {}

  public getConfig(): Promise<ChainConfig> { return this.requester.request(chainEndpoints.config); }
  public getHealth(): Promise<HealthInfo> { return this.requester.request(chainEndpoints.health); }
  public getProgram(): Promise<ProgramInfo> { return this.requester.request(chainEndpoints.program); }
  public getStats(): Promise<ProgramStats> { return this.requester.request(chainEndpoints.stats); }

  public listCampaigns(query: ListCampaignFilters = {}): Promise<Paginated<CampaignDto>> {
    return this.requester.request(chainEndpoints.campaigns, { params: { query } });
  }

  public getCampaign(address: string): Promise<CampaignDto> {
    return this.requester.request(chainEndpoints.campaign, { params: { path: { address } } });
  }

  public getCampaignByPda(query: CampaignPdaInput): Promise<CampaignDto> {
    return this.requester.request(chainEndpoints.campaignByPda, { params: { query } });
  }

  public listDonors(address: string, query: PaginationInput = {}): Promise<Paginated<DonorDto>> {
    return this.requester.request(chainEndpoints.donors, { params: { path: { address }, query } });
  }

  public listEvents(address: string, query: PaginationInput = {}): Promise<Paginated<EventDto>> {
    return this.requester.request(chainEndpoints.events, { params: { path: { address }, query } });
  }

  public getMetadata(address: string): Promise<MetadataDto> {
    return this.requester.request(chainEndpoints.metadata, { params: { path: { address } } });
  }

  public updateMetadata(address: string, body: MetadataInput): Promise<MetadataDto> {
    return this.requester.request(chainEndpoints.updateMetadata, { params: { path: { address }, body } });
  }

  public createCampaign(query: CreateCampaignInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.createCampaign, { params: { query } });
  }

  public pledge(query: PledgeInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.pledge, { params: { query } });
  }

  public finalize(query: FinalizeInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.finalize, { params: { query } });
  }

  public claimSuccess(query: ClaimSuccessInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.claimSuccess, { params: { query } });
  }

  public claimRefund(query: ClaimRefundInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.claimRefund, { params: { query } });
  }

  public refundAll({ campaign, caller }: RefundAllInput): Promise<InstructionPlanDto> {
    return this.requester.request(chainEndpoints.refundAll, { params: { path: { campaign }, query: { caller } } });
  }
}
