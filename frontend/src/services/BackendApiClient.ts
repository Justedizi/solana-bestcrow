import type { FrontendConfig } from "@/config/FrontendConfig";
import { BackendHealth } from "@/models/BackendHealth";

export class BackendApiClient {
  constructor(private readonly config: FrontendConfig) {}

  async health(): Promise<BackendHealth> {
    const response = await fetch(new URL("/health", this.config.backendUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(this.config.backendTimeoutMs),
    });
    if (!response.ok) throw new Error(`Backend health request failed: ${response.status}`);
    return BackendHealth.fromResponse(await response.json());
  }
}
