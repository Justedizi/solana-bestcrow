import { z } from 'zod';
import { ApiError } from '../../../api/middleware/error.js';
import type { Store } from '../../../db/index.js';
import { RewardRepository } from './repository.js';
import type { RewardClaimDto, RewardOfferDto } from './types.js';

export const offerInputSchema = z.object({ campaign: z.string(), title: z.string().trim().min(1).max(160),
  type: z.enum(['message','file','code','physical']), description: z.string().max(4_000).nullable().optional(),
  content: z.string().max(1_000_000).nullable().optional(), minAmount: z.string().regex(/^\d+$/).default('0'), quantity: z.number().int().positive().nullable().optional() }).strict();

export class RewardService {
  public constructor(private readonly repository: RewardRepository, private readonly store: Store, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}
  public create(input: unknown, wallets: { address: string }[]): RewardOfferDto {
    const body = offerInputSchema.parse(input);
    const campaign = this.store.getCampaign(body.campaign);
    if (!campaign || !wallets.some((wallet) => wallet.address === campaign.creator)) throw new ApiError(403, 'Only the campaign creator can create rewards');
    return this.repository.createOffer({ ...body, description: body.description ?? null, content: body.content ?? null, quantity: body.quantity ?? null }, this.now());
  }
  public list(campaign: string): RewardOfferDto[] { return this.repository.listOffers(campaign); }
  public claim(rewardId: string, delivery: unknown, wallets: { address: string }[]): RewardClaimDto {
    const offer = this.repository.getOffer(rewardId);
    if (!offer) throw new ApiError(404, 'Reward not found');
    if (wallets.length === 0) throw new ApiError(403, 'A linked wallet is required');
    const campaign = this.store.getCampaign(offer.campaign);
    if (!campaign || !['succeeded', 'completed', 'Succeeded', 'Completed'].includes(campaign.status)) {
      throw new ApiError(409, 'Rewards are available only after a successful campaign');
    }
    if (wallets.some((wallet) => this.repository.findClaim(rewardId, wallet.address))) throw new ApiError(409, 'Reward already claimed');
    if (offer.quantity !== null && this.repository.countClaims(rewardId) >= offer.quantity) throw new ApiError(409, 'Reward is sold out');
    const eligible = wallets.map((wallet) => ({ wallet: wallet.address, donor: this.store.getDonor(offer.campaign, wallet.address) }))
      .find((item) => item.donor && BigInt(item.donor.amount) >= BigInt(offer.minAmount));
    if (!eligible) throw new ApiError(403, 'No qualifying confirmed contribution found');
    if (this.repository.findClaim(rewardId, eligible.wallet)) throw new ApiError(409, 'Reward already claimed');
    if (offer.type === 'physical' && (!delivery || typeof delivery !== 'object')) throw new ApiError(422, 'Delivery details are required');
    return this.repository.createClaim(rewardId, eligible.wallet, delivery, this.now(), offer.type === 'physical' ? null : offer.content);
  }
  public claims(wallets: { address: string }[]): RewardClaimDto[] { return this.repository.listClaimsForWallet(wallets.map((wallet) => wallet.address)); }
}
