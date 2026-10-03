import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(): void {
  // Node >= 21.7 ships process.loadEnvFile; use it so we need no dotenv dependency.
  const candidate = resolve(here, '..', '.env');
  if (!existsSync(candidate)) return;
  try {
    const load = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;
    load?.(candidate);
  } catch {
    // Ignore malformed .env files; explicit process env still wins.
  }
}

loadEnvFile();

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const config = {
  port: int('PORT', 4000),
  corsOrigin: str('CORS_ORIGIN', '*'),
  rpcUrl: str('SOLANA_RPC_URL', 'https://api.devnet.solana.com'),
  programId: str('CHARITY_VAULT_PROGRAM_ID', '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG'),
  cluster: str('CLUSTER', 'devnet'),
  dbPath: (() => {
    const raw = str('DB_PATH', './data/bestcrow.db');
    return raw === ':memory:' ? raw : resolve(here, '..', raw);
  })(),
  accounts: {
    origin: str('APP_ORIGIN', 'http://localhost:3000'),
    sessionTtlSeconds: Math.max(60, int('SESSION_TTL_SECONDS', 86_400)),
    challengeTtlSeconds: Math.max(30, Math.min(600, int('WALLET_CHALLENGE_TTL_SECONDS', 300))),
    authAttemptsPerMinute: Math.max(1, int('AUTH_ATTEMPTS_PER_MINUTE', 20)),
  },
  indexer: {
    enabled: bool('INDEXER_ENABLED', true),
    pollIntervalMs: int('POLL_INTERVAL_MS', 15_000),
    signatureScanLimit: int('SIGNATURE_SCAN_LIMIT', 200),
  },
} as const;

export type Config = typeof config;
