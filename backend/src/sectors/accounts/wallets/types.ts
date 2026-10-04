export interface WalletDto {
  id: string;
  userId: string;
  address: string;
  createdAt: number;
}

export interface WalletChallengeInput {
  address: string;
  purpose: 'link' | 'login';
}

export interface WalletChallengeDto {
  id: string;
  message: string;
  expiresAt: number;
}

export interface WalletProofInput {
  challengeId: string;
  signatureBase64: string;
}
