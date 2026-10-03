import {
  CampaignStatus,
  MilestoneStatus,
  getClaimRefundInstruction,
  getExpireMilestoneInstruction,
  getFinalizeFundingInstruction,
  getResolveMilestoneInstruction,
  type Campaign,
} from "@bestcrow/client";
import { address } from "@solana/kit";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { BackendConfig } from "./config.js";
import { SolanaGateway, type CampaignRecord, type ProposalSnapshot } from "./chain.js";
import { InstructionCodec } from "./instructions.js";

export type ActionKind = "finalize_funding" | "expire_milestone" | "meta_dao_finalize" | "resolve_milestone";
export type Action = { kind: ActionKind; campaign: string; proposal?: string; reason: string };

/** Pure decision rule: all financial authorization still belongs to the Anchor program. */
export function decideAction(record: CampaignRecord, proposal: ProposalSnapshot | null, now: number): Action | null {
  const campaign = record.account;
  if (campaign.status === CampaignStatus.Funding && now >= Number(campaign.fundingDeadline) && campaign.totalRaised < campaign.goal) {
    return { kind: "finalize_funding", campaign: record.address, reason: "Funding deadline passed below goal" };
  }
  if (campaign.status !== CampaignStatus.Active) return null;
  const milestone = campaign.milestones[campaign.currentMilestone];
  if (!milestone) return null;
  const proposalKey = String(milestone.proposal);
  if (proposal?.isTeamSponsored) {
    return { kind: "expire_milestone", campaign: record.address, proposal: proposalKey, reason: "Sponsored MetaDAO proposal cannot control escrow" };
  }
  if (milestone.status === MilestoneStatus.Pending && now > Number(milestone.dueAt)) {
    return { kind: "expire_milestone", campaign: record.address, proposal: proposalKey, reason: "Proof deadline passed" };
  }
  if (milestone.status !== MilestoneStatus.Reviewing || !proposal) return null;
  if (
    (proposal.state === "passed" || proposal.state === "failed") &&
    proposal.timestampEnqueued >= Number(milestone.submittedAt) &&
    proposal.timestampEnqueued <= Number(milestone.marketDeadline)
  ) {
    return { kind: "resolve_milestone", campaign: record.address, proposal: proposalKey, reason: `MetaDAO finalized ${proposal.state}` };
  }
  if (now > Number(milestone.marketDeadline)) {
    return { kind: "expire_milestone", campaign: record.address, proposal: proposalKey, reason: "Market resolution deadline passed" };
  }
  if (proposal.state === "pending" && now >= proposal.timestampEnqueued + proposal.durationSeconds) {
    return { kind: "meta_dao_finalize", campaign: record.address, proposal: proposalKey, reason: "MetaDAO trading period ended" };
  }
  return null;
}

export class KeeperService {
  constructor(private readonly config: BackendConfig, private readonly chain: SolanaGateway) {}

  async campaignAction(record: CampaignRecord, now = Math.floor(Date.now() / 1000)): Promise<Action | null> {
    const account = record.account;
    let proposal: ProposalSnapshot | null = null;
    if (account.status === CampaignStatus.Active) {
      const current = account.milestones[account.currentMilestone];
      if (current) proposal = await this.chain.getProposal(String(current.proposal));
    }
    return decideAction(record, proposal, now);
  }

  async refundInstruction(record: CampaignRecord, walletAddress: string, callerAddress: string) {
    const campaign = record.account;
    if (campaign.status !== CampaignStatus.Failed && campaign.status !== CampaignStatus.Terminated) {
      throw new Error("Refund is unavailable");
    }
    const wallet = this.chain.publicKey(walletAddress);
    const receipt = await this.chain.getBacker(record.address, walletAddress);
    if (!receipt) throw new Error("Backer receipt is missing");
    const backer = receipt.account;
    if (String(backer.wallet) !== walletAddress || String(backer.campaign) !== record.address || backer.claimed || backer.amount === 0n) {
      throw new Error("Refund is unavailable");
    }
    const amount = backer.amount * campaign.refundPool / campaign.refundDenominator;
    const walletToken = getAssociatedTokenAddressSync(this.chain.publicKey(String(campaign.quoteMint)), wallet);
    const instruction = getClaimRefundInstruction({
      caller: InstructionCodec.readonlySigner(callerAddress),
      campaign: address(record.address),
      wallet: address(walletAddress),
      backer: address(receipt.address),
      quoteMint: campaign.quoteMint,
      vault: campaign.vault,
      walletToken: address(walletToken.toBase58()),
    }, { programAddress: address(this.config.stagegateProgramId) });
    return { amount: amount.toString(), mint: campaign.quoteMint, instruction: InstructionCodec.fromKit(instruction) };
  }

  async unsignedAction(record: CampaignRecord, action: Action, caller: string) {
    const campaign: Campaign = record.account;
    const signer = InstructionCodec.readonlySigner(caller);
    const campaignKey = address(record.address);
    const programAddress = address(this.config.stagegateProgramId);
    if (action.kind === "finalize_funding") {
      const ix = getFinalizeFundingInstruction({ caller: signer, campaign: campaignKey }, { programAddress });
      return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
    }
    if (!action.proposal) throw new Error("Missing proposal");
    if (action.kind === "expire_milestone") {
      const ix = getExpireMilestoneInstruction({ caller: signer, campaign: campaignKey, proposal: address(action.proposal) }, { programAddress });
      return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
    }
    if (action.kind === "resolve_milestone") {
      const creatorToken = getAssociatedTokenAddressSync(
        this.chain.publicKey(String(campaign.quoteMint)),
        this.chain.publicKey(String(campaign.creator)),
      );
      const ix = getResolveMilestoneInstruction({
        caller: signer,
        campaign: campaignKey,
        proposal: address(action.proposal),
        quoteMint: campaign.quoteMint,
        vault: campaign.vault,
        creator: campaign.creator,
        creatorToken: address(creatorToken.toBase58()),
      }, { programAddress });
      return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
    }
    const proposal = await this.chain.getProposal(action.proposal);
    if (proposal.dao !== String(campaign.metaDao) || proposal.proposer !== String(campaign.creator)) {
      throw new Error("Proposal does not belong to this campaign");
    }
    const builder = this.chain.metaDaoClient(this.chain.publicKey(caller)).finalizeProposalIx(
      this.chain.publicKey(action.proposal),
      this.chain.publicKey(proposal.squadsProposal),
      this.chain.publicKey(proposal.dao),
      this.chain.publicKey(String(campaign.baseMint)),
      this.chain.publicKey(String(campaign.quoteMint)),
    );
    const transaction = await builder.transaction();
    return { ...action, instructions: transaction.instructions.map(InstructionCodec.fromWeb3) };
  }

  async scanActions(): Promise<Action[]> {
    const campaigns = await this.chain.listCampaigns();
    const results = await Promise.allSettled(campaigns.map((campaign) => this.campaignAction(campaign)));
    const actions: Action[] = [];
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === "fulfilled" && result.value) actions.push(result.value);
      if (result.status === "rejected") console.error("Keeper scan failed", campaigns[index].address, result.reason);
    }
    return actions;
  }
}
