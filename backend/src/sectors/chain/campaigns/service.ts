import { z } from 'zod';
import type { CampaignRow, DonorRow, EventRow, MetadataRow, Store } from '../../../db/index.js';
import { ApiError, notFound } from '../../../api/middleware/error.js';
import { sha256, toHex } from '../../../solana/program.js';
import { pagination, parseAddress, parseU64 } from '../validation.js';
import type {
  CampaignDto, ContributionDto, DonorDto, EventDto, ListCampaignFilters, MetadataDto, MetadataInput,
  Paginated, ProgramStats,
} from './types.js';

const metadataSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().max(20_000).optional(),
  website: z.string().url().max(500).optional(),
  imageUrl: z.string().url().max(1_000).optional(),
  rewards: z.array(z.object({
    title: z.string().trim().min(1).max(140),
    description: z.string().max(500).optional(),
    minSol: z.string().max(40).optional(),
    quantity: z.number().int().positive().optional(),
  })).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function lamportsToSol(value: bigint): string {
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function toCampaignDto(row: CampaignRow): CampaignDto {
  const goal = BigInt(row.goal);
  const raised = BigInt(row.raised);
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
    progress: goal > 0n ? Number((raised * 10_000n) / goal) / 100 : 0,
    paid: row.paid === 1,
    status: row.status,
    donorCount: row.donor_count,
    vault: row.vault,
    vaultLamports: row.vault_lamports,
    vaultLamportsSol: lamportsToSol(BigInt(row.vault_lamports)),
    slot: row.slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDonorDto(row: DonorRow): DonorDto {
  return {
    campaign: row.campaign, donor: row.donor, amount: row.amount,
    amountSol: lamportsToSol(BigInt(row.amount)), claimed: row.claimed === 1,
    updatedAt: row.updated_at,
  };
}

function parseStoredJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toMetadataDto(row: MetadataRow): MetadataDto {
  return {
    campaign: row.campaign, title: row.title, description: row.description,
    website: row.website, imageUrl: row.image_url, rewards: parseStoredJson(row.rewards),
    verified: row.verified === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id, signature: row.signature, slot: row.slot, blockTime: row.block_time,
    eventName: row.event_name, campaign: row.campaign, donor: row.donor,
    amount: row.amount, status: row.status, payload: parseStoredJson(row.payload),
    createdAt: row.created_at,
  };
}

export function verifyDescription(descHashHex: string, description: string): boolean {
  const committed = descHashHex.toLowerCase();
  return toHex(sha256(description)) === committed || toHex(sha256(description.trim())) === committed;
}

export type CampaignStore = Pick<Store,
  'listCampaigns' | 'getCampaign' | 'listDonors' | 'listDonorsByWallets' | 'listEvents' | 'countEvents'
  | 'getMetadata' | 'upsertMetadata'>;

export class CampaignsService {
  public constructor(private readonly store: CampaignStore) {}

  public list(filters: ListCampaignFilters = {}): Paginated<CampaignDto> {
    const { limit, offset } = pagination(filters.limit, filters.offset);
    let rows = this.store.listCampaigns();
    if (filters.status) rows = rows.filter((row) => row.status === filters.status);
    if (filters.creator) {
      const creator = parseAddress(filters.creator);
      rows = rows.filter((row) => row.creator === creator);
    }
    const metadata = new Map<string, MetadataRow>();
    for (const row of rows) {
      const meta = this.store.getMetadata(row.address);
      if (meta) metadata.set(row.address, meta);
    }
    if (filters.q) {
      const needle = filters.q.trim().toLowerCase();
      rows = rows.filter((row) => {
        const meta = metadata.get(row.address);
        return [row.address, row.creator, row.campaign_id, meta?.title, meta?.description]
          .filter(Boolean).join(' ').toLowerCase().includes(needle);
      });
    }
    const direction = filters.order === 'asc' ? 1 : -1;
    const compareBigInt = (left: bigint, right: bigint): number => left < right ? -1 : left > right ? 1 : 0;
    rows.sort((a, b) => {
      switch (filters.sort ?? 'created') {
        case 'deadline': return (a.deadline - b.deadline) * direction;
        case 'raised': return compareBigInt(BigInt(a.raised), BigInt(b.raised)) * direction;
        case 'progress': {
          const goalA = BigInt(a.goal);
          const goalB = BigInt(b.goal);
          const raisedA = goalA > 0n ? BigInt(a.raised) : 0n;
          const raisedB = goalB > 0n ? BigInt(b.raised) : 0n;
          return compareBigInt(raisedA * (goalB || 1n), raisedB * (goalA || 1n)) * direction;
        }
        default: return (a.created_at - b.created_at) * direction;
      }
    });
    return {
      items: rows.slice(offset, offset + limit).map((row) => ({
        ...toCampaignDto(row), metadata: metadata.has(row.address) ? toMetadataDto(metadata.get(row.address)!) : null,
      })),
      total: rows.length, limit, offset,
    };
  }

  public get(addressValue: string): CampaignDto | null {
    const address = parseAddress(addressValue);
    const row = this.store.getCampaign(address);
    if (!row) return null;
    const meta = this.store.getMetadata(address);
    return {
      ...toCampaignDto(row), donors: this.store.listDonors(address).map(toDonorDto),
      metadata: meta ? toMetadataDto(meta) : null,
    };
  }

  public require(addressValue: string): CampaignDto {
    const campaign = this.get(addressValue);
    if (!campaign) throw notFound('Campaign not found');
    return campaign;
  }

  public getByPda(creatorValue: string, campaignIdValue: string): CampaignDto | null {
    const creator = parseAddress(creatorValue);
    const campaignId = parseU64(campaignIdValue, 'campaignId').toString();
    const row = this.store.listCampaigns().find((item) => item.creator === creator && item.campaign_id === campaignId);
    return row ? this.get(row.address) : null;
  }

  public donors(address: string, limit = 50, offset = 0): Paginated<DonorDto> {
    const campaign = this.require(address);
    const page = pagination(limit, offset);
    const donors = this.store.listDonors(campaign.address).map(toDonorDto);
    return { items: donors.slice(page.offset, page.offset + page.limit), total: donors.length, ...page };
  }

  public contributions(wallets: string[]): ContributionDto[] {
    const rows = this.store.listDonorsByWallets(wallets);
    return rows.flatMap((row) => {
      const campaign = this.store.getCampaign(row.campaign);
      if (!campaign) return [];
      return [{ ...toDonorDto(row), campaignStatus: campaign.status,
        campaignDeadline: campaign.deadline, campaignSlot: campaign.slot }];
    });
  }

  public events(address: string, limit = 50, offset = 0): Paginated<EventDto> {
    const campaign = this.require(address);
    const page = pagination(limit, offset);
    return {
      items: this.store.listEvents(campaign.address, page.limit, page.offset).map(toEventDto),
      total: this.store.countEvents(campaign.address), ...page,
    };
  }

  public metadata(addressValue: string): MetadataDto | null {
    const row = this.store.getMetadata(parseAddress(addressValue));
    return row ? toMetadataDto(row) : null;
  }

  public updateMetadata(address: string, input: MetadataInput): MetadataDto {
    const campaign = this.require(address);
    const body = metadataSchema.parse(input);
    const previous = this.store.getMetadata(campaign.address);
    if (body.description !== undefined && !verifyDescription(campaign.descHash, body.description)) {
      throw new ApiError(409, 'Description does not match the on-chain SHA-256 commitment');
    }
    this.store.upsertMetadata({
      campaign: campaign.address,
      title: body.title ?? previous?.title ?? null,
      description: body.description ?? previous?.description ?? null,
      website: body.website ?? previous?.website ?? null,
      imageUrl: body.imageUrl ?? previous?.image_url ?? null,
      rewards: body.rewards === undefined ? previous?.rewards ?? null : JSON.stringify(body.rewards),
      verified: body.description === undefined ? previous?.verified === 1 : true,
    });
    return toMetadataDto(this.store.getMetadata(campaign.address)!);
  }

  public stats(): ProgramStats {
    const campaigns = this.store.listCampaigns();
    const totalRaised = campaigns.reduce((sum, row) => sum + BigInt(row.raised), 0n);
    const donors = new Set<string>();
    let pledgeCount = 0;
    let refundedTotal = 0n;
    for (const campaign of campaigns) {
      for (const donor of this.store.listDonors(campaign.address)) {
        donors.add(donor.donor);
        if (BigInt(donor.amount) > 0n) pledgeCount += 1;
        if (donor.claimed === 1) refundedTotal += BigInt(donor.amount);
      }
    }
    return {
      campaigns: campaigns.length,
      active: campaigns.filter((row) => row.status === 'active').length,
      succeeded: campaigns.filter((row) => row.status === 'succeeded').length,
      refunded: campaigns.filter((row) => row.status === 'refunded').length,
      totalRaised: totalRaised.toString(), totalRaisedSol: lamportsToSol(totalRaised),
      totalDonors: donors.size, totalPledges: pledgeCount,
      totalRefunded: refundedTotal.toString(), totalRefundedSol: lamportsToSol(refundedTotal),
      uniqueCreators: new Set(campaigns.map((row) => row.creator)).size,
    };
  }
}
