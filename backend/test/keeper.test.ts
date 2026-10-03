import assert from "node:assert/strict";
import test from "node:test";
import { CampaignStatus, MilestoneStatus, type Campaign } from "@bestcrow/client";
import { decideAction } from "../src/keeper.js";
import type { CampaignRecord, ProposalSnapshot } from "../src/chain.js";

const proposal: ProposalSnapshot = {
  address: "Vote111111111111111111111111111111111111111",
  owner: "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq",
  state: "pending",
  timestampEnqueued: 120,
  durationSeconds: 100,
  dao: "dao",
  proposer: "creator",
  squadsProposal: "squads",
  isTeamSponsored: false,
};
function record(status: CampaignStatus, milestoneStatus = MilestoneStatus.Reviewing): CampaignRecord {
  return {
    address: "campaign",
    account: {
      status,
      fundingDeadline: 100n,
      totalRaised: 50n,
      goal: 100n,
      currentMilestone: 0,
      milestones: [{
        status: milestoneStatus,
        dueAt: 110n,
        submittedAt: 120n,
        marketDeadline: 300n,
        proposal: proposal.address,
      }],
    } as unknown as Campaign,
  };
}

test("finalizes failed funding only after the deadline", () => {
  assert.equal(decideAction(record(CampaignStatus.Funding), null, 99), null);
  assert.equal(decideAction(record(CampaignStatus.Funding), null, 100)?.kind, "finalize_funding");
});
test("missed evidence terminates the campaign", () => {
  assert.equal(decideAction(record(CampaignStatus.Active, MilestoneStatus.Pending), proposal, 111)?.kind, "expire_milestone");
});
test("a finalized MetaDAO result takes precedence over timeout", () => {
  assert.equal(decideAction(record(CampaignStatus.Active), { ...proposal, state: "passed" }, 301)?.kind, "resolve_milestone");
});
test("mature pending MetaDAO market is finalized before StageGate resolution", () => {
  assert.equal(decideAction(record(CampaignStatus.Active), proposal, 220)?.kind, "meta_dao_finalize");
});
test("sponsorship terminates without releasing a tranche", () => {
  assert.equal(decideAction(record(CampaignStatus.Active), { ...proposal, state: "passed", isTeamSponsored: true }, 221)?.kind, "expire_milestone");
});
test("a finalized proposal launched after the market deadline can time out", () => {
  const late = { ...proposal, state: "passed" as const, timestampEnqueued: 301 };
  assert.equal(decideAction(record(CampaignStatus.Active), late, 302)?.kind, "expire_milestone");
});
