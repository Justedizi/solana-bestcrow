use anchor_lang::prelude::*;

use crate::constants::{MAX_DONORS, MAX_MILESTONES, MAX_SPLIT_RECIPIENTS};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CampaignStatus {
    Active,
    Succeeded,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MilestoneStatus {
    /// No evidence submitted yet.
    Pending,
    /// Evidence submitted; backers may vote.
    Submitted,
    /// First vote landed between 50% and 70%; creator may resubmit.
    Revision,
    /// Vote passed; the tranche is released (claims minted).
    Released,
    /// Vote failed twice; the campaign must terminate.
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignAccount {
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub deadline: i64,
    pub desc_hash: [u8; 32],
    pub raised: u64,
    pub paid: bool,
    pub status: CampaignStatus,
    pub donor_count: u8,
    pub donors: [Pubkey; MAX_DONORS],
    pub bump: u8,
    // ---- Bundle A: staged funding ----
    /// True when the campaign releases funds by milestone instead of a single sweep.
    pub staged: bool,
    /// Total budget the milestone schedule may allocate (lamports).
    pub base_budget: u64,
    /// Tranche unlocked once fundraising succeeds.
    pub initial_tranche: u64,
    /// Total lamports released through claims so far.
    pub released: u64,
    /// Creator bond held in the bond vault.
    pub bond: u64,
    /// Set when the bond is forfeited to the refund pool.
    pub bond_forfeited: bool,
    pub terminated: bool,
    pub milestone_count: u8,
    /// Sum of milestone amounts committed (excluding the initial tranche).
    pub allocated: u64,
    /// Count of milestones that failed their second vote.
    pub rejections: u8,
    /// Frozen refund pool after termination.
    pub refund_pool: u64,
    /// Number of donors that have claimed their pro-rata refund.
    pub refunds_claimed: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DonorLedgerAccount {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MilestoneAccount {
    pub campaign: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub deadline: i64,
    pub evidence_hash: [u8; 32],
    pub status: MilestoneStatus,
    pub approve_weight: u64,
    pub reject_weight: u64,
    /// 1 on the first vote, 2 after a revision. Failure on 2 terminates.
    pub round: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub milestone: Pubkey,
    pub backer: Pubkey,
    pub approve: bool,
    pub weight: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SplitAccount {
    pub campaign: Pubkey,
    pub count: u8,
    pub recipients: [Pubkey; MAX_SPLIT_RECIPIENTS],
    pub shares_bps: [u16; MAX_SPLIT_RECIPIENTS],
    pub bump: u8,
}

/// A pull-claim for one released tranche share. `duration == 0` pays instantly;
/// otherwise the amount vests linearly and can be withdrawn as it unlocks.
#[account]
#[derive(InitSpace)]
pub struct ClaimAccount {
    pub campaign: Pubkey,
    pub milestone_index: u8,
    pub recipient: Pubkey,
    pub total: u64,
    pub claimed: u64,
    pub start: i64,
    pub duration: i64,
    pub bump: u8,
}

impl MilestoneAccount {
    pub fn uses_index(index: u8) -> bool {
        (index as usize) < MAX_MILESTONES
    }
}
