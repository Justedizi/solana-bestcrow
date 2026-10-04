export type { AuthenticatedSession, LoginInput, RegisterInput, SessionDto, UserDto } from './auth/types.js';
export type { WalletChallengeDto, WalletChallengeInput, WalletDto, WalletProofInput } from './wallets/types.js';

import type { UserDto } from './auth/types.js';
import type { WalletDto } from './wallets/types.js';

export interface AccountDto {
  user: UserDto;
  wallets: WalletDto[];
}
