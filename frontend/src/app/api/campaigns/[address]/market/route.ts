import { MarketProxy } from "@/services/MarketProxy";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const milestone = new URL(request.url).searchParams.get("milestone") || undefined;
  return new MarketProxy().forward((await context.params).address, undefined, "prepare", milestone);
}
