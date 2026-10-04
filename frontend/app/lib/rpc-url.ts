export const PUBLIC_DEVNET_RPC_URL = 'https://api.devnet.solana.com';

const BETA_HELIUS_HOST = 'beta.helius-rpc.com';
const DEVNET_HELIUS_HOST = 'devnet.helius-rpc.com';

function parseRpcUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '[::1]';
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeDevnetUrl(parsed: URL): string | null {
  if (parsed.hostname === BETA_HELIUS_HOST) parsed.hostname = DEVNET_HELIUS_HOST;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'api.mainnet-beta.solana.com'
    || hostname === 'api.testnet.solana.com'
    || hostname.includes('mainnet')
    || hostname.includes('testnet')) return null;
  return parsed.toString();
}

/** Resolve a browser RPC endpoint that is safe for a Devnet wallet. */
export function resolveDevnetRpcUrl(
  configured: string | undefined,
  fallback = PUBLIC_DEVNET_RPC_URL,
): string {
  const parsed = parseRpcUrl(configured);
  if (parsed) {
    // beta.helius-rpc.com is not the Devnet endpoint. Keep its API key, but
    // route requests to the matching Devnet service so Phantom and RPC agree.
    const normalized = normalizeDevnetUrl(parsed);
    if (normalized) return normalized;
  }

  const fallbackUrl = parseRpcUrl(fallback);
  return (fallbackUrl && normalizeDevnetUrl(fallbackUrl)) ?? PUBLIC_DEVNET_RPC_URL;
}
