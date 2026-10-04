use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::*,
    error::BestcrowError,
    instructions::campaign::touch_backer,
    state::{Backer, Campaign, CampaignState},
};

#[derive(Accounts)]
pub struct Pledge<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init_if_needed,
        payer = backer,
        space = 8 + Backer::INIT_SPACE,
        seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()],
        bump
    )]
    pub ledger: Account<'info, Backer>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned pledge vault PDA.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// P1.2 — pledge during the funding window. **No cap at the goal** (overfunding
/// allowed). A cancelled backer may pledge again; that resets `cancelled`.
pub fn pledge(ctx: Context<Pledge>, amount: u64) -> Result<()> {
    require!(amount > 0, BestcrowError::InvalidPledge);
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Funding, BestcrowError::NotFunding);
    require!(now < campaign.funding_deadline, BestcrowError::FundingClosed);

    let ledger = &mut ctx.accounts.ledger;
    touch_backer(ledger, &campaign.key(), &ctx.accounts.backer.key(), ctx.bumps.ledger);
    ledger.cancelled = false;
    ledger.refund_claimed = false;
    ledger.termination_refund_claimed = false;
    ledger.amount = ledger
        .amount
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;
    campaign.raised = campaign
        .raised
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.backer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(Pledged { campaign: campaign.key(), backer: ledger.backer, amount, raised: campaign.raised });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelPledge<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        has_one = backer,
        seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()],
        bump = ledger.bump
    )]
    pub ledger: Account<'info, Backer>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned pledge vault PDA.
    pub vault: UncheckedAccount<'info>,
}

/// P1.2 — cancel the full current pledge, only while funding is open. Returns
/// the pledge lamports to the backer (rent of the ledger stays until close).
pub fn cancel_pledge(ctx: Context<CancelPledge>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Funding, BestcrowError::NotFunding);
    require!(now < campaign.funding_deadline, BestcrowError::FundingClosed);

    let ledger = &mut ctx.accounts.ledger;
    require!(!ledger.cancelled, BestcrowError::PledgeCancelled);
    let amount = ledger.amount;
    require!(amount > 0, BestcrowError::NoPledge);

    let vault = ctx.accounts.vault.to_account_info();
    require!(vault.lamports() >= amount, BestcrowError::InsufficientVault);
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(BestcrowError::InsufficientVault)?;
    let backer = ctx.accounts.backer.to_account_info();
    **backer.try_borrow_mut_lamports()? = backer
        .lamports()
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    ledger.amount = 0;
    ledger.cancelled = true;
    campaign.raised = campaign
        .raised
        .checked_sub(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    emit!(PledgeCancelled { campaign: campaign.key(), backer: ledger.backer, amount });
    Ok(())
}

#[event]
pub struct Pledged {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
    pub raised: u64,
}

#[event]
pub struct PledgeCancelled {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
}
