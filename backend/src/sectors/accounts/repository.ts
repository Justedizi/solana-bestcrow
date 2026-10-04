import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { UserDto } from './auth/types.js';
import type { WalletDto } from './wallets/types.js';

export interface UserRecord extends UserDto {
  passwordHash: string;
}

export interface ChallengeRecord {
  id: string;
  userId: string;
  address: string;
  purpose: 'link' | 'login';
  message: string;
  expiresAt: number;
  usedAt: number | null;
}

export class AccountRepository {
  public constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS account_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES account_users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON account_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS account_wallets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES account_users(id),
        address TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wallets_user ON account_wallets(user_id);
      CREATE TABLE IF NOT EXISTS account_wallet_revocations (
        address TEXT PRIMARY KEY,
        revoked_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES account_users(id),
        address TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK(purpose IN ('link','login')),
        message TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_challenges_expiry ON wallet_challenges(expires_at);
      CREATE TABLE IF NOT EXISTS creator_profiles (
        user_id TEXT PRIMARY KEY REFERENCES account_users(id),
        organization_name TEXT,
        organization_description TEXT,
        website TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  public createUser(email: string, displayName: string, passwordHash: string, now: number): UserRecord {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO account_users (id,email,display_name,password_hash,created_at)
      VALUES (?,?,?,?,?)`).run(id, email, displayName, passwordHash, now);
    return { id, email, displayName, passwordHash, createdAt: now };
  }

  /** Create the internal account used by wallet-first authentication. */
  public createWalletUser(address: string, now: number): UserRecord {
    const user = this.createUser(`wallet:${address}@local.invalid`, 'Wallet user',
      `disabled:${randomBytes(32).toString('hex')}`, now);
    this.createWallet(user.id, address, now);
    return user;
  }

  public findUserByEmail(email: string): UserRecord | undefined {
    return this.db.prepare(`SELECT id,email,display_name AS displayName,password_hash AS passwordHash,
      created_at AS createdAt FROM account_users WHERE email=?`).get(email) as UserRecord | undefined;
  }

  public getUser(id: string): UserRecord | undefined {
    return this.db.prepare(`SELECT id,email,display_name AS displayName,password_hash AS passwordHash,
      created_at AS createdAt FROM account_users WHERE id=?`).get(id) as UserRecord | undefined;
  }

  public createSession(userId: string, tokenHash: string, expiresAt: number, now: number): string {
    this.db.prepare('DELETE FROM account_sessions WHERE expires_at<=?').run(now);
    const id = randomUUID();
    this.db.prepare('INSERT INTO account_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
      .run(id, userId, tokenHash, expiresAt);
    return id;
  }

  public getSession(tokenHash: string, now: number): { id: string; userId: string; expiresAt: number } | undefined {
    return this.db.prepare(`SELECT id,user_id AS userId,expires_at AS expiresAt FROM account_sessions
      WHERE token_hash=? AND expires_at>?`).get(tokenHash, now) as
      { id: string; userId: string; expiresAt: number } | undefined;
  }

  public deleteSession(id: string): void {
    this.db.prepare('DELETE FROM account_sessions WHERE id=?').run(id);
  }

  public listWallets(userId: string): WalletDto[] {
    return this.db.prepare(`SELECT id,user_id AS userId,address,created_at AS createdAt
      FROM account_wallets WHERE user_id=? ORDER BY created_at,id`).all(userId) as unknown as WalletDto[];
  }

  public findWallet(address: string): WalletDto | undefined {
    return this.db.prepare(`SELECT id,user_id AS userId,address,created_at AS createdAt
      FROM account_wallets WHERE address=?`).get(address) as WalletDto | undefined;
  }

  public createWallet(userId: string, address: string, now: number): WalletDto {
    const id = randomUUID();
    this.db.prepare('DELETE FROM account_wallet_revocations WHERE address=?').run(address);
    this.db.prepare('INSERT INTO account_wallets (id,user_id,address,created_at) VALUES (?,?,?,?)')
      .run(id, userId, address, now);
    return { id, userId, address, createdAt: now };
  }

  public deleteWallet(userId: string, address: string): boolean {
    const result = this.db.prepare('DELETE FROM account_wallets WHERE user_id=? AND address=?')
      .run(userId, address);
    if (result.changes !== 0) {
      this.db.prepare(`INSERT INTO account_wallet_revocations (address,revoked_at) VALUES (?,?)
        ON CONFLICT(address) DO UPDATE SET revoked_at=excluded.revoked_at`).run(address, Date.now());
    }
    return result.changes !== 0;
  }

  public wasWalletRevoked(address: string): boolean {
    return this.db.prepare('SELECT address FROM account_wallet_revocations WHERE address=?')
      .get(address) !== undefined;
  }

  public createChallenge(challenge: Omit<ChallengeRecord, 'usedAt'>, now: number): void {
    this.db.prepare('DELETE FROM wallet_challenges WHERE expires_at<=?').run(now);
    this.db.prepare(`INSERT INTO wallet_challenges (id,user_id,address,purpose,message,expires_at)
      VALUES (?,?,?,?,?,?)`).run(challenge.id, challenge.userId, challenge.address,
      challenge.purpose, challenge.message, challenge.expiresAt);
  }

  public getCreatorProfile(userId: string): import('./types.js').CreatorProfileDto | null {
    return (this.db.prepare(`SELECT user_id AS userId, organization_name AS organizationName,
      organization_description AS organizationDescription, website, updated_at AS updatedAt
      FROM creator_profiles WHERE user_id=?`).get(userId) as import('./types.js').CreatorProfileDto | undefined) ?? null;
  }

  public upsertCreatorProfile(input: Omit<import('./types.js').CreatorProfileDto, 'updatedAt'>, now: number): import('./types.js').CreatorProfileDto {
    this.db.prepare(`INSERT INTO creator_profiles (user_id,organization_name,organization_description,website,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET organization_name=excluded.organization_name,
      organization_description=excluded.organization_description, website=excluded.website, updated_at=excluded.updated_at`)
      .run(input.userId, input.organizationName, input.organizationDescription, input.website, now);
    return { ...input, updatedAt: now };
  }

  public getChallenge(id: string): ChallengeRecord | undefined {
    return this.db.prepare(`SELECT id,user_id AS userId,address,purpose,message,
      expires_at AS expiresAt,used_at AS usedAt FROM wallet_challenges WHERE id=?`)
      .get(id) as ChallengeRecord | undefined;
  }

  public consumeChallenge(id: string, now: number): boolean {
    return this.db.prepare(`UPDATE wallet_challenges SET used_at=?
      WHERE id=? AND used_at IS NULL AND expires_at>?`).run(now, id, now).changes === 1;
  }
}
