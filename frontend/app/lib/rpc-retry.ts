export interface RpcRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class RpcRateLimitError extends Error {
  public constructor(message = 'Solana RPC is rate-limited (HTTP 429)') {
    super(message);
    this.name = 'RpcRateLimitError';
  }
}

export function isRpcRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const node = error as {
    context?: { __code?: number; statusCode?: number };
    statusCode?: number;
    message?: string;
  };
  return Number(node.context?.__code) === 8100002
    || Number(node.context?.statusCode) === 429
    || Number(node.statusCode) === 429
    || /\b429\b|too many requests|rate.?limit/i.test(node.message ?? '');
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const envNumber = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export async function withRpcRetry<T>(
  operation: () => Promise<T>,
  options: RpcRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(
    0,
    Math.min(options.attempts ?? envNumber('NEXT_PUBLIC_SOLANA_RPC_RETRY_ATTEMPTS', 3), 8),
  );
  const baseDelayMs = Math.max(
    0,
    Math.min(options.baseDelayMs ?? envNumber('NEXT_PUBLIC_SOLANA_RPC_RETRY_BASE_DELAY_MS', 250), 10_000),
  );
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRpcRateLimitError(error)) throw error;
      if (attempt >= attempts) {
        throw new RpcRateLimitError(
          'Solana RPC is rate-limited (HTTP 429). Configure a dedicated RPC endpoint or try again later.',
        );
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}
