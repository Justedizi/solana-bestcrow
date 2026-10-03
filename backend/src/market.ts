import BN from "bn.js";
import { CampaignStatus, MilestoneStatus, type Campaign } from "@bestcrow/client";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { CampaignRecord, ProposalSnapshot, SolanaGateway } from "./chain.js";
import { InstructionCodec } from "./instructions.js";

export type TradeRequest = {
  wallet: string;
  side: "pass" | "fail";
  direction: "buy" | "sell";
  amount: string;
  minReceived: string;
  useExistingConditional?: boolean;
};

export function tokenUnits(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Amount must be a positive decimal number");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Amount has more than ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units <= 0n || units > 18_446_744_073_709_551_615n) throw new Error("Amount is outside token range");
  return units;
}

export class MarketService {
  constructor(private readonly chain: SolanaGateway) {}

  private async context(record: CampaignRecord, index = record.account.currentMilestone): Promise<{
    campaign: Campaign;
    milestone: Campaign["milestones"][number];
    proposal: ProposalSnapshot;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    dao: PublicKey;
    baseDecimals: number;
    quoteDecimals: number;
  }> {
    const campaign = record.account;
    const milestone = campaign.milestones[index];
    if (!milestone) throw new Error("Milestone does not exist");
    const proposal = await this.chain.getProposal(String(milestone.proposal));
    if (proposal.dao !== String(campaign.metaDao) || proposal.proposer !== String(campaign.creator)) {
      throw new Error("MetaDAO proposal is not bound to this campaign");
    }
    const baseMint = this.chain.publicKey(String(campaign.baseMint));
    const quoteMint = this.chain.publicKey(String(campaign.quoteMint));
    const dao = this.chain.publicKey(String(campaign.metaDao));
    const [base, quote] = await Promise.all([
      getMint(this.chain.connection, baseMint),
      getMint(this.chain.connection, quoteMint),
    ]);
    return { campaign, milestone, proposal, baseMint, quoteMint, dao, baseDecimals: base.decimals, quoteDecimals: quote.decimals };
  }

  async snapshot(record: CampaignRecord, milestoneNumber?: number) {
    const fallback = Math.min(record.account.currentMilestone, record.account.milestones.length - 1);
    const index = milestoneNumber === undefined ? fallback : milestoneNumber - 1;
    if (!Number.isInteger(index) || index < 0) throw new Error("Invalid milestone number");
    const context = await this.context(record, index);
    const { campaign, milestone, proposal, baseMint, quoteMint, dao, baseDecimals, quoteDecimals } = context;
    const now = Math.floor(Date.now() / 1000);
    const client = this.chain.metaDaoClient(PublicKey.default);
    const daoAccount = await client.getDao(dao);
    const pools = "futarchy" in daoAccount.amm.state
      ? daoAccount.amm.state.futarchy as { pass: { baseReserves: BN; quoteReserves: BN }; fail: { baseReserves: BN; quoteReserves: BN } }
      : null;
    const midPrice = (pool: { baseReserves: BN; quoteReserves: BN } | undefined): string | null => {
      if (!pool || pool.baseReserves.isZero()) return null;
      return ((Number(pool.quoteReserves.toString()) / 10 ** quoteDecimals) / (Number(pool.baseReserves.toString()) / 10 ** baseDecimals)).toFixed(6);
    };
    return {
      campaign: record.address,
      milestone: index + 1,
      milestoneCount: campaign.milestones.length,
      proposal: proposal.address,
      proposalState: proposal.state,
      baseMint: baseMint.toBase58(),
      quoteMint: quoteMint.toBase58(),
      baseDecimals,
      quoteDecimals,
      marketDeadline: Number(milestone.marketDeadline),
      tradeOpen: !proposal.isTeamSponsored && index === campaign.currentMilestone && campaign.status === CampaignStatus.Active &&
        milestone.status === MilestoneStatus.Reviewing && proposal.state === "pending" &&
        proposal.timestampEnqueued >= Number(milestone.submittedAt) &&
        proposal.timestampEnqueued <= Number(milestone.marketDeadline) &&
        now < proposal.timestampEnqueued + proposal.durationSeconds && now <= Number(milestone.marketDeadline),
      redeemable: proposal.state === "passed" || proposal.state === "failed",
      passMidPrice: midPrice(pools?.pass),
      failMidPrice: midPrice(pools?.fail),
      dao: dao.toBase58(),
    };
  }

  async prepare(record: CampaignRecord, input: TradeRequest) {
    const context = await this.context(record);
    const { milestone, proposal, baseMint, quoteMint, dao, baseDecimals, quoteDecimals } = context;
    const now = Math.floor(Date.now() / 1000);
    if (proposal.isTeamSponsored || context.campaign.status !== CampaignStatus.Active || milestone.status !== MilestoneStatus.Reviewing ||
        proposal.state !== "pending" || proposal.timestampEnqueued < Number(milestone.submittedAt) ||
        proposal.timestampEnqueued > Number(milestone.marketDeadline) ||
        now >= proposal.timestampEnqueued + proposal.durationSeconds || now > Number(milestone.marketDeadline)) {
      throw new Error("MetaDAO market is not open for trading");
    }
    if (input.side !== "pass" && input.side !== "fail") throw new Error("Side must be pass or fail");
    if (input.direction !== "buy" && input.direction !== "sell") throw new Error("Direction must be buy or sell");
    if (input.useExistingConditional !== undefined && typeof input.useExistingConditional !== "boolean") {
      throw new Error("useExistingConditional must be a boolean");
    }
    const wallet = this.chain.publicKey(input.wallet);
    const inputDecimals = input.direction === "buy" ? quoteDecimals : baseDecimals;
    const outputDecimals = input.direction === "buy" ? baseDecimals : quoteDecimals;
    const inputUnits = tokenUnits(input.amount, inputDecimals);
    const minimumUnits = tokenUnits(input.minReceived, outputDecimals);
    const client = this.chain.metaDaoClient(wallet);
    const proposalKey = this.chain.publicKey(proposal.address);
    const pdas = client.getProposalPdas(proposalKey, baseMint, quoteMint, dao);
    const outputMint = input.direction === "buy"
      ? input.side === "pass" ? pdas.passBaseMint : pdas.failBaseMint
      : input.side === "pass" ? pdas.passQuoteMint : pdas.failQuoteMint;
    const outputAta = getAssociatedTokenAddressSync(outputMint, wallet);
    const swap = await client.conditionalSwapIx({
      dao, trader: wallet, payer: wallet, baseMint, quoteMint, proposal: proposalKey,
      market: input.side, swapType: input.direction,
      inputAmount: new BN(inputUnits.toString()), minOutputAmount: new BN(minimumUnits.toString()),
    }).instruction();
    const createOutput = createAssociatedTokenAccountIdempotentInstruction(wallet, outputAta, wallet, outputMint);
    const transactions: TransactionInstruction[][] = [];
    if (input.direction === "buy" && !input.useExistingConditional) {
      // The swap consumes conditional USDC, so split ordinary USDC first.
      const split = await client.vaultClient.splitTokensIx(
        pdas.question, pdas.quoteVault, quoteMint, new BN(inputUnits.toString()), 2, wallet, wallet,
      ).transaction();
      transactions.push(split.instructions);
    }
    transactions.push([createOutput, swap]);
    return {
      proposal: proposal.address,
      side: input.side,
      direction: input.direction,
      inputAmount: inputUnits.toString(),
      minOutputAmount: minimumUnits.toString(),
      inputMint: (input.direction === "buy" ? quoteMint : baseMint).toBase58(),
      outputMint: outputMint.toBase58(),
      transactions: transactions.map((instructions) => instructions.map(InstructionCodec.fromWeb3)),
    };
  }

  async prepareRedeem(record: CampaignRecord, walletAddress: string, milestoneNumber: number) {
    if (!Number.isInteger(milestoneNumber) || milestoneNumber < 1) throw new Error("Invalid milestone number");
    const { proposal, baseMint, quoteMint, dao } = await this.context(record, milestoneNumber - 1);
    if (proposal.state !== "passed" && proposal.state !== "failed") throw new Error("Proposal is not finalized");
    const wallet = this.chain.publicKey(walletAddress);
    const client = this.chain.metaDaoClient(wallet);
    const pdas = client.getProposalPdas(this.chain.publicKey(proposal.address), baseMint, quoteMint, dao);
    const winningBase = proposal.state === "passed" ? pdas.passBaseMint : pdas.failBaseMint;
    const winningQuote = proposal.state === "passed" ? pdas.passQuoteMint : pdas.failQuoteMint;
    const transactions: TransactionInstruction[][] = [];
    for (const [vault, mint, winningMint] of [
      [pdas.baseVault, baseMint, winningBase],
      [pdas.quoteVault, quoteMint, winningQuote],
    ] as const) {
      const conditionalAta = getAssociatedTokenAddressSync(winningMint, wallet);
      const tokenAccount = await this.chain.connection.getAccountInfo(conditionalAta, "confirmed");
      if (!tokenAccount) continue;
      const balance = BigInt((await this.chain.connection.getTokenAccountBalance(conditionalAta, "confirmed")).value.amount);
      if (balance === 0n) continue;
      const underlyingAta = getAssociatedTokenAddressSync(mint, wallet);
      const redeem = await client.vaultClient.redeemTokensIx(pdas.question, vault, mint, 2, wallet, wallet).transaction();
      transactions.push([
        createAssociatedTokenAccountIdempotentInstruction(wallet, underlyingAta, wallet, mint),
        ...redeem.instructions,
      ]);
    }
    if (transactions.length === 0) throw new Error("No winning conditional tokens to redeem");
    return {
      proposal: proposal.address,
      transactions: transactions.map((instructions) => instructions.map(InstructionCodec.fromWeb3)),
    };
  }
}
