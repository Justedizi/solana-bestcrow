use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::BestcrowError,
    state::{Backer, Campaign, CampaignState, Tranche, TrancheStatus, Vote},
};

/// P2.1 — the creator submits evidence for the current tranche, opening a
/// fixed 7-day vote. Only the current tranche may receive evidence; the work
/// deadline for that tranche must not have passed.
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
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]],
        bump = tranche.bump
    )]
    pub tranche: Account<'info, Tranche>,
}

pub fn submit_evidence(ctx: Context<SubmitEvidence>, index: u8, evidence_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Success, BestcrowError::CampaignNotActive);
    require!(index == campaign.current_tranche, BestcrowError::TrancheNotCurrent);

    let tranche = &mut ctx.accounts.tranche;
    require!(tranche.index == index, BestcrowError::InvalidTrancheIndex);
    require!(
        matches!(
            tranche.status,
            TrancheStatus::PendingEvidence | TrancheStatus::Revision
        ),
        BestcrowError::InvalidTrancheStatus
    );
    // A first proof must arrive on or before its deadline; after a revision the
    // deadline is refreshed by `finalize_vote`.
    if tranche.round == 1 {
        require!(now <= tranche.evidence_deadline, BestcrowError::EvidenceOverdue);
    }

    tranche.evidence_hash = evidence_hash;
    tranche.status = TrancheStatus::Voting;
    tranche.vote_start = now;
    tranche.yes_weight = 0;
    tranche.no_weight = 0;

    emit!(EvidenceSubmitted {
        campaign: campaign.key(),
        index,
        round: tranche.round,
        evidence_hash,
    });
    Ok(())
}

#[event]
pub struct EvidenceSubmitted {
    pub campaign: Pubkey,
    pub index: u8,
    pub round: u8,
    pub evidence_hash: [u8; 32],
}

/// P2.1 — a backer votes on the current tranche within the 7-day window. One
/// vote per backer per round. Weight is the frozen final pledge amount.
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct VoteMilestone<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(
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
    #[account(
        seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()],
        bump = ledger.bump
    )]
    pub ledger: Account<'info, Backer>,
    #[account(
        init,
        payer = backer,
        space = 8 + Vote::INIT_SPACE,
        seeds = [VOTE_SEED, campaign.key().as_ref(), &[index], &[tranche.round], backer.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

pub fn vote_milestone(ctx: Context<VoteMilestone>, index: u8, approve: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Success, BestcrowError::CampaignNotActive);
    require!(index == campaign.current_tranche, BestcrowError::TrancheNotCurrent);

    let tranche = &mut ctx.accounts.tranche;
    require!(tranche.status == TrancheStatus::Voting, BestcrowError::VoteNotOpen);
    require!(now >= tranche.vote_start, BestcrowError::VoteNotOpen);
    require!(
        now < tranche.vote_start.saturating_add(VOTE_WINDOW_SECS),
        BestcrowError::VoteClosed
    );

    let ledger = &ctx.accounts.ledger;
    require!(!ledger.cancelled, BestcrowError::PledgeCancelled);
    let weight = ledger.amount;
    require!(weight > 0, BestcrowError::NotEligibleVoter);

    if approve {
        tranche.yes_weight = tranche
            .yes_weight
            .checked_add(weight)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
    } else {
        tranche.no_weight = tranche
            .no_weight
            .checked_add(weight)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
    }

    let vote = &mut ctx.accounts.vote;
    vote.campaign = campaign.key();
    vote.tranche = index;
    vote.round = tranche.round;
    vote.backer = ctx.accounts.backer.key();
    vote.approve = approve;
    vote.weight = weight;
    vote.bump = ctx.bumps.vote;

    emit!(MilestoneVoted {
        campaign: campaign.key(),
        index,
        round: tranche.round,
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

/// P2.2 — finalize the vote after the 7-day window. Approval requires
/// `yes_weight * 2 > raised` (strictly more than 50% of all final weight).
/// A first failure opens a 30-day revision; a second failure marks the tranche
/// `Rejected` and requires termination (anyone may then call `terminate`).
#[derive(Accounts)]
#[instruction(index: u8)]
pub struct FinalizeVote<'info> {
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

pub fn finalize_vote(ctx: Context<FinalizeVote>, index: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &ctx.accounts.campaign;
    require!(campaign.state == CampaignState::Success, BestcrowError::CampaignNotActive);
    require!(index == campaign.current_tranche, BestcrowError::TrancheNotCurrent);
    let raised = campaign.raised;
    require!(raised > 0, BestcrowError::NotEligibleVoter);

    let tranche = &mut ctx.accounts.tranche;
    require!(tranche.status == TrancheStatus::Voting, BestcrowError::VoteNotOpen);
    require!(
        now >= tranche.vote_start.saturating_add(VOTE_WINDOW_SECS),
        BestcrowError::VoteStillOpen
    );

    let approved = tranche
        .yes_weight
        .checked_mul(2)
        .ok_or(BestcrowError::ArithmeticOverflow)?
        > raised;

    if approved {
        tranche.status = TrancheStatus::Approved;
    } else if tranche.round == 1 {
        tranche.round = 2;
        tranche.status = TrancheStatus::Revision;
        tranche.evidence_deadline = now
            .checked_add(REVISION_WINDOW_SECS)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
        tranche.yes_weight = 0;
        tranche.no_weight = 0;
    } else {
        tranche.status = TrancheStatus::Rejected;
    }

    emit!(VoteFinalized {
        campaign: campaign.key(),
        index,
        round: tranche.round,
        approved,
        status: tranche.status,
    });
    Ok(())
}

#[event]
pub struct VoteFinalized {
    pub campaign: Pubkey,
    pub index: u8,
    pub round: u8,
    pub approved: bool,
    pub status: TrancheStatus,
}
