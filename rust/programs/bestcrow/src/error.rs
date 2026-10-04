use anchor_lang::prelude::*;

#[error_code]
pub enum BestcrowError {
    #[msg("Goal must be greater than zero")]
    InvalidGoal,
    #[msg("Funding window must be between 7 and 183 days")]
    InvalidFundingWindow,
    #[msg("Campaign must have 2 to 5 tranches")]
    InvalidTrancheCount,
    #[msg("Tranche share must be positive and at most 50%")]
    InvalidTrancheShare,
    #[msg("Tranche shares must sum to exactly 100%")]
    TrancheSharesNotFull,
    #[msg("Campaign has no tranches yet")]
    NoTranches,
    #[msg("Campaign terms are already sealed")]
    TermsAlreadySealed,
    #[msg("Campaign terms are not sealed yet")]
    TermsNotSealed,
    #[msg("Campaign is not in the funding phase")]
    NotFunding,
    #[msg("Campaign funding deadline has passed")]
    FundingClosed,
    #[msg("Funding deadline has not passed yet")]
    FundingNotClosed,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Campaign has reached a terminal state")]
    CampaignTerminal,
    #[msg("Only the campaign creator may do this")]
    UnauthorizedCreator,
    #[msg("Pledge amount must be greater than zero")]
    InvalidPledge,
    #[msg("Backer has no active pledge to cancel")]
    NoPledge,
    #[msg("Backer already cancelled their pledge")]
    PledgeCancelled,
    #[msg("Backer is not registered for this campaign")]
    BackerNotRegistered,
    #[msg("Tranche index is out of range")]
    InvalidTrancheIndex,
    #[msg("Tranche is not in the expected state")]
    InvalidTrancheStatus,
    #[msg("Only the current tranche may receive evidence or votes")]
    TrancheNotCurrent,
    #[msg("Evidence deadline has not passed")]
    EvidenceNotDue,
    #[msg("Evidence deadline has passed")]
    EvidenceOverdue,
    #[msg("Voting window has not started")]
    VoteNotOpen,
    #[msg("Voting window has closed")]
    VoteClosed,
    #[msg("Voting window is still open")]
    VoteStillOpen,
    #[msg("Backer already voted in this round")]
    AlreadyVoted,
    #[msg("Backer is not eligible to vote")]
    NotEligibleVoter,
    #[msg("Approval requires more than 50% of final raised weight")]
    NotApproved,
    #[msg("Milestone was approved")]
    WasApproved,
    #[msg("Claim has already been withdrawn")]
    ClaimWithdrawn,
    #[msg("Claim is not funded or not yet released")]
    ClaimUnavailable,
    #[msg("Refund has already been claimed")]
    RefundClaimed,
    #[msg("Vault balance is insufficient")]
    InsufficientVault,
    #[msg("Bond is not claimable in this state")]
    BondUnavailable,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Campaign is not in a refundable terminal state")]
    NotRefundable,
    #[msg("Campaign is not terminable in this state")]
    NotTerminable,
}
