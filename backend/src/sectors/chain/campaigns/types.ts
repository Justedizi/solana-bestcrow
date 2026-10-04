export interface CampaignDto {
  address: string;
  creator: string;
  campaignId: string;
  goal: string;
  goalSol: string;
  deadline: number;
  deadlineIso: string;
  descHash: string;
  raised: string;
  raisedSol: string;
  progress: number;
  paid: boolean;
  status: string;
  donorCount: number;
  vault: string | null;
  vaultLamports: string;
  vaultLamportsSol: string;
  slot: number;
  createdAt: number;
  updatedAt: number;
  metadata?: MetadataDto | null;
  donors?: DonorDto[];
}

export interface DonorDto {
  campaign: string;
  donor: string;
  amount: string;
  amountSol: string;
  claimed: boolean;
  updatedAt: number;
}

export interface EventDto {
  id: number;
  signature: string;
  slot: number;
  blockTime: number | null;
  eventName: string;
  campaign: string | null;
  donor: string | null;
  amount: string | null;
  status: string | null;
  payload: unknown;
  createdAt: number;
}

export interface MetadataDto {
  campaign: string;
  title: string | null;
  description: string | null;
  website: string | null;
  imageUrl: string | null;
  rewards: unknown;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RewardInput {
  title: string;
  description?: string;
  minSol?: string;
  quantity?: number;
}

export interface MetadataInput {
  title?: string;
  description?: string;
  website?: string;
  imageUrl?: string;
  rewards?: RewardInput[];
}

export interface ListCampaignFilters {
  status?: string;
  creator?: string;
  q?: string;
  sort?: 'deadline' | 'created' | 'raised' | 'progress';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProgramStats {
  campaigns: number;
  active: number;
  succeeded: number;
  refunded: number;
  totalRaised: string;
  totalRaisedSol: string;
  totalDonors: number;
  totalPledges: number;
  totalRefunded: string;
  totalRefundedSol: string;
  uniqueCreators: number;
}
