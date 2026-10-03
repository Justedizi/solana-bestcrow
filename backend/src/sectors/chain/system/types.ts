export interface HealthInfo {
  status: 'ok';
  uptimeSeconds: number;
  cluster: string;
  programId: string;
  lastIndexedSlot: number;
  lastSignature: string | null;
  timestamp: string;
}

export interface ProgramInfo {
  programId: string;
  cluster: string;
  rpcUrl: string;
  accounts: {
    campaign: { size: number; maxDonors: number };
    donorLedger: { size: number };
  };
  instructions: Record<string, string>;
}

export interface ChainConfig extends ProgramInfo {
  walletChain: 'solana:devnet' | 'solana:testnet' | 'solana:mainnet' | null;
  transactionVersions: readonly [0, 1];
  signing: 'wallet';
  submission: 'frontend';
}

export interface ChainNetworkConfig {
  cluster: string;
  rpcUrl: string;
  programId: string;
}
