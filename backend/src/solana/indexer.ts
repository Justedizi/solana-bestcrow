import type { Store } from '../db/index.js';
import { bus } from '../util/bus.js';
import {
  decodeCampaignAccount,
  decodeDonorLedger,
  getVaultPda,
  type CampaignAccount,
} from './program.js';
import {
  getMultipleAccounts,
  getProgramAccounts,
  getRecentSignatures,
  getTransactionLogs,
  getSlot,
} from './rpc.js';
import { decodeEventsFromLogs } from './events.js';
import { CAMPAIGN_ACCOUNT_SIZE, DONOR_LEDGER_ACCOUNT_SIZE } from './program.js';

export interface SyncResult {
  slot: number;
  campaigns: number;
  donors: number;
  events: number;
}

const LAST_SIGNATURE_KEY = 'last_signature';

export class Indexer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: Store,
    private readonly pollIntervalMs: number,
    private readonly signatureScanLimit: number,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<SyncResult> {
    if (this.running) return { slot: 0, campaigns: 0, donors: 0, events: 0 };
    this.running = true;
    try {
      const campaigns = await this.syncCampaigns().catch((error) => {
        console.error('[indexer] campaign sync failed:', error);
        return 0;
      });
      const donors = await this.syncDonors().catch((error) => {
        console.error('[indexer] donor sync failed:', error);
        return 0;
      });
      const events = await this.syncEvents().catch((error) => {
        console.error('[indexer] event sync failed:', error);
        return 0;
      });
      const slot = await getSlot().catch(() => 0);
      this.store.setSyncState('slot', String(slot));
      const result: SyncResult = { slot, campaigns, donors, events };
      if (campaigns + donors + events > 0) {
        bus.emit('sync', { type: 'sync', ...result, at: Date.now() });
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async syncCampaigns(): Promise<number> {
    const accounts = await getProgramAccounts(CAMPAIGN_ACCOUNT_SIZE);
    const decoded: CampaignAccount[] = [];
    for (const account of accounts) {
      const campaign = decodeCampaignAccount(account.address, account.data);
      if (campaign) decoded.push(campaign);
    }

    const vaults = await Promise.all(decoded.map((campaign) => getVaultPda(campaign.address)));
    const balances = await getMultipleAccounts(vaults).catch(() => vaults.map(() => null));

    let changed = 0;
    for (let i = 0; i < decoded.length; i += 1) {
      const campaign = decoded[i]!;
      const vault = vaults[i]!;
      const balance = balances[i]?.lamports ?? 0n;
      this.store.upsertCampaign({
        address: campaign.address,
        creator: campaign.creator,
        campaignId: campaign.campaignId,
        goal: campaign.goal,
        deadline: campaign.deadline,
        descHash: Buffer.from(campaign.descHash).toString('hex'),
        raised: campaign.raised,
        paid: campaign.paid,
        status: campaign.status,
        donorCount: campaign.donorCount,
        bump: campaign.bump,
        vault,
        vaultLamports: BigInt(balance),
        slot: 0,
      });
      changed += 1;
    }
    return changed;
  }

  private async syncDonors(): Promise<number> {
    const accounts = await getProgramAccounts(DONOR_LEDGER_ACCOUNT_SIZE);
    let changed = 0;
    for (const account of accounts) {
      const ledger = decodeDonorLedger(account.address, account.data);
      if (!ledger) continue;
      this.store.upsertDonor({
        campaign: ledger.campaign,
        donor: ledger.donor,
        amount: ledger.amount,
        claimed: ledger.claimed,
        bump: ledger.bump,
      });
      changed += 1;
    }
    return changed;
  }

  private async syncEvents(): Promise<number> {
    const signatures = await getRecentSignatures(this.signatureScanLimit);
    if (signatures.length === 0) return 0;
    const lastKnown = this.store.getSyncState(LAST_SIGNATURE_KEY);
    let inserted = 0;
    for (const info of signatures) {
      if (lastKnown && info.signature === lastKnown) break;
      if (info.err) continue;
      const logs = await getTransactionLogs(info.signature);
      if (!logs) continue;
      const events = decodeEventsFromLogs({
        signature: info.signature,
        slot: info.slot,
        blockTime: info.blockTime,
        logMessages: logs.logMessages,
        err: logs.err,
      });
      for (const event of events) {
        const added = this.store.upsertEvent({
          signature: info.signature,
          slot: info.slot,
          blockTime: info.blockTime,
          eventName: event.name,
          campaign: event.campaign,
          donor: event.donor ?? null,
          amount: event.amount ?? null,
          status: event.status ?? null,
          payload: JSON.stringify(event.payload),
        });
        if (added) inserted += 1;
      }
    }
    const newest = signatures[0];
    if (newest) this.store.setSyncState(LAST_SIGNATURE_KEY, newest.signature);
    return inserted;
  }
}
