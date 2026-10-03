use anchor_lang::prelude::*;

#[error_code]
pub enum CharityVaultError {
    #[msg("Goal must be greater than zero")]
    InvalidGoal,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Campaign deadline has passed")]
    DeadlinePassed,
    #[msg("Campaign deadline has not passed")]
    DeadlineNotPassed,
    #[msg("Campaign has not succeeded")]
    CampaignNotSucceeded,
    #[msg("Campaign has not failed")]
    CampaignNotRefunded,
    #[msg("Campaign goal has not been reached")]
    GoalNotReached,
    #[msg("Campaign goal was reached")]
    GoalReached,
    #[msg("Donation would exceed the campaign goal")]
    GoalOverflow,
    #[msg("Donor registry is full")]
    DonorRegistryFull,
    #[msg("Donor is not registered for this campaign")]
    DonorNotRegistered,
    #[msg("Refund has already been claimed")]
    AlreadyClaimed,
    #[msg("The refund_all account list is invalid")]
    InvalidRefundAccounts,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
