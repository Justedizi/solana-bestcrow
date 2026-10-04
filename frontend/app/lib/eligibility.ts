import type { Address } from '@solana/kit';

import type { Campaign, Ledger, Milestone } from './charity-vault.ts';
import { APPROVE_BPS, BPS_DENOM } from './charity-vault.ts';

/**
 * Client mirror of the on-chain permission rules.
 *
 * The program is the source of truth and will revert a bad call; this function
 * only decides which button to show and why. Keep it in lockstep with
 * `rust/programs/charity-vault/src/instructions/*`.
 */
export type FundingEligibility = {
  connected: boolean;
  isCreator: boolean;
  deadlinePassed: boolean;
  canPledge: boolean;
  pledgeReason: string;
  canFinalize: boolean;
  finalizeReason: string;
  canClaimSuccess: boolean;
  claimSuccessReason: string;
  canClaimRefund: boolean;
  claimRefundReason: string;
  refundableAmount: bigint;
  canRefundAll: boolean;
  refundAllReason: string;
  /** Staged campaigns release through milestones instead of a single sweep. */
  canReleaseInitial: boolean;
  releaseInitialReason: string;
  canTerminate: boolean;
  terminateReason: string;
  canClaimTerminationRefund: boolean;
  claimTerminationRefundReason: string;
  canClaimBond: boolean;
  claimBondReason: string;
  terminationRefundAmount: bigint;
};

export function fundingEligibility(args: {
  campaign: Campaign;
  ledger: Ledger | null;
  wallet: Address | null;
  nowMs: number;
}): FundingEligibility {
  const { campaign, ledger, wallet, nowMs } = args;
  const connected = wallet !== null;
  const isCreator = connected && wallet === campaign.creator;
  const deadlinePassed = campaign.deadline * 1000 <= nowMs;
  const active = campaign.status === 'Active';
  const succeeded = campaign.status === 'Succeeded';
  const refunded = campaign.status === 'Refunded';

  const canPledge = active && !deadlinePassed && connected;
  const canFinalize = active && deadlinePassed && connected;
  const staged = campaign.staged;
  const canClaimSuccess = succeeded && !campaign.paid && isCreator && !staged;
  const canClaimRefund = !staged && refunded && Boolean(ledger) && !ledger?.claimed && connected;
  const canRefundAll = refunded && campaign.donors.length > 0 && connected;

  const canReleaseInitial =
    staged && succeeded && isCreator && !campaign.paid && !campaign.terminated;
  const canTerminate =
    staged && succeeded && !campaign.terminated && (isCreator || campaign.rejections > 0);
  const canClaimTerminationRefund =
    staged && campaign.terminated && Boolean(ledger) && connected;
  const canClaimBond =
    staged && succeeded && !campaign.terminated && !campaign.bondForfeited && campaign.bond > 0n && isCreator;

  const refundableAmount = !staged && ledger && !ledger.claimed ? ledger.amount : 0n;
  const terminationRefundAmount =
    staged && campaign.terminated && ledger && campaign.raised > 0n
      ? (ledger.amount * campaign.refundPool) / campaign.raised
      : 0n;

  return {
    connected,
    isCreator,
    deadlinePassed,
    canPledge,
    pledgeReason: !active
      ? 'Campaign already finalized'
      : deadlinePassed
        ? 'Deadline passed'
        : 'Connect a wallet to pledge',
    canFinalize,
    finalizeReason: !active
      ? 'Already finalized'
      : deadlinePassed
        ? 'Connect a wallet to finalize'
        : 'Available after the deadline',
    canClaimSuccess,
    claimSuccessReason: staged
      ? 'Staged campaigns release funds through milestones'
      : campaign.paid
        ? 'Already claimed'
        : succeeded
          ? 'Only the charity that created this campaign can claim'
          : 'Only available after a successful campaign',
    canClaimRefund,
    claimRefundReason: staged
      ? 'Staged campaigns refund through termination'
      : !refunded
        ? 'Only available once the campaign is refunded'
        : !ledger
          ? 'No pledge found from this wallet'
          : ledger.claimed
            ? 'Already refunded'
            : 'Connect a wallet to claim',
    refundableAmount,
    canRefundAll,
    refundAllReason: !refunded
      ? 'Only available once the campaign is refunded'
      : campaign.donors.length === 0
        ? 'No donors to refund'
        : 'Connect a wallet to refund everyone',
    canReleaseInitial,
    releaseInitialReason: !staged
      ? 'Not a staged campaign'
      : campaign.terminated
        ? 'Campaign terminated'
        : campaign.paid
          ? 'Initial tranche already released'
          : succeeded
            ? 'Only the creator can release the initial tranche'
            : 'Only available after a successful campaign',
    canTerminate,
    terminateReason: !staged
      ? 'Not a staged campaign'
      : campaign.terminated
        ? 'Already terminated'
        : succeeded
          ? 'Only the creator or a rejected milestone can terminate'
          : 'Only available after a successful campaign',
    canClaimTerminationRefund,
    claimTerminationRefundReason: !staged
      ? 'Not a staged campaign'
      : !campaign.terminated
        ? 'Only available after termination'
        : !ledger
          ? 'No pledge found from this wallet'
          : 'Connect a wallet to claim',
    canClaimBond,
    claimBondReason: !staged
      ? 'Not a staged campaign'
      : campaign.bond === 0n
        ? 'This campaign has no bond'
        : campaign.bondForfeited
          ? 'Bond forfeited to backers'
          : campaign.terminated
            ? 'Campaign terminated'
            : 'Only the creator can reclaim the bond',
    terminationRefundAmount,
  };
}

export type MilestoneEligibility = {
  canSubmitEvidence: boolean;
  submitEvidenceReason: string;
  canVote: boolean;
  voteReason: string;
  canFinalizeVote: boolean;
  finalizeVoteReason: string;
  canRelease: boolean;
  releaseReason: string;
  canWithdraw: boolean;
  withdrawReason: string;
  approvalPct: number;
};

/**
 * Per-milestone action gates, mirroring `staged.rs`, `voting.rs`, and `release.rs`.
 */
export function milestoneEligibility(args: {
  milestone: Milestone;
  campaign: Campaign;
  ledger: Ledger | null;
  wallet: Address | null;
  claimClaimed: bigint;
  claimTotal: bigint;
}): MilestoneEligibility {
  const { milestone, campaign, ledger, wallet, claimClaimed, claimTotal } = args;
  const connected = wallet !== null;
  const isCreator = connected && wallet === campaign.creator;
  const succeeded = campaign.status === 'Succeeded' && !campaign.terminated;
  const total = milestone.approveWeight + milestone.rejectWeight;
  const approvalPct = total > 0n ? Number((milestone.approveWeight * 100n) / total) : 0;

  const canSubmitEvidence =
    succeeded && isCreator && (milestone.status === 'Pending' || milestone.status === 'Revision');
  const canVote = succeeded && milestone.status === 'Submitted' && connected && ledger !== null && ledger.amount > 0n;
  const canFinalizeVote = succeeded && milestone.status === 'Submitted' && connected;
  const canRelease = succeeded && isCreator && milestone.status === 'Released';
  const canWithdraw =
    succeeded && milestone.status === 'Released' && connected && claimClaimed < claimTotal;

  const approvalNeeded = `${Math.round((APPROVE_BPS / BPS_DENOM) * 100)}%`;

  return {
    canSubmitEvidence,
    submitEvidenceReason: !succeeded
      ? 'Campaign must be successful and active'
      : !isCreator
        ? 'Only the creator can submit evidence'
        : milestone.status === 'Submitted'
          ? 'Evidence already submitted — awaiting vote'
          : milestone.status === 'Released'
            ? 'Milestone released'
            : milestone.status === 'Rejected'
              ? 'Milestone rejected — terminate the campaign'
              : 'Only the creator can submit evidence',
    canVote,
    voteReason: milestone.status !== 'Submitted'
      ? 'Voting is not open on this milestone'
      : !connected
        ? 'Connect a wallet to vote'
        : !ledger
          ? 'Only backers with a pledge can vote'
          : 'Already voted or not eligible',
    canFinalizeVote,
    finalizeVoteReason: milestone.status !== 'Submitted'
      ? 'Nothing to finalize'
      : 'Connect a wallet to finalize the vote',
    canRelease,
    releaseReason: milestone.status !== 'Released'
      ? `Releases after an approval of ${approvalNeeded} or more`
      : 'Only the creator can release the tranche',
    canWithdraw,
    withdrawReason: milestone.status !== 'Released'
      ? 'Nothing has been released yet'
      : claimClaimed >= claimTotal
        ? 'Fully withdrawn'
        : 'Connect a wallet to withdraw',
    approvalPct,
  };
}
