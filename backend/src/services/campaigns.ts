import type { CampaignRow, DonorRow, EventRow, MetadataRow, Store } from '../db/index.js';
import { sha256, toHex } from '../solana/program.js';

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

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function lamportsToSol(value: bigint): string {
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function toCampaignDto(row: CampaignRow): CampaignDto {
  const goal = BigInt(row.goal);
  const raised = BigInt(row.raised);
  const vaultLamports = BigInt(row.vault_lamports);
  const progress = goal > 0n ? Number((raised * 10_000n) / goal) / 100 : 0;
  return {
    address: row.address,
    creator: row.creator,
    campaignId: row.campaign_id,
    goal: row.goal,
    goalSol: lamportsToSol(goal),
    deadline: row.deadline,
    deadlineIso: new Date(row.deadline * 1000).toISOString(),
    descHash: row.desc_hash,
    raised: row.raised,
    raisedSol: lamportsToSol(raised),
    progress,
    paid: row.paid === 1,
    status: row.status,
    donorCount: row.donor_count,
    vault: row.vault,
    vaultLamports: row.vault_lamports,
    vaultLamportsSol: lamportsToSol(vaultLamports),
    slot: row.slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDonorDto(row: DonorRow): DonorDto {
  return {
    campaign: row.campaign,
    donor: row.donor,
    amount: row.amount,
    amountSol: lamportsToSol(BigInt(row.amount)),
    claimed: row.claimed === 1,
    updatedAt: row.updated_at,
  };
}

export function toMetadataDto(row: MetadataRow): MetadataDto {
  let rewards: unknown = null;
  if (row.rewards) {
    try {
      rewards = JSON.parse(row.rewards);
    } catch {
      rewards = row.rewards;
    }
  }
  return {
    campaign: row.campaign,
    title: row.title,
    description: row.description,
    website: row.website,
    imageUrl: row.image_url,
    rewards,
    verified: row.verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEventDto(row: EventRow): EventDto {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = row.payload;
  }
  return {
    id: row.id,
    signature: row.signature,
    slot: row.slot,
    blockTime: row.block_time,
    eventName: row.event_name,
    campaign: row.campaign,
    donor: row.donor,
    amount: row.amount,
    status: row.status,
    payload,
    createdAt: row.created_at,
  };
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

export function listCampaigns(store: Store, filters: ListCampaignFilters): Paginated<CampaignDto> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  let rows = store.listCampaigns();
  if (filters.status) rows = rows.filter((row) => row.status === filters.status);
  if (filters.creator) rows = rows.filter((row) => row.creator === filters.creator);

  const metadata = new Map<string, MetadataRow>();
  for (const row of rows) {
    const meta = store.getMetadata(row.address);
    if (meta) metadata.set(row.address, meta);
  }
  if (filters.q) {
    const needle = filters.q.trim().toLowerCase();
    rows = rows.filter((row) => {
      const meta = metadata.get(row.address);
      const haystack = [row.address, row.creator, row.campaign_id, meta?.title, meta?.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  const direction = filters.order === 'asc' ? 1 : -1;
  const sort = filters.sort ?? 'created';
  rows.sort((a, b) => {
    switch (sort) {
      case 'deadline':
        return (a.deadline - b.deadline) * direction;
      case 'raised':
        return Number(BigInt(a.raised) - BigInt(b.raised)) * direction;
      case 'progress': {
        const pa = BigInt(a.goal) > 0n ? Number((BigInt(a.raised) * 10_000n) / BigInt(a.goal)) : 0;
        const pb = BigInt(b.goal) > 0n ? Number((BigInt(b.raised) * 10_000n) / BigInt(b.goal)) : 0;
        return (pa - pb) * direction;
      }
      case 'created':
      default:
        return (a.created_at - b.created_at) * direction;
    }
  });

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  const items = page.map((row) => {
    const dto = toCampaignDto(row);
    const meta = metadata.get(row.address);
    dto.metadata = meta ? toMetadataDto(meta) : null;
    return dto;
  });
  return { items, total, limit, offset };
}

export function getCampaign(store: Store, address: string): CampaignDto | null {
  const row = store.getCampaign(address);
  if (!row) return null;
  const dto = toCampaignDto(row);
  dto.donors = store.listDonors(address).map(toDonorDto);
  const meta = store.getMetadata(address);
  dto.metadata = meta ? toMetadataDto(meta) : null;
  return dto;
}

export function getCampaignByPda(
  store: Store,
  creator: string,
  campaignId: string,
): CampaignDto | null {
  const match = store
    .listCampaigns()
    .find((row) => row.creator === creator && row.campaign_id === campaignId);
  return match ? getCampaign(store, match.address) : null;
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

export function getStats(store: Store): ProgramStats {
  const campaigns = store.listCampaigns();
  let active = 0;
  let succeeded = 0;
  let refunded = 0;
  let totalRaised = 0n;
  for (const row of campaigns) {
    if (row.status === 'active') active += 1;
    else if (row.status === 'succeeded') succeeded += 1;
    else if (row.status === 'refunded') refunded += 1;
    totalRaised += BigInt(row.raised);
  }
  const creators = new Set(campaigns.map((row) => row.creator));
  const donors = new Set<string>();
  let pledgeCount = 0;
  let refundedTotal = 0n;
  for (const campaign of campaigns) {
    for (const donor of store.listDonors(campaign.address)) {
      donors.add(donor.donor);
      if (BigInt(donor.amount) > 0n) pledgeCount += 1;
      if (donor.claimed === 1) refundedTotal += BigInt(donor.amount);
    }
  }
  return {
    campaigns: campaigns.length,
    active,
    succeeded,
    refunded,
    totalRaised: totalRaised.toString(),
    totalRaisedSol: lamportsToSol(totalRaised),
    totalDonors: donors.size,
    totalPledges: pledgeCount,
    totalRefunded: refundedTotal.toString(),
    totalRefundedSol: lamportsToSol(refundedTotal),
    uniqueCreators: creators.size,
  };
}

/** Verify an off-chain description against the on-chain SHA-256 commitment. */
export function verifyDescription(descHashHex: string, description: string): boolean {
  const committed = descHashHex.toLowerCase();
  return toHex(sha256(description)) === committed || toHex(sha256(description.trim())) === committed;
}
