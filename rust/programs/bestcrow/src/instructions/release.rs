use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::BestcrowError,
    state::{Campaign, CampaignState, Tranche, TrancheStatus},
};

/// P2.3 — turn an approved tranche into a payable claim, exactly once. Sets the
/// tranche's `amount` is already reserved from `distributable`; marks it
/// `Released` (via `released` accounting) and advances the campaign to the next
/// tranche, setting that tranche's evidence deadline. Permissionless: anyone may
/// call once the vote has approved.
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ReleaseTranche<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]],
        bump = tranche.bump
    )]
    pub tranche: Account<'info, Tranche>,
}

pub fn release_tranche(ctx: Context<ReleaseTranche>, index: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Success, BestcrowError::CampaignNotActive);
    require!(index == campaign.current_tranche, BestcrowError::TrancheNotCurrent);

    let tranche = &mut ctx.accounts.tranche;
    require!(tranche.status == TrancheStatus::Approved, BestcrowError::WasApproved);
    let amount = tranche.amount;

    // Reserve is released from the "reserved" tally (already excluded from
    // any refund pool) and counted into `released`.
    campaign.released = campaign
        .released
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    let is_last = (index as usize) + 1 == campaign.tranche_count as usize;
    if is_last {
        campaign.state = CampaignState::Completed;
    } else {
        campaign.current_tranche = campaign
            .current_tranche
            .checked_add(1)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
        // The next tranche's work window starts now.
        let next_index = campaign.current_tranche;
        let next_expected = Pubkey::find_program_address(
            &[TRANCHE_SEED, campaign.key().as_ref(), &[next_index]],
            &crate::ID,
        )
        .0;
        let next_info = ctx
            .remaining_accounts
            .get(next_index as usize)
            .ok_or(BestcrowError::InvalidTrancheIndex)?;
        require_keys_eq!(*next_info.key, next_expected, BestcrowError::InvalidTrancheIndex);
        let mut next = Account::<Tranche>::try_from(next_info)?;
        next.status = TrancheStatus::PendingEvidence;
        next.round = 1;
        next.yes_weight = 0;
        next.no_weight = 0;
        next.vote_start = 0;
        next.evidence_deadline = now
            .checked_add(next.work_period)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
        next.exit(&crate::ID)?;
    }

    tranche.status = TrancheStatus::Approved; // stays approved; `released` counts it
    emit!(TrancheReleased {
        campaign: campaign.key(),
        index,
        amount,
        completed: is_last,
    });
    Ok(())
}

#[event]
pub struct TrancheReleased {
    pub campaign: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub completed: bool,
}

/// P2.3 — pay an approved tranche to its fixed recipient, exactly once. The
/// recipient is the campaign creator (per the MVP's single-recipient model);
/// the split extension is deferred and is not silently bypassable because no
/// arbitrary destination is accepted here.
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct WithdrawClaim<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned pledge vault PDA.
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]],
        bump = tranche.bump
    )]
    pub tranche: Account<'info, Tranche>,
    /// CHECK: the fixed recipient; must equal the campaign creator.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

pub fn withdraw_claim(ctx: Context<WithdrawClaim>, index: u8) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let tranche = &mut ctx.accounts.tranche;
    require_keys_eq!(ctx.accounts.recipient.key(), campaign.creator, BestcrowError::UnauthorizedCreator);
    require!(tranche.index == index, BestcrowError::InvalidTrancheIndex);

    // A claim is payable only after its tranche was released (status Approved and
    // the campaign advanced past it or completed), and only once.
    require!(tranche.status == TrancheStatus::Approved, BestcrowError::ClaimUnavailable);
    require!(!tranche.claim_withdrawn, BestcrowError::ClaimWithdrawn);
    let amount = tranche.amount;
    require!(amount > 0, BestcrowError::ClaimUnavailable);

    let vault = ctx.accounts.vault.to_account_info();
    require!(vault.lamports() >= amount, BestcrowError::InsufficientVault);
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(BestcrowError::InsufficientVault)?;
    **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? = ctx
        .accounts
        .recipient
        .lamports()
        .checked_add(amount)
        .ok_or(BestcrowError::ArithmeticOverflow)?;

    tranche.claim_withdrawn = true;

    emit!(ClaimWithdrawn {
        campaign: campaign.key(),
        index,
        recipient: campaign.creator,
        amount,
    });
    Ok(())
}

#[event]
pub struct ClaimWithdrawn {
    pub campaign: Pubkey,
    pub index: u8,
    pub recipient: Pubkey,
    pub amount: u64,
}
