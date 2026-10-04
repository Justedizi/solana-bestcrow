import type { Address } from '@solana/kit';

import type { Campaign, Ledger } from './charity-vault';

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
  const canClaimSuccess = succeeded && !campaign.paid && isCreator;
  const canClaimRefund = refunded && Boolean(ledger) && !ledger?.claimed && connected;
  const canRefundAll = refunded && campaign.donors.length > 0 && connected;

  const refundableAmount = ledger && !ledger.claimed ? ledger.amount : 0n;

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
    claimSuccessReason: campaign.paid
      ? 'Already claimed'
      : succeeded
        ? 'Only the charity that created this campaign can claim'
        : 'Only available after a successful campaign',
    canClaimRefund,
    claimRefundReason: !refunded
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
  };
}
