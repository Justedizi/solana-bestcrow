import { randomUUID } from 'node:crypto';
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
    `);
  }

  public createUser(email: string, displayName: string, passwordHash: string, now: number): UserRecord {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO account_users (id,email,display_name,password_hash,created_at)
      VALUES (?,?,?,?,?)`).run(id, email, displayName, passwordHash, now);
    return { id, email, displayName, passwordHash, createdAt: now };
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
    this.db.prepare('INSERT INTO account_wallets (id,user_id,address,created_at) VALUES (?,?,?,?)')
      .run(id, userId, address, now);
    return { id, userId, address, createdAt: now };
  }

  public deleteWallet(userId: string, address: string): boolean {
    return this.db.prepare('DELETE FROM account_wallets WHERE user_id=? AND address=?')
      .run(userId, address).changes !== 0;
  }

  public createChallenge(challenge: Omit<ChallengeRecord, 'usedAt'>, now: number): void {
    this.db.prepare('DELETE FROM wallet_challenges WHERE expires_at<=?').run(now);
    this.db.prepare(`INSERT INTO wallet_challenges (id,user_id,address,purpose,message,expires_at)
      VALUES (?,?,?,?,?,?)`).run(challenge.id, challenge.userId, challenge.address,
      challenge.purpose, challenge.message, challenge.expiresAt);
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
