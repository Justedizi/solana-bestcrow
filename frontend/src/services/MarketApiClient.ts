export type MarketSnapshot = {
  campaign: string;
  milestone: number;
  milestoneCount: number;
  proposal: string;
  proposalState: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  marketDeadline: number;
  tradeOpen: boolean;
  redeemable: boolean;
  passMidPrice: string | null;
  failMidPrice: string | null;
  dao: string;
};

export type PreparedTrade = {
  proposal: string;
  side: "pass" | "fail";
  direction: "buy" | "sell";
  inputAmount: string;
  minOutputAmount: string;
  inputMint: string;
  outputMint: string;
  transactions: Array<Array<{
    programId: string;
    accounts: Array<{ address: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  }>>;
};

export type PreparedTransactions = Pick<PreparedTrade, "proposal" | "transactions">;

export class MarketApiClient {
  constructor(private readonly campaign: string) {}

  private path(suffix = ""): string {
    return `/api/campaigns/${encodeURIComponent(this.campaign)}/market${suffix}`;
  }

  async snapshot(milestone?: number): Promise<MarketSnapshot> {
    const response = await fetch(this.path() + (milestone ? `?milestone=${milestone}` : ""), { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load market");
    return result as MarketSnapshot;
  }

  async prepare(input: {
    wallet: string;
    side: "pass" | "fail";
    direction: "buy" | "sell";
    amount: string;
    minReceived: string;
    useExistingConditional: boolean;
  }): Promise<PreparedTrade> {
    const response = await fetch(this.path("/prepare"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not prepare trade");
    return result as PreparedTrade;
  }

  async redeem(wallet: string, milestone: number): Promise<PreparedTransactions> {
    const response = await fetch(this.path("/redeem"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, milestone }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not prepare redemption");
    return result as PreparedTransactions;
  }
}
