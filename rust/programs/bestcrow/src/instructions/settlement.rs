use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::BestcrowError,
    instructions::campaign::allocate_tranche_amounts,
    state::{Backer, Campaign, CampaignState, Tranche, TrancheStatus},
};

/// P1.4 — finalize funding at/after the deadline. Freezes `raised`. On success
/// charges the 1% fee exactly once and reserves each tranche amount from
/// `distributable`. On failure, marks the campaign refundable with no fee.
///
/// The caller must pass: all tranche accounts (in index order) and the treasury
/// account. Treasury is validated against the `TREASURY` constant.
#[derive(Accounts)]
pub struct FinalizeFunding<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: must equal the disclosed treasury constant; receives the success fee.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn finalize_funding<'info>(ctx: Context<'info, FinalizeFunding<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Funding, BestcrowError::NotFunding);
    require!(now >= campaign.funding_deadline, BestcrowError::FundingNotClosed);

    let raised = campaign.raised;
    let success = raised >= campaign.goal;

    if success {
        // 1% of the final raised amount, floored, charged once.
        let fee = ((raised as u128) * (FEE_BPS as u128) / (BPS_DENOM as u128)) as u64;
        campaign.fee = fee;
        campaign.distributable = raised
            .checked_sub(fee)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
        campaign.state = CampaignState::Success;

        if fee > 0 {
            require_keys_eq!(ctx.accounts.treasury.key(), TREASURY, BestcrowError::BondUnavailable);
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? = ctx
                .accounts
                .treasury
                .lamports()
                .checked_add(fee)
                .ok_or(BestcrowError::ArithmeticOverflow)?;
        }

        // Reserve each tranche's share of distributable (last gets remainder).
        allocate_tranche_amounts(ctx.remaining_accounts, campaign.distributable)?;
    } else {
        campaign.fee = 0;
        campaign.distributable = 0;
        campaign.state = CampaignState::Failed;
    }

    emit!(FundingFinalized {
        campaign: campaign.key(),
        raised,
        fee: campaign.fee,
        success,
    });
    Ok(())
}

#[event]
pub struct FundingFinalized {
    pub campaign: Pubkey,
    pub raised: u64,
    pub fee: u64,
    pub success: bool,
}

/// P1.3 / rule 5 — permissionless refund: anyone may trigger a backer's 100%
/// refund after a failed goal. The lamports always go to the registered
/// backer's own wallet, never to the caller.
#[derive(Accounts)]
pub struct RefundFor<'info> {
    pub caller: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: the registered backer who receives the refund.
    #[account(mut)]
    pub backer_wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [BACKER_SEED, campaign.key().as_ref(), backer_wallet.key().as_ref()],
        bump = ledger.bump
    )]
    pub ledger: Account<'info, Backer>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned pledge vault PDA.
    pub vault: UncheckedAccount<'info>,
}

pub fn refund_for(ctx: Context<RefundFor>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Failed, BestcrowError::NotRefundable);
    let ledger = &mut ctx.accounts.ledger;
    require!(!ledger.refund_claimed, BestcrowError::RefundClaimed);
    let amount = ledger.amount;
    require!(amount > 0, BestcrowError::NoPledge);

    let vault = ctx.accounts.vault.to_account_info();
    require!(vault.lamports() >= amount, BestcrowError::InsufficientVault);
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(BestcrowError::InsufficientVault)?;
    **ctx.accounts.backer_wallet.to_account_info().try_borrow_mut_lamports()? = ctx
        .accounts
        .backer_wallet
        .lamports()
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    ledger.refund_claimed = true;

    emit!(Refunded { campaign: campaign.key(), backer: ledger.backer, amount });
    Ok(())
}

#[event]
pub struct Refunded {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
}

/// Whether a tranche has been released in full (used by completed-state logic).
pub fn tranche_released(tranche: &Account<Tranche>) -> bool {
    tranche.status == TrancheStatus::Approved
}
