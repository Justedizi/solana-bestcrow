import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../../api/middleware/error.js';
import { AccountRepository, type UserRecord } from '../repository.js';
import type { AuthenticatedSession, LoginInput, RegisterInput, SessionDto, UserDto } from './types.js';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
const registration = credentials.extend({ displayName: z.string().trim().min(1).max(100).optional() });

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export class PasswordHasher {
  public async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
  }

  public async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, salt, hex] = encoded.split(':');
    if (algorithm !== 'scrypt' || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false;
    const derived = await derive(password, salt);
    return timingSafeEqual(derived, Buffer.from(hex, 'hex'));
  }
}

const publicUser = ({ id, email, displayName, createdAt }: UserRecord): UserDto =>
  ({ id, email, displayName, createdAt });
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

export class AuthService {
  private readonly dummyHash: Promise<string>;

  public constructor(
    private readonly repository: AccountRepository,
    private readonly sessionTtlSeconds = 86_400,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    private readonly passwords = new PasswordHasher(),
  ) {
    this.dummyHash = passwords.hash(randomBytes(32).toString('hex'));
  }

  public async register(input: RegisterInput): Promise<SessionDto> {
    const body = registration.parse(input);
    if (this.repository.findUserByEmail(body.email)) throw new ApiError(409, 'Email is already registered');
    const hash = await this.passwords.hash(body.password);
    // Recheck after scrypt: concurrent registration can finish while hashing.
    if (this.repository.findUserByEmail(body.email)) throw new ApiError(409, 'Email is already registered');
    const user = this.repository.createUser(body.email, body.displayName ?? body.email.split('@')[0]!, hash, this.now());
    return this.issueSession(user.id);
  }

  public async login(input: LoginInput): Promise<SessionDto> {
    const body = credentials.parse(input);
    const user = this.repository.findUserByEmail(body.email);
    const valid = await this.passwords.verify(body.password, user?.passwordHash ?? await this.dummyHash);
    if (!user || !valid) throw new ApiError(401, 'Invalid email or password');
    return this.issueSession(user.id);
  }

  public issueSession(userId: string): SessionDto {
    const user = this.repository.getUser(userId);
    if (!user) throw new ApiError(401, 'Account not found');
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const expiresAt = now + this.sessionTtlSeconds;
    this.repository.createSession(userId, digest(token), expiresAt, now);
    return { user: publicUser(user), token, expiresAt };
  }

  public authenticate(authorization?: string): AuthenticatedSession {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '');
    if (!match) throw new ApiError(401, 'A Bearer session token is required');
    const session = this.repository.getSession(digest(match[1]!), this.now());
    const user = session && this.repository.getUser(session.userId);
    if (!session || !user) throw new ApiError(401, 'Session is invalid or expired');
    return { user: publicUser(user), sessionId: session.id, expiresAt: session.expiresAt };
  }

  public logout(sessionId: string): void {
    this.repository.deleteSession(sessionId);
  }
}
