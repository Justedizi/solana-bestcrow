import { MarketProxy } from "@/services/MarketProxy";

export async function POST(request: Request, context: { params: Promise<{ address: string }> }) {
  return new MarketProxy().forward((await context.params).address, request);
}
