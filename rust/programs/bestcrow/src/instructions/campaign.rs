use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::BestcrowError,
    state::{Backer, Campaign, CampaignState, Tranche, TrancheStatus},
};

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateDraft<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    pub system_program: Program<'info, System>,
}

/// P1.1 — create a draft campaign. No funds move; the goal/terms are committed
/// later by `seal_terms`. Funding cannot start and pledges are rejected while
/// the campaign is in `Draft`.
pub fn create_draft(
    ctx: Context<CreateDraft>,
    campaign_id: u64,
    goal: u64,
    terms_hash: [u8; 32],
    content_uri: u32,
) -> Result<()> {
    require!(goal > 0, BestcrowError::InvalidGoal);
    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = campaign_id;
    campaign.goal = goal;
    campaign.funding_deadline = 0;
    campaign.terms_hash = terms_hash;
    campaign.content_uri = content_uri;
    campaign.state = CampaignState::Draft;
    campaign.tranche_count = 0;
    campaign.current_tranche = 0;
    campaign.raised = 0;
    campaign.fee = 0;
    campaign.distributable = 0;
    campaign.released = 0;
    campaign.reserved = 0;
    campaign.refund_pool = 0;
    campaign.bond_forfeited = false;
    campaign.bond_settled = false;
    campaign.bump = ctx.bumps.campaign;
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddTranche<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init,
        payer = creator,
        space = 8 + Tranche::INIT_SPACE,
        seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]],
        bump
    )]
    pub tranche: Account<'info, Tranche>,
    pub system_program: Program<'info, System>,
}

/// P1.1 — add a tranche to a draft. Each share is positive and <= 50%; the
/// final count must be 2..=5 and shares must sum to exactly 10000 bps, enforced
/// at `seal_terms`. Tranche 0 is the initial release.
pub fn add_tranche(
    ctx: Context<AddTranche>,
    index: u8,
    share_bps: u16,
    work_period: i64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.state == CampaignState::Draft,
        BestcrowError::TermsAlreadySealed
    );
    require!(
        index == campaign.tranche_count && (index as usize) < MAX_TRANCHES,
        BestcrowError::InvalidTrancheCount
    );
    let share = share_bps as u64;
    require!(share > 0 && share <= MAX_TRANCHE_BPS, BestcrowError::InvalidTrancheShare);
    require!(work_period > 0, BestcrowError::InvalidFundingWindow);

    let tranche = &mut ctx.accounts.tranche;
    tranche.campaign = campaign.key();
    tranche.index = index;
    tranche.share_bps = share_bps;
    tranche.work_period = work_period;
    tranche.status = if index == 0 {
        TrancheStatus::PendingEvidence
    } else {
        TrancheStatus::Locked
    };
    tranche.evidence_deadline = 0;
    tranche.evidence_hash = [0u8; 32];
    tranche.round = 1;
    tranche.vote_start = 0;
    tranche.yes_weight = 0;
    tranche.no_weight = 0;
    tranche.amount = 0;
    tranche.claim_withdrawn = false;
    tranche.bump = ctx.bumps.tranche;

    campaign.tranche_count = campaign
        .tranche_count
        .checked_add(1)
        .ok_or(BestcrowError::ArithmeticOverflow)?;
    Ok(())
}

/// P1.1 — atomically validate the whole schedule and open funding. Rejects:
/// wrong tranche count, shares != 10000 bps, any share > 5000 bps, and a
/// funding window outside 7..=183 days. Also mints the vault + bond PDAs and
/// moves the campaign to `Funding`.
#[derive(Accounts)]
#[instruction(funding_secs: i64)]
pub struct SealTerms<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(init, payer = creator, space = 0, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned pledge vault PDA.
    pub vault: UncheckedAccount<'info>,
    #[account(init, payer = creator, space = 0, seeds = [BOND_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned bond vault PDA.
    pub bond: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Shares are validated off the tranche accounts passed in. Anchor ties each to
/// the campaign via `TrancheAccount` seeds and the caller passes all of them.
pub fn seal_terms<'info>(
    ctx: Context<'info, SealTerms<'info>>,
    funding_secs: i64,
    _terms_hash: [u8; 32],
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Draft, BestcrowError::TermsAlreadySealed);
    require!(
        (campaign.tranche_count as usize) >= MIN_TRANCHES
            && (campaign.tranche_count as usize) <= MAX_TRANCHES,
        BestcrowError::InvalidTrancheCount
    );
    require!(
        funding_secs >= MIN_FUNDING_SECS && funding_secs <= MAX_FUNDING_SECS,
        BestcrowError::InvalidFundingWindow
    );

    // Re-derive and validate every tranche from the accounts passed in.
    let mut sum: u64 = 0;
    require!(
        ctx.remaining_accounts.len() == campaign.tranche_count as usize,
        BestcrowError::InvalidTrancheCount
    );
    for (i, info) in ctx.remaining_accounts.iter().enumerate() {
        let expected = Pubkey::find_program_address(
            &[TRANCHE_SEED, campaign.key().as_ref(), &[i as u8]],
            &crate::ID,
        )
        .0;
        require_keys_eq!(*info.key, expected, BestcrowError::InvalidTrancheIndex);
        require_keys_eq!(*info.owner, crate::ID, BestcrowError::InvalidTrancheIndex);
        let tranche = Account::<Tranche>::try_from(info)?;
        require!(tranche.index as usize == i, BestcrowError::InvalidTrancheIndex);
        let share = tranche.share_bps as u64;
        require!(share > 0 && share <= MAX_TRANCHE_BPS, BestcrowError::InvalidTrancheShare);
        sum = sum.checked_add(share).ok_or(BestcrowError::ArithmeticOverflow)?;
    }
    require!(sum == BPS_DENOM, BestcrowError::TrancheSharesNotFull);

    // Fund the bond (P1.5): 0.1 SOL, separate from pledges.
    anchor_lang::system_program::transfer(
        CpiContext::new(
            anchor_lang::system_program::ID,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.bond.to_account_info(),
            },
        ),
        BOND_LAMPORTS,
    )?;

    let now = Clock::get()?.unix_timestamp;
    campaign.funding_deadline = now
        .checked_add(funding_secs)
        .ok_or(BestcrowError::ArithmeticOverflow)?;
    campaign.state = CampaignState::Funding;
    campaign.bond_settled = false;

    emit!(FundingStarted {
        campaign: campaign.key(),
        funding_deadline: campaign.funding_deadline,
        goal: campaign.goal,
    });
    Ok(())
}

#[event]
pub struct FundingStarted {
    pub campaign: Pubkey,
    pub funding_deadline: i64,
    pub goal: u64,
}

/// Helper: allocate each tranche amount from `distributable`, giving the last
/// tranche the rounding remainder so the sum is exactly `distributable`.
pub fn allocate_tranche_amounts<'info>(
    remaining: &'info [AccountInfo<'info>],
    distributable: u64,
) -> Result<()> {
    let count = remaining.len();
    if count == 0 {
        return Ok(());
    }
    let mut allocated: u64 = 0;
    for (i, info) in remaining.iter().enumerate() {
        let mut tranche = Account::<Tranche>::try_from(info)?;
        let amount = if i + 1 == count {
            distributable
                .checked_sub(allocated)
                .ok_or(BestcrowError::ArithmeticOverflow)?
        } else {
            let numerator = (distributable as u128)
                .checked_mul(tranche.share_bps as u128)
                .ok_or(BestcrowError::ArithmeticOverflow)?;
            (numerator / BPS_DENOM as u128) as u64
        };
        allocated = allocated
            .checked_add(amount)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
        tranche.amount = amount;
        tranche.exit(&crate::ID)?;
    }
    Ok(())
}

/// Register a first-time backer lazily; shared by pledge instructions.
pub fn touch_backer(backer: &mut Account<Backer>, campaign: &Pubkey, payer: &Pubkey, bump: u8) {
    if backer.campaign == Pubkey::default() {
        backer.campaign = *campaign;
        backer.backer = *payer;
        backer.amount = 0;
        backer.cancelled = false;
        backer.refund_claimed = false;
        backer.termination_refund_claimed = false;
        backer.bump = bump;
    }
}
