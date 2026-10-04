export type RewardType = 'message' | 'file' | 'code' | 'physical';

export interface RewardOfferDto {
  id: string;
  campaign: string;
  title: string;
  type: RewardType;
  description: string | null;
  content: string | null;
  minAmount: string;
  quantity: number | null;
  claimedCount: number;
  createdAt: number;
}

export interface RewardClaimDto {
  id: string;
  rewardId: string;
  campaign: string;
  wallet: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  delivery: unknown;
  deliveredContent: string | null;
  createdAt: number;
  updatedAt: number;
}
