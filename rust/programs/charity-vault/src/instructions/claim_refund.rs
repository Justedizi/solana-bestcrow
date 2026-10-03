use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        mut,
        seeds = [DONOR_SEED, campaign.key().as_ref(), donor.key().as_ref()],
        bump = ledger.bump,
        has_one = donor,
        close = donor
    )]
    pub ledger: Account<'info, DonorLedgerAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(
        campaign.status == CampaignStatus::Refunded,
        CharityVaultError::CampaignNotRefunded
    );
    let ledger = &ctx.accounts.ledger;
    require!(!ledger.claimed, CharityVaultError::AlreadyClaimed);
    let amount = ledger.amount;

    // The vault is program-owned, so the System Program cannot debit it. Move
    // the exact pledge with a direct lamport transfer. The ledger is closed by
    // the `close = donor` constraint, returning its rent to the donor too.
    let vault = ctx.accounts.vault.to_account_info();
    require!(
        vault.lamports() >= amount,
        CharityVaultError::InsufficientVaultBalance
    );
    let vault_balance = vault.lamports();
    **vault.try_borrow_mut_lamports()? = vault_balance
        .checked_sub(amount)
        .ok_or(CharityVaultError::InsufficientVaultBalance)?;
    let donor_state = ctx.accounts.donor.to_account_info();
    let donor_balance = donor_state.lamports();
    **donor_state.try_borrow_mut_lamports()? = donor_balance
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    emit!(RefundIssued {
        campaign: campaign.key(),
        donor: ledger.donor,
        amount
    });
    Ok(())
}

#[event]
pub struct RefundIssued {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
}
