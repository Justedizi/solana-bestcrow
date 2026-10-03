export class FrontendConfig {
  private constructor(
    readonly backendUrl: URL,
    readonly backendTimeoutMs: number,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): FrontendConfig {
    const rawUrl = env.BACKEND_URL?.trim() || "http://127.0.0.1:3001";
    let backendUrl: URL;
    try {
      backendUrl = new URL(rawUrl);
    } catch {
      throw new Error("BACKEND_URL must be a valid HTTP URL");
    }
    if (backendUrl.protocol !== "http:" && backendUrl.protocol !== "https:") {
      throw new Error("BACKEND_URL must be a valid HTTP URL");
    }

    const timeoutRaw = env.BACKEND_TIMEOUT_MS?.trim() || "1500";
    if (!/^\d+$/.test(timeoutRaw)) throw new Error("BACKEND_TIMEOUT_MS must be an integer from 100 to 30000");
    const backendTimeoutMs = Number(timeoutRaw);
    if (!Number.isSafeInteger(backendTimeoutMs) || backendTimeoutMs < 100 || backendTimeoutMs > 30_000) {
      throw new Error("BACKEND_TIMEOUT_MS must be an integer from 100 to 30000");
    }
    return new FrontendConfig(backendUrl, backendTimeoutMs);
  }
}
