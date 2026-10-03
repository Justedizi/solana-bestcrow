use anchor_lang::prelude::*;

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct SubmitEvidence<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
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
}

pub fn submit_evidence(
    ctx: Context<SubmitEvidence>,
    index: u8,
    evidence_hash: [u8; 32],
) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    let milestone = &mut ctx.accounts.milestone;
    require!(
        milestone.index == index,
        CharityVaultError::InvalidMilestoneIndex
    );
    require!(
        matches!(
            milestone.status,
            MilestoneStatus::Pending | MilestoneStatus::Revision
        ),
        CharityVaultError::InvalidMilestoneStatus
    );
    milestone.evidence_hash = evidence_hash;
    milestone.status = MilestoneStatus::Submitted;
    milestone.approve_weight = 0;
    milestone.reject_weight = 0;
    emit!(EvidenceSubmitted {
        campaign: campaign.key(),
        index,
        evidence_hash,
        round: milestone.round,
    });
    Ok(())
}

#[event]
pub struct EvidenceSubmitted {
    pub campaign: Pubkey,
    pub index: u8,
    pub evidence_hash: [u8; 32],
    pub round: u8,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct VoteMilestone<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
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
        seeds = [DONOR_SEED, campaign.key().as_ref(), backer.key().as_ref()],
        bump = ledger.bump
    )]
    pub ledger: Account<'info, DonorLedgerAccount>,
    #[account(
        init,
        payer = backer,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [VOTE_SEED, milestone.key().as_ref(), &[milestone.round], backer.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

pub fn vote_milestone(ctx: Context<VoteMilestone>, index: u8, approve: bool) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require_keys_eq!(
        ctx.accounts.ledger.donor,
        ctx.accounts.backer.key(),
        CharityVaultError::DonorNotRegistered
    );

    let milestone = &mut ctx.accounts.milestone;
    require!(
        milestone.index == index,
        CharityVaultError::InvalidMilestoneIndex
    );
    require!(
        milestone.status == MilestoneStatus::Submitted,
        CharityVaultError::InvalidMilestoneStatus
    );

    let weight = ctx.accounts.ledger.amount;
    require!(weight > 0, CharityVaultError::DonorNotRegistered);
    let total = milestone
        .approve_weight
        .checked_add(milestone.reject_weight)
        .ok_or(CharityVaultError::ArithmeticOverflow)?
        .checked_add(weight)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    require!(
        total <= campaign.raised,
        CharityVaultError::VoteWeightExceedsRaised
    );

    if approve {
        milestone.approve_weight = milestone
            .approve_weight
            .checked_add(weight)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    } else {
        milestone.reject_weight = milestone
            .reject_weight
            .checked_add(weight)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }

    let vote = &mut ctx.accounts.vote;
    vote.milestone = milestone.key();
    vote.backer = ctx.accounts.backer.key();
    vote.approve = approve;
    vote.weight = weight;
    vote.bump = ctx.bumps.vote;

    emit!(MilestoneVoted {
        campaign: campaign.key(),
        index,
        round: milestone.round,
        backer: vote.backer,
        approve,
        weight,
    });
    Ok(())
}

#[event]
pub struct MilestoneVoted {
    pub campaign: Pubkey,
    pub index: u8,
    pub round: u8,
    pub backer: Pubkey,
    pub approve: bool,
    pub weight: u64,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct FinalizeVote<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        mut,
        seeds = [MILESTONE_SEED, campaign.key().as_ref(), &[index]],
        bump = milestone.bump
    )]
    pub milestone: Account<'info, MilestoneAccount>,
}

pub fn finalize_vote(ctx: Context<FinalizeVote>, _index: u8) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let raised = campaign.raised;
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.terminated, CharityVaultError::CampaignTerminated);
    require!(raised > 0, CharityVaultError::GoalNotReached);

    let milestone = &mut ctx.accounts.milestone;
    require!(
        milestone.status == MilestoneStatus::Submitted,
        CharityVaultError::InvalidMilestoneStatus
    );

    let approve_bps = milestone
        .approve_weight
        .checked_mul(BPS_DENOM)
        .ok_or(CharityVaultError::ArithmeticOverflow)?
        / raised;

    if approve_bps >= APPROVE_BPS {
        milestone.status = MilestoneStatus::Released;
    } else if milestone.round == 1 {
        milestone.round = 2;
        milestone.status = MilestoneStatus::Revision;
        milestone.approve_weight = 0;
        milestone.reject_weight = 0;
    } else {
        milestone.status = MilestoneStatus::Rejected;
        campaign.rejections = campaign
            .rejections
            .checked_add(1)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }

    emit!(MilestoneFinalized {
        campaign: campaign.key(),
        index: milestone.index,
        round: milestone.round,
        approve_bps,
        status: milestone.status,
    });
    Ok(())
}

#[event]
pub struct MilestoneFinalized {
    pub campaign: Pubkey,
    pub index: u8,
    pub round: u8,
    pub approve_bps: u64,
    pub status: MilestoneStatus,
}
