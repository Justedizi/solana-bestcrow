use anchor_lang::prelude::*;

#[error_code]
pub enum BestcrowError {
    #[msg("Invalid campaign terms")]
    InvalidTerms,
    #[msg("Campaign is not in the required state")]
    InvalidCampaignState,
    #[msg("Milestone is not in the required state")]
    InvalidMilestoneState,
    #[msg("Funding period has ended")]
    FundingEnded,
    #[msg("Funding period has not ended")]
    FundingOpen,
    #[msg("Campaign goal would be exceeded")]
    GoalExceeded,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Wrong creator or backer account")]
    WrongParticipant,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not passed")]
    DeadlineOpen,
    #[msg("Wrong milestone or MetaDAO proposal")]
    WrongMilestone,
    #[msg("Arithmetic overflow")]
    Arithmetic,
    #[msg("Escrow balance is insufficient")]
    InsufficientEscrow,
    #[msg("Refund is not available")]
    RefundUnavailable,
    #[msg("Refund already claimed")]
    AlreadyClaimed,
    #[msg("Refunds are still outstanding")]
    RefundsOutstanding,
    #[msg("Evidence hash must be nonzero")]
    EmptyEvidence,
    #[msg("Account is still needed for funding or refund")]
    ReceiptStillNeeded,
    #[msg("MetaDAO account has an unexpected owner, discriminator, or layout")]
    InvalidMetaDaoAccount,
    #[msg("MetaDAO DAO and proposal are not bound to this campaign")]
    InvalidMarketBinding,
    #[msg("MetaDAO proposal is not in the required state")]
    InvalidProposalState,
    #[msg("MetaDAO market is still live")]
    MarketStillLive,
    #[msg("Token mint, vault, or recipient account does not match the campaign")]
    InvalidTokenAccount,
}
