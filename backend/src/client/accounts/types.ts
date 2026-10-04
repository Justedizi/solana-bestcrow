export type {
  UserDto,
  SessionDto,
  WalletDto,
  WalletChallengeDto,
  RegisterInput,
  LoginInput,
  WalletChallengeInput,
  WalletProofInput,
  AccountDto,
  ContributionDto,
  CreatorProfileDto,
} from '../../sectors/accounts/types.js';
export type { RewardOfferDto, RewardClaimDto } from '../../sectors/accounts/rewards/types.js';
export type {
  PaymentDto,
  CreatePaymentInput,
  ConfirmPaymentInput,
} from '../../sectors/accounts/payments/types.js';

export interface SuccessDto {
  ok: true;
}
