import type { CampaignAccount, InstructionPlan } from '../../../solana/program.js';
import type { Address } from '@solana/kit';

export type InstructionPlanDto = InstructionPlan;

export interface CreateCampaignInput {
  creator: string;
  campaignId: string;
  goal: string;
  deadline: string;
  descHash?: string;
}

export interface PledgeInput {
  donor: string;
  campaign: string;
  amount: string;
}

export interface FinalizeInput {
  caller: string;
  campaign: string;
}

export interface ClaimSuccessInput {
  creator: string;
  campaign: string;
}

export interface ClaimRefundInput {
  donor: string;
  campaign: string;
}

export interface RefundAllInput {
  caller: string;
  campaign: string;
}

export type CampaignAccountReader = (address: Address) => Promise<CampaignAccount | null>;
