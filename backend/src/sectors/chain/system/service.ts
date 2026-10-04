import type { EventEmitter } from 'node:events';
import type { Store } from '../../../db/index.js';
import type { CampaignsService } from '../campaigns/service.js';
import {
  CAMPAIGN_ACCOUNT_SIZE, DONOR_LEDGER_ACCOUNT_SIZE, MAX_DONORS,
  instructionDiscriminators, toHex,
} from '../../../solana/program.js';
import type { ChainConfig, ChainNetworkConfig, HealthInfo, ProgramInfo } from './types.js';
import type { ProgramStats } from '../campaigns/types.js';

export class SystemService {
  public constructor(
    private readonly store: Pick<Store, 'getSyncState'>,
    private readonly campaigns: CampaignsService,
    private readonly network: ChainNetworkConfig,
    private readonly events: EventEmitter,
    private readonly now: () => number = Date.now,
    private readonly uptime: () => number = process.uptime,
  ) {
    this.network = Object.freeze({
      cluster: network.cluster,
      rpcUrl: network.rpcUrl,
      programId: network.programId,
    });
  }

  public health(): HealthInfo {
    return {
      status: 'ok', uptimeSeconds: Math.floor(this.uptime()),
      cluster: this.network.cluster, programId: this.network.programId,
      lastIndexedSlot: Number(this.store.getSyncState('slot') ?? 0),
      lastSignature: this.store.getSyncState('last_signature'), timestamp: new Date(this.now()).toISOString(),
    };
  }

  public stats(): ProgramStats {
    return this.campaigns.stats();
  }

  public program(): ProgramInfo {
    return {
      ...this.network,
      accounts: {
        campaign: { size: CAMPAIGN_ACCOUNT_SIZE, maxDonors: MAX_DONORS },
        donorLedger: { size: DONOR_LEDGER_ACCOUNT_SIZE },
      },
      instructions: Object.fromEntries(Object.entries(instructionDiscriminators).map(([name, bytes]) => [name, toHex(bytes)])),
    };
  }

  public config(): ChainConfig {
    const chain = this.network.cluster;
    const walletChain = chain === 'devnet' ? 'solana:devnet'
      : chain === 'testnet' ? 'solana:testnet'
      : chain === 'mainnet-beta' || chain === 'mainnet' ? 'solana:mainnet' : null;
    return { ...this.program(), walletChain, transactionVersions: [0, 1], signing: 'wallet', submission: 'frontend' };
  }

  public subscribe(listener: (event: unknown) => void): () => void {
    this.events.on('sync', listener);
    return () => this.events.off('sync', listener);
  }
}
