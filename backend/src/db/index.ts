import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  address       TEXT PRIMARY KEY,
  creator       TEXT NOT NULL,
  campaign_id   TEXT NOT NULL,
  goal          TEXT NOT NULL,
  deadline      INTEGER NOT NULL,
  desc_hash     TEXT NOT NULL,
  raised        TEXT NOT NULL,
  paid          INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,
  donor_count   INTEGER NOT NULL DEFAULT 0,
  bump          INTEGER NOT NULL DEFAULT 0,
  vault         TEXT,
  vault_lamports TEXT NOT NULL DEFAULT '0',
  slot          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns(creator);
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline ON campaigns(deadline);

CREATE TABLE IF NOT EXISTS donors (
  campaign   TEXT NOT NULL,
  donor      TEXT NOT NULL,
  amount     TEXT NOT NULL,
  claimed    INTEGER NOT NULL DEFAULT 0,
  bump       INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (campaign, donor)
);
CREATE INDEX IF NOT EXISTS idx_donors_campaign ON donors(campaign);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  signature  TEXT NOT NULL,
  slot       INTEGER NOT NULL DEFAULT 0,
  block_time INTEGER,
  event_name TEXT NOT NULL,
  campaign   TEXT,
  donor      TEXT,
  amount     TEXT,
  status     TEXT,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(signature, event_name, donor)
);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(campaign);
CREATE INDEX IF NOT EXISTS idx_events_slot ON events(slot);

CREATE TABLE IF NOT EXISTS metadata (
  campaign    TEXT PRIMARY KEY,
  title       TEXT,
  description TEXT,
  website     TEXT,
  image_url   TEXT,
  rewards     TEXT,
  verified    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL
);
`;

export interface CampaignRow {
  address: string;
  creator: string;
  campaign_id: string;
  goal: string;
  deadline: number;
  desc_hash: string;
  raised: string;
  paid: number;
  status: string;
  donor_count: number;
  bump: number;
  vault: string | null;
  vault_lamports: string;
  slot: number;
  created_at: number;
  updated_at: number;
}

export interface DonorRow {
  campaign: string;
  donor: string;
  amount: string;
  claimed: number;
  bump: number;
  updated_at: number;
}

export interface EventRow {
  id: number;
  signature: string;
  slot: number;
  block_time: number | null;
  event_name: string;
  campaign: string | null;
  donor: string | null;
  amount: string | null;
  status: string | null;
  payload: string;
  created_at: number;
}

export interface MetadataRow {
  campaign: string;
  title: string | null;
  description: string | null;
  website: string | null;
  image_url: string | null;
  rewards: string | null;
  verified: number;
  created_at: number;
  updated_at: number;
}

export interface UpsertCampaignInput {
  address: string;
  creator: string;
  campaignId: bigint;
  goal: bigint;
  deadline: bigint;
  descHash: string;
  raised: bigint;
  paid: boolean;
  status: string;
  donorCount: number;
  bump: number;
  vault: string | null;
  vaultLamports: bigint;
  slot: number;
}

export interface UpsertDonorInput {
  campaign: string;
  donor: string;
  amount: bigint;
  claimed: boolean;
  bump: number;
}

export interface UpsertEventInput {
  signature: string;
  slot: number;
  blockTime: number | null;
  eventName: string;
  campaign: string | null;
  donor: string | null;
  amount: bigint | null;
  status: string | null;
  payload: string;
}

export interface UpsertMetadataInput {
  campaign: string;
  title: string | null;
  description: string | null;
  website: string | null;
  imageUrl: string | null;
  rewards: string | null;
  verified: boolean;
}

const now = (): number => Math.floor(Date.now() / 1000);

export class Store {
  readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  private stmt(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  close(): void {
    this.statements.clear();
    this.db.close();
  }

  upsertCampaign(input: UpsertCampaignInput): void {
    const timestamp = now();
    this.stmt(
      `INSERT INTO campaigns
        (address, creator, campaign_id, goal, deadline, desc_hash, raised, paid, status,
         donor_count, bump, vault, vault_lamports, slot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         goal = excluded.goal,
         deadline = excluded.deadline,
         desc_hash = excluded.desc_hash,
         raised = excluded.raised,
         paid = excluded.paid,
         status = excluded.status,
         donor_count = excluded.donor_count,
         bump = excluded.bump,
         vault = excluded.vault,
         vault_lamports = excluded.vault_lamports,
         slot = excluded.slot,
         updated_at = excluded.updated_at`,
    ).run(
      input.address,
      input.creator,
      input.campaignId.toString(),
      input.goal.toString(),
      Number(input.deadline),
      input.descHash,
      input.raised.toString(),
      input.paid ? 1 : 0,
      input.status,
      input.donorCount,
      input.bump,
      input.vault,
      input.vaultLamports.toString(),
      input.slot,
      timestamp,
      timestamp,
    );
  }

  upsertDonor(input: UpsertDonorInput): void {
    this.stmt(
      `INSERT INTO donors (campaign, donor, amount, claimed, bump, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign, donor) DO UPDATE SET
         amount = excluded.amount,
         claimed = excluded.claimed,
         bump = excluded.bump,
         updated_at = excluded.updated_at`,
    ).run(input.campaign, input.donor, input.amount.toString(), input.claimed ? 1 : 0, input.bump, now());
  }

  upsertEvent(input: UpsertEventInput): boolean {
    const result = this.stmt(
      `INSERT OR IGNORE INTO events
        (signature, slot, block_time, event_name, campaign, donor, amount, status, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.signature,
      input.slot,
      input.blockTime,
      input.eventName,
      input.campaign,
      input.donor,
      input.amount === null ? null : input.amount.toString(),
      input.status,
      input.payload,
      now(),
    );
    return Number(result.changes) > 0;
  }

  upsertMetadata(input: UpsertMetadataInput): void {
    const timestamp = now();
    this.stmt(
      `INSERT INTO metadata (campaign, title, description, website, image_url, rewards, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         website = excluded.website,
         image_url = excluded.image_url,
         rewards = excluded.rewards,
         verified = excluded.verified,
         updated_at = excluded.updated_at`,
    ).run(
      input.campaign,
      input.title,
      input.description,
      input.website,
      input.imageUrl,
      input.rewards,
      input.verified ? 1 : 0,
      timestamp,
      timestamp,
    );
  }

  getCampaign(address: string): CampaignRow | undefined {
    return this.stmt('SELECT * FROM campaigns WHERE address = ?').get(address) as CampaignRow | undefined;
  }

  listCampaigns(): CampaignRow[] {
    return this.stmt('SELECT * FROM campaigns').all() as unknown as CampaignRow[];
  }

  getDonor(campaign: string, donor: string): DonorRow | undefined {
    return this.stmt('SELECT * FROM donors WHERE campaign = ? AND donor = ?').get(campaign, donor) as DonorRow | undefined;
  }

  listDonors(campaign: string): DonorRow[] {
    return this.stmt(
      'SELECT * FROM donors WHERE campaign = ? ORDER BY LENGTH(amount) DESC, amount DESC',
    ).all(campaign) as unknown as DonorRow[];
  }

  listEvents(campaign: string, limit: number, offset: number): EventRow[] {
    return this.stmt(
      'SELECT * FROM events WHERE campaign = ? ORDER BY slot DESC, id DESC LIMIT ? OFFSET ?',
    ).all(campaign, limit, offset) as unknown as EventRow[];
  }

  countEvents(campaign: string): number {
    const row = this.stmt('SELECT COUNT(*) AS count FROM events WHERE campaign = ?').get(campaign) as
      | { count: number }
      | undefined;
    return Number(row?.count ?? 0);
  }

  getMetadata(campaign: string): MetadataRow | undefined {
    return this.stmt('SELECT * FROM metadata WHERE campaign = ?').get(campaign) as MetadataRow | undefined;
  }

  getSyncState(key: string): string | null {
    const row = this.stmt('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string | null } | undefined;
    return row?.value ?? null;
  }

  setSyncState(key: string, value: string): void {
    this.stmt(
      `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, now());
  }
}
