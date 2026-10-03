use anchor_lang::prelude::*;

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
pub struct ReleaseInitial<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned campaign vault PDA.
    pub vault: UncheckedAccount<'info>,
}

pub fn release_initial(ctx: Context<ReleaseInitial>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(!campaign.paid, CharityVaultError::AlreadyClaimed);

    let amount = campaign.initial_tranche;
    let vault = ctx.accounts.vault.to_account_info();
    require!(
        vault.lamports() >= amount,
        CharityVaultError::InsufficientVaultBalance
    );
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(CharityVaultError::InsufficientVaultBalance)?;
    let creator = ctx.accounts.creator.to_account_info();
    **creator.try_borrow_mut_lamports()? = creator
        .lamports()
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    campaign.paid = true;
    campaign.released = campaign
        .released
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    emit!(TrancheReleased {
        campaign: campaign.key(),
        index: u8::MAX,
        amount,
        streamed: false
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetSplit<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + SplitAccount::INIT_SPACE,
        seeds = [SPLIT_SEED, campaign.key().as_ref()],
        bump
    )]
    pub split: Account<'info, SplitAccount>,
    pub system_program: Program<'info, System>,
}

pub fn set_split(
    ctx: Context<SetSplit>,
    recipients: Vec<Pubkey>,
    shares_bps: Vec<u16>,
) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(
        !recipients.is_empty()
            && recipients.len() <= MAX_SPLIT_RECIPIENTS
            && recipients.len() == shares_bps.len(),
        CharityVaultError::InvalidSplit
    );
    let mut sum: u64 = 0;
    for share in &shares_bps {
        require!(*share > 0, CharityVaultError::InvalidSplit);
        sum = sum
            .checked_add(*share as u64)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }
    require!(sum == BPS_DENOM, CharityVaultError::InvalidSplit);

    let split = &mut ctx.accounts.split;
    split.campaign = campaign.key();
    split.count = recipients.len() as u8;
    split.recipients = [Pubkey::default(); MAX_SPLIT_RECIPIENTS];
    split.shares_bps = [0u16; MAX_SPLIT_RECIPIENTS];
    for (i, recipient) in recipients.iter().enumerate() {
        split.recipients[i] = *recipient;
        split.shares_bps[i] = shares_bps[i];
    }
    split.bump = ctx.bumps.split;
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ReleaseTranche<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        mut,
        seeds = [MILESTONE_SEED, campaign.key().as_ref(), &[index]],
        bump = milestone.bump
    )]
    pub milestone: Account<'info, MilestoneAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + ClaimAccount::INIT_SPACE,
        seeds = [CLAIM_SEED, campaign.key().as_ref(), &[index]],
        bump
    )]
    pub claim: Account<'info, ClaimAccount>,
    pub system_program: Program<'info, System>,
}

pub fn release_tranche(ctx: Context<ReleaseTranche>, index: u8, duration: i64) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(duration >= 0, CharityVaultError::InvalidSplit);

    let milestone = &ctx.accounts.milestone;
    require!(
        milestone.index == index,
        CharityVaultError::InvalidMilestoneIndex
    );
    require!(
        milestone.status == MilestoneStatus::Released,
        CharityVaultError::InvalidMilestoneStatus
    );

    let amount = milestone.amount;
    let new_released = campaign
        .released
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    require!(
        new_released <= campaign.raised,
        CharityVaultError::InsufficientVaultBalance
    );
    campaign.released = new_released;

    let now = Clock::get()?.unix_timestamp;
    let claim = &mut ctx.accounts.claim;
    claim.campaign = campaign.key();
    claim.milestone_index = index;
    claim.recipient = campaign.creator;
    claim.total = amount;
    claim.claimed = 0;
    claim.start = now;
    claim.duration = duration;
    claim.bump = ctx.bumps.claim;

    emit!(TrancheReleased {
        campaign: campaign.key(),
        index,
        amount,
        streamed: duration > 0
    });
    Ok(())
}

#[event]
pub struct TrancheReleased {
    pub campaign: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub streamed: bool,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct WithdrawClaim<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned campaign vault PDA.
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [CLAIM_SEED, campaign.key().as_ref(), &[index]],
        bump = claim.bump
    )]
    pub claim: Account<'info, ClaimAccount>,
    /// CHECK: The campaign's split PDA when one exists, otherwise any program-owned account.
    #[account(owner = crate::ID)]
    pub split: UncheckedAccount<'info>,
}

pub fn withdraw_claim<'a>(ctx: Context<'a, WithdrawClaim<'a>>, index: u8) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );

    let now = Clock::get()?.unix_timestamp;
    let claim = &mut ctx.accounts.claim;
    require!(
        claim.milestone_index == index,
        CharityVaultError::InvalidMilestoneIndex
    );
    let vested = if claim.duration == 0 {
        claim.total
    } else {
        let elapsed = now.saturating_sub(claim.start).min(claim.duration);
        let numerator = (claim.total as u128)
            .checked_mul(elapsed as u128)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
        (numerator / claim.duration as u128) as u64
    };
    let delta = vested.saturating_sub(claim.claimed);
    require!(delta > 0, CharityVaultError::NothingVested);

    let vault = ctx.accounts.vault.to_account_info();
    require!(
        vault.lamports() >= delta,
        CharityVaultError::InsufficientVaultBalance
    );
    **vault.try_borrow_mut_lamports()? = vault
        .lamports()
        .checked_sub(delta)
        .ok_or(CharityVaultError::InsufficientVaultBalance)?;

    let expected_split =
        Pubkey::find_program_address(&[SPLIT_SEED, campaign.key().as_ref()], &crate::ID).0;
    let split = if ctx.accounts.split.key() == expected_split {
        Some(Account::<SplitAccount>::try_from(&ctx.accounts.split)?)
    } else {
        None
    };

    if let Some(split) = split {
        let count = split.count as usize;
        require!(
            ctx.remaining_accounts.len() == count,
            CharityVaultError::InvalidRecipient
        );
        let mut distributed: u64 = 0;
        for i in 0..count {
            let recipient_info = &ctx.remaining_accounts[i];
            require_keys_eq!(
                *recipient_info.key,
                split.recipients[i],
                CharityVaultError::InvalidRecipient
            );
            require!(
                recipient_info.is_writable,
                CharityVaultError::InvalidRecipient
            );
            let share = if i + 1 == count {
                delta
                    .checked_sub(distributed)
                    .ok_or(CharityVaultError::ArithmeticOverflow)?
            } else {
                let numerator = (delta as u128)
                    .checked_mul(split.shares_bps[i] as u128)
                    .ok_or(CharityVaultError::ArithmeticOverflow)?;
                (numerator / BPS_DENOM as u128) as u64
            };
            distributed = distributed
                .checked_add(share)
                .ok_or(CharityVaultError::ArithmeticOverflow)?;
            if share > 0 {
                let balance = recipient_info.lamports();
                **recipient_info.try_borrow_mut_lamports()? = balance
                    .checked_add(share)
                    .ok_or(CharityVaultError::ArithmeticOverflow)?;
            }
        }
    } else {
        let recipient = ctx
            .remaining_accounts
            .first()
            .ok_or(CharityVaultError::InvalidRecipient)?;
        require_keys_eq!(
            *recipient.key,
            claim.recipient,
            CharityVaultError::InvalidRecipient
        );
        require!(recipient.is_writable, CharityVaultError::InvalidRecipient);
        let balance = recipient.lamports();
        **recipient.try_borrow_mut_lamports()? = balance
            .checked_add(delta)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }

    claim.claimed = claim
        .claimed
        .checked_add(delta)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    let fully = claim.claimed >= claim.total;

    emit!(ClaimWithdrawn {
        campaign: campaign.key(),
        index,
        amount: delta
    });

    if fully {
        claim.close(ctx.accounts.caller.to_account_info())?;
    }
    Ok(())
}

#[event]
pub struct ClaimWithdrawn {
    pub campaign: Pubkey,
    pub index: u8,
    pub amount: u64,
}
