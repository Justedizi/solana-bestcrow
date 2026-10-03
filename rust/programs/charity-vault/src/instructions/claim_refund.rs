use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [DONOR_SEED, campaign.key().as_ref(), donor.key().as_ref()], bump = ledger.bump, has_one = donor)]
    pub ledger: Account<'info, DonorLedgerAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Refunded,
        CharityVaultError::CampaignNotRefunded
    );
    let ledger = &mut ctx.accounts.ledger;
    require!(!ledger.claimed, CharityVaultError::AlreadyClaimed);
    let amount = ledger.amount;
    require!(
        ctx.accounts.vault.lamports() >= amount,
        CharityVaultError::InsufficientVaultBalance
    );
    ledger.claimed = true;
    let vault_balance = ctx.accounts.vault.lamports();
    **ctx
        .accounts
        .vault
        .to_account_info()
        .try_borrow_mut_lamports()? = vault_balance
        .checked_sub(amount)
        .ok_or(CharityVaultError::InsufficientVaultBalance)?;
    let donor_balance = ctx.accounts.donor.lamports();
    **ctx
        .accounts
        .donor
        .to_account_info()
        .try_borrow_mut_lamports()? = donor_balance
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
