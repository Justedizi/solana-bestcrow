import { FrontendConfig } from "@/config/FrontendConfig";

export class MarketProxy {
  private readonly config = FrontendConfig.fromEnv();

  async forward(address: string, request?: Request, operation = "prepare", milestone?: string): Promise<Response> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return Response.json({ error: "Invalid campaign address" }, { status: 400 });
    }
    const endpoint = new URL(`/campaigns/${address}/market${request ? `/${operation}` : ""}`, this.config.backendUrl);
    if (milestone) endpoint.searchParams.set("milestone", milestone);
    try {
      const response = await fetch(endpoint, {
        method: request ? "POST" : "GET",
        headers: request ? { "content-type": "application/json" } : undefined,
        body: request ? await request.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(this.config.backendTimeoutMs),
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch {
      return Response.json({ error: "Backend is unavailable" }, { status: 502 });
    }
  }
}
