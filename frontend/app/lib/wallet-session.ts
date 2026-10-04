import { client } from '../providers';
import { address } from '@solana/kit';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const SESSION_KEY = 'bestcrow:wallet-session';

export type WalletSession = {
  wallet: string;
  token: string;
  expiresAt: number;
  user: { id: string; email: string; displayName: string };
};

type SessionResponse = Omit<WalletSession, 'wallet'>;
type ChallengeResponse = { id: string; message: string; expiresAt: number };
let memorySession: WalletSession | null = null;

async function json<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    const error = new Error(body.error || `Backend request failed (${response.status}).`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
}

function signatureBase64(signature: Uint8Array): string {
  if (signature.length !== 64) throw new Error('The wallet returned an invalid signature length.');
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isChallengeResponse(value: ChallengeResponse): boolean {
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.message === 'string' && value.message.length > 0
    && Number.isSafeInteger(value.expiresAt);
}

function isSessionResponse(value: SessionResponse): boolean {
  return typeof value.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.token)
    && Number.isSafeInteger(value.expiresAt)
    && !!value.user && typeof value.user.id === 'string'
    && typeof value.user.email === 'string' && typeof value.user.displayName === 'string';
}

function emitSessionChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bestcrow:session'));
}

function readStoredSession(): WalletSession | null {
  if (typeof window === 'undefined') return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as WalletSession : memorySession;
  } catch {
    return memorySession;
  }
}

function forgetSession(): void {
  memorySession = null;
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* Storage can be blocked by privacy settings. */ }
  emitSessionChange();
}

export async function walletFirstLogin(wallet: string): Promise<WalletSession> {
  const requestedWallet = address(wallet);
  const activeBefore = client.wallet.getState().connected?.account.address;
  if (activeBefore !== requestedWallet) throw new Error('The connected wallet changed. Connect it again before signing in.');
  const challenge = await json<ChallengeResponse>('/api/accounts/wallets/challenge', {
    method: 'POST', body: JSON.stringify({ address: requestedWallet, purpose: 'login' }),
  });
  if (!isChallengeResponse(challenge) || challenge.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('The wallet login challenge is invalid or expired. Try again.');
  }
  const signature = await client.wallet.signMessage(new TextEncoder().encode(challenge.message));
  const activeAfter = client.wallet.getState().connected?.account.address;
  if (activeAfter !== requestedWallet) throw new Error('The connected wallet changed while signing. Nothing was signed in.');
  const session = await json<SessionResponse>('/api/accounts/auth/wallet-login', {
    method: 'POST', body: JSON.stringify({ challengeId: challenge.id, signatureBase64: signatureBase64(signature) }),
  });
  if (!isSessionResponse(session) || session.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('The backend returned an invalid or expired wallet session. Try again.');
  }
  const stored = { ...session, wallet: requestedWallet };
  memorySession = stored;
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored)); } catch { /* Keep this tab usable when storage is blocked. */ }
  emitSessionChange();
  return stored;
}

export function getWalletSession(wallet?: string): WalletSession | null {
  const now = Math.floor(Date.now() / 1000);
  try {
    const session = readStoredSession();
    if (!session || !isSessionResponse(session) || !session.wallet || session.expiresAt <= now || (wallet && session.wallet !== wallet)) {
      if (session && (!wallet || session.wallet === wallet)) forgetSession();
      return null;
    }
    return session;
  } catch {
    forgetSession();
    return null;
  }
}

export async function clearWalletSession(): Promise<void> {
  const session = getWalletSession();
  forgetSession();
  if (!session) return;
  await fetch(`${API_URL}/api/accounts/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${session.token}` } }).catch(() => undefined);
}

export async function authenticatedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getWalletSession();
  if (!session) throw new Error('Wallet session is not signed in. Reconnect the wallet and approve the ownership message.');
  try {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${session.token}`);
    return await json<T>(path, { ...init, headers });
  } catch (error) {
    if ((error as { status?: number }).status === 401) forgetSession();
    throw error;
  }
}
