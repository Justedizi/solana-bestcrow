use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::{prelude::*, system_program};

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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Refunded,
        CharityVaultError::CampaignNotRefunded
    );
    let ledger = &ctx.accounts.ledger;
    require!(!ledger.claimed, CharityVaultError::AlreadyClaimed);
    let amount = ledger.amount;
    require!(
        ctx.accounts.vault.lamports() >= amount,
        CharityVaultError::InsufficientVaultBalance
    );

    // Pay the donation from the vault PDA. The ledger is closed by the
    // `close = donor` constraint after this handler returns, returning its rent
    // to the donor too.
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, campaign.key().as_ref(), &[ctx.bumps.vault]];
    system_program::transfer(
        CpiContext::new_with_signer(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.donor.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount,
    )?;

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
