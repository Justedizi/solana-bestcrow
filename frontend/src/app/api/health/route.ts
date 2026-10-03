import { FrontendConfig } from "@/config/FrontendConfig";
import { BackendApiClient } from "@/services/BackendApiClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await new BackendApiClient(FrontendConfig.fromEnv()).health();
    return Response.json({ status: "connected" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
