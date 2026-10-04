import { ApiError, badRequest, notFound } from '../../../api/middleware/error.js';
import {
  claimRefundPlan, claimSuccessPlan, createCampaignPlan, decodeCampaignAccount,
  finalizePlan, fromHex, pledgePlan, PROGRAM_ID, refundAllPlan, type InstructionPlan,
} from '../../../solana/program.js';
import { getAccount } from '../../../solana/rpc.js';
import { parseAddress, parseI64, parseU64 } from '../validation.js';
import type {
  CampaignAccountReader, ClaimRefundInput, ClaimSuccessInput, CreateCampaignInput,
  FinalizeInput, PledgeInput, RefundAllInput,
} from './types.js';

const readCampaignAccount: CampaignAccountReader = async (address) => {
  const account = await getAccount(address);
  if (!account) return null;
  if (account.owner !== PROGRAM_ID) throw badRequest('Campaign account is not owned by this program');
  const campaign = decodeCampaignAccount(address, account.data);
  if (!campaign) throw badRequest('Campaign account has an invalid layout');
  return campaign;
};

export class InstructionsService {
  public constructor(
    private readonly readCampaign: CampaignAccountReader = readCampaignAccount,
    private readonly now: () => number = Date.now,
  ) {}

  public async create(input: CreateCampaignInput): Promise<InstructionPlan> {
    const campaignId = parseU64(input.campaignId, 'campaignId');
    const goal = parseU64(input.goal, 'goal');
    const deadline = parseI64(input.deadline, 'deadline');
    if (goal === 0n) throw badRequest('goal must be greater than zero');
    if (deadline <= BigInt(Math.floor(this.now() / 1000))) throw badRequest('deadline must be in the future');
    const descHash = input.descHash ?? '00'.repeat(32);
    if (!/^[0-9a-fA-F]{64}$/.test(descHash)) throw badRequest('descHash must be 32 hex-encoded bytes');
    return createCampaignPlan({ creator: parseAddress(input.creator), campaignId, goal, deadline, descHash: fromHex(descHash) });
  }

  public async pledge(input: PledgeInput): Promise<InstructionPlan> {
    const amount = parseU64(input.amount, 'amount');
    if (amount === 0n) throw badRequest('amount must be greater than zero');
    return pledgePlan({ donor: parseAddress(input.donor), campaign: parseAddress(input.campaign), amount });
  }

  public finalize(input: FinalizeInput): InstructionPlan {
    return finalizePlan({ caller: parseAddress(input.caller), campaign: parseAddress(input.campaign) });
  }

  public async claimSuccess(input: ClaimSuccessInput): Promise<InstructionPlan> {
    return claimSuccessPlan({ creator: parseAddress(input.creator), campaign: parseAddress(input.campaign) });
  }

  public async claimRefund(input: ClaimRefundInput): Promise<InstructionPlan> {
    return claimRefundPlan({ donor: parseAddress(input.donor), campaign: parseAddress(input.campaign) });
  }

  public async refundAll(input: RefundAllInput): Promise<InstructionPlan> {
    const campaignAddress = parseAddress(input.campaign);
    const caller = parseAddress(input.caller);
    let campaign;
    try {
      campaign = await this.readCampaign(campaignAddress);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'Unable to read the campaign from Solana');
    }
    if (!campaign) throw notFound('Campaign not found');
    // Rust validates this exact donor order, including ledgers that were already closed.
    return refundAllPlan({ caller, campaign: campaignAddress, creator: campaign.creator, donors: campaign.donors });
  }
}
