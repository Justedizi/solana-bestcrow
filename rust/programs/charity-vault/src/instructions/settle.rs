use anchor_lang::prelude::*;

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
pub struct Terminate<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned campaign vault PDA.
    pub vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [BOND_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned bond vault PDA.
    pub bond_vault: UncheckedAccount<'info>,
}

pub fn terminate(ctx: Context<Terminate>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(
        ctx.accounts.caller.key() == campaign.creator || campaign.rejections > 0,
        CharityVaultError::UnauthorizedCreator
    );

    campaign.terminated = true;

    // A failed milestone forfeits the creator bond into the refund pool.
    let forfeit = campaign.rejections > 0 && campaign.bond > 0 && !campaign.bond_forfeited;
    if forfeit {
        let bond_vault = ctx.accounts.bond_vault.to_account_info();
        let vault = ctx.accounts.vault.to_account_info();
        let amount = bond_vault.lamports();
        if amount > 0 {
            **bond_vault.try_borrow_mut_lamports()? = 0;
            **vault.try_borrow_mut_lamports()? = vault
                .lamports()
                .checked_add(amount)
                .ok_or(CharityVaultError::ArithmeticOverflow)?;
        }
        campaign.bond_forfeited = true;
    }

    campaign.refund_pool = ctx.accounts.vault.lamports();

    emit!(CampaignTerminated {
        campaign: campaign.key(),
        refund_pool: campaign.refund_pool,
        bond_forfeited: campaign.bond_forfeited,
    });
    Ok(())
}

#[event]
pub struct CampaignTerminated {
    pub campaign: Pubkey,
    pub refund_pool: u64,
    pub bond_forfeited: bool,
}

#[derive(Accounts)]
pub struct ClaimTerminationRefund<'info> {
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
    /// CHECK: Program-owned campaign vault PDA.
    pub vault: UncheckedAccount<'info>,
}

pub fn claim_termination_refund<'a>(ctx: Context<'a, ClaimTerminationRefund<'a>>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.terminated,
        CharityVaultError::CampaignNotTerminated
    );
    require!(campaign.raised > 0, CharityVaultError::GoalNotReached);
    let ledger = &ctx.accounts.ledger;
    require!(!ledger.claimed, CharityVaultError::AlreadyClaimed);

    let numerator = (ledger.amount as u128)
        .checked_mul(campaign.refund_pool as u128)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    let share = (numerator / campaign.raised as u128) as u64;
    let vault = ctx.accounts.vault.to_account_info();
    require!(
        vault.lamports() >= share,
        CharityVaultError::InsufficientVaultBalance
    );
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(share)
        .ok_or(CharityVaultError::InsufficientVaultBalance)?;
    let donor = ctx.accounts.donor.to_account_info();
    **donor.try_borrow_mut_lamports()? = donor
        .lamports()
        .checked_add(share)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    campaign.refunds_claimed = campaign
        .refunds_claimed
        .checked_add(1)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    emit!(TerminationRefund {
        campaign: campaign.key(),
        donor: ledger.donor,
        amount: share
    });

    // Once every donor has claimed, sweep the rounding dust to the creator.
    if campaign.refunds_claimed >= campaign.donor_count {
        let residual = vault.lamports();
        if residual > 0 {
            let creator_info = ctx
                .remaining_accounts
                .first()
                .ok_or(CharityVaultError::InvalidRecipient)?;
            require_keys_eq!(
                *creator_info.key,
                campaign.creator,
                CharityVaultError::InvalidRecipient
            );
            let _ = creator_info;
            **vault.try_borrow_mut_lamports()? = 0;
            let creator_info = &ctx.remaining_accounts[0];
            let balance = creator_info.lamports();
            **creator_info.try_borrow_mut_lamports()? = balance
                .checked_add(residual)
                .ok_or(CharityVaultError::ArithmeticOverflow)?;
        }
    }
    Ok(())
}

#[event]
pub struct TerminationRefund {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct ClaimBond<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [BOND_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned bond vault PDA.
    pub bond_vault: UncheckedAccount<'info>,
}

pub fn claim_bond(ctx: Context<ClaimBond>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(!campaign.bond_forfeited, CharityVaultError::BondUnavailable);
    require!(campaign.bond > 0, CharityVaultError::NoBond);

    let bond_vault = ctx.accounts.bond_vault.to_account_info();
    let amount = bond_vault.lamports();
    if amount > 0 {
        **bond_vault.try_borrow_mut_lamports()? = 0;
        let creator = ctx.accounts.creator.to_account_info();
        **creator.try_borrow_mut_lamports()? = creator
            .lamports()
            .checked_add(amount)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }
    emit!(BondClaimed {
        campaign: campaign.key(),
        creator: campaign.creator,
        amount
    });
    Ok(())
}

#[event]
pub struct BondClaimed {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}
