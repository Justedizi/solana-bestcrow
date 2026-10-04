import type { RequestExecutor } from '../../core/requester.js';
import { accountsEndpoints } from './endpoints.js';
import type {
  AccountDto,
  CreatePaymentInput,
  LoginInput,
  PaymentDto,
  RegisterInput,
  SessionDto,
  SuccessDto,
  WalletChallengeDto,
  WalletChallengeInput,
  WalletDto,
  WalletProofInput,
} from './types.js';

export class AccountsService {
  public constructor(private readonly requester: RequestExecutor) {}

  public register(body: RegisterInput): Promise<SessionDto> {
    return this.requester.request(accountsEndpoints.register, { params: { body } });
  }

  public login(body: LoginInput): Promise<SessionDto> {
    return this.requester.request(accountsEndpoints.login, { params: { body } });
  }

  public logout(): Promise<SuccessDto> { return this.requester.request(accountsEndpoints.logout); }
  public getMe(): Promise<AccountDto> { return this.requester.request(accountsEndpoints.me); }
  public listContributions(): Promise<import('./types.js').ContributionDto[]> {
    return this.requester.request(accountsEndpoints.contributions);
  }
  public getCreatorProfile(): Promise<import('./types.js').CreatorProfileDto | null> {
    return this.requester.request(accountsEndpoints.profile);
  }
  public updateCreatorProfile(body: Omit<import('./types.js').CreatorProfileDto, 'userId' | 'updatedAt'>): Promise<import('./types.js').CreatorProfileDto> {
    return this.requester.request(accountsEndpoints.updateProfile, { params: { body } });
  }

  public createWalletChallenge(body: WalletChallengeInput): Promise<WalletChallengeDto> {
    return this.requester.request(accountsEndpoints.challenge, { params: { body } });
  }

  public linkWallet(body: WalletProofInput): Promise<WalletDto> {
    return this.requester.request(accountsEndpoints.linkWallet, { params: { body } });
  }

  public walletLogin(body: WalletProofInput): Promise<SessionDto> {
    return this.requester.request(accountsEndpoints.walletLogin, { params: { body } });
  }

  public listWallets(): Promise<WalletDto[]> { return this.requester.request(accountsEndpoints.wallets); }

  public unlinkWallet(address: string): Promise<SuccessDto> {
    return this.requester.request(accountsEndpoints.unlinkWallet, { params: { path: { address } } });
  }

  public createPayment(body: CreatePaymentInput): Promise<PaymentDto> {
    return this.requester.request(accountsEndpoints.createPayment, { params: { body } });
  }

  public listPayments(): Promise<PaymentDto[]> { return this.requester.request(accountsEndpoints.payments); }

  public getPayment(id: string): Promise<PaymentDto> {
    return this.requester.request(accountsEndpoints.payment, { params: { path: { id } } });
  }

  public confirmPayment(id: string, signature: string): Promise<PaymentDto> {
    return this.requester.request(accountsEndpoints.confirmPayment, { params: { path: { id }, body: { signature } } });
  }
  public listRewards(campaign: string): Promise<import('./types.js').RewardOfferDto[]> {
    return this.requester.request(accountsEndpoints.rewards, { params: { path: { campaign } } });
  }
  public listRewardClaims(): Promise<import('./types.js').RewardClaimDto[]> {
    return this.requester.request(accountsEndpoints.claims);
  }
  public claimReward(id: string, delivery?: unknown): Promise<import('./types.js').RewardClaimDto> {
    return this.requester.request(accountsEndpoints.claimReward, { params: { path: { id }, body: { delivery } } });
  }
}
