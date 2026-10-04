use anchor_lang::prelude::*;

/// Campaign lifecycle (plan rules 1-11).
///
/// `Funding` -> (`Success` | `Failed`) at the funding deadline.
/// `Success` -> (`Completed` | `Terminated`).
/// `Failed` -> terminal after refunds; `Completed`/`Terminated` are terminal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CampaignState {
    /// Terms are published but funding has not started; no pledges accepted.
    Draft,
    /// Accepting pledges and cancellations until `funding_deadline`.
    Funding,
    /// Goal met. Tranches release by vote.
    Success,
    /// Goal missed. Backers may refund 100%.
    Failed,
    /// All tranches released. Terminal.
    Completed,
    /// Stopped before completion (rejected milestone, missed proof, creator choice).
    Terminated,
}

/// Per-tranche lifecycle (plan rules 8-10).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TrancheStatus {
    /// Not yet eligible (an earlier tranche is current).
    Locked,
    /// Awaiting evidence submission.
    PendingEvidence,
    /// Evidence submitted; 7-day vote open.
    Voting,
    /// First vote failed; 30-day improvement window before the second vote.
    Revision,
    /// Approved; its share of `distributable` is reserved for claim.
    Approved,
    /// Second failure or missed proof; campaign must terminate.
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub creator: Pubkey,
    pub campaign_id: u64,
    /// Lamport goal. Pledges are not capped by this (overfunding allowed).
    pub goal: u64,
    /// Unix seconds; funding closes here. Set when terms are sealed.
    pub funding_deadline: i64,
    /// SHA-256 of the canonical terms JSON (D-005).
    pub terms_hash: [u8; 32],
    /// Index into the off-chain URI map for the canonical terms JSON.
    pub content_uri: u32,
    pub state: CampaignState,
    /// Tranche count, 2..=MAX_TRANCHES.
    pub tranche_count: u8,
    /// Next tranche index eligible for evidence/vote.
    pub current_tranche: u8,
    /// Snapshot of total pledges at finalization. Vote denominator.
    pub raised: u64,
    /// Success fee actually charged, set once at finalization (0 on failure).
    pub fee: u64,
    /// `raised - fee`; the tranche allocation base. Set at finalization.
    pub distributable: u64,
    /// Sum of tranche amounts released so far.
    pub released: u64,
    /// Sum of approved-but-unreleased claims reserved against a refund pool.
    pub reserved: u64,
    /// Frozen refund pool for pro-rata refunds after termination.
    pub refund_pool: u64,
    /// Bond forfeited into the refund pool.
    pub bond_forfeited: bool,
    /// Whether the bond has been paid out (to creator on fail/complete, or pooled).
    pub bond_settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Tranche {
    pub campaign: Pubkey,
    pub index: u8,
    /// Share of `distributable`, in bps; 5000 max. Sum over tranches = 10000.
    pub share_bps: u16,
    /// Work period in seconds after the funding deadline (or after a revision).
    pub work_period: i64,
    pub status: TrancheStatus,
    /// Evidence deadline for the current stage.
    pub evidence_deadline: i64,
    /// Evidence SHA-256 (D-005).
    pub evidence_hash: [u8; 32],
    /// Round 1 or 2.
    pub round: u8,
    /// Vote window start (0 when not voting).
    pub vote_start: i64,
    /// `yes` weight accumulated this round.
    pub yes_weight: u64,
    /// `no` weight accumulated this round.
    pub no_weight: u64,
    /// Tranche amount reserved for claim once approved: floor(distributable*share).
    pub amount: u64,
    /// Set true when the approved amount has been paid; blocks double withdrawal.
    pub claim_withdrawn: bool,
    /// Reserved rent returned when the tranche is finalized.
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Backer {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    /// Cumulative confirmed pledge (a cancellation zeroes this).
    pub amount: u64,
    pub cancelled: bool,
    /// Refund claimed after a failed goal.
    pub refund_claimed: bool,
    /// Pro-rata termination refund claimed.
    pub termination_refund_claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vote {
    pub campaign: Pubkey,
    pub tranche: u8,
    pub round: u8,
    pub backer: Pubkey,
    pub approve: bool,
    /// Weight snapshot taken from the backer's final pledge.
    pub weight: u64,
    pub bump: u8,
}
