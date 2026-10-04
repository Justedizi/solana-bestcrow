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
} from '../../sectors/accounts/types.js';
export type {
  PaymentDto,
  CreatePaymentInput,
  ConfirmPaymentInput,
} from '../../sectors/accounts/payments/types.js';

export interface SuccessDto {
  ok: true;
}
