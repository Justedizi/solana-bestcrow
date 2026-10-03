use crate::{
    error::BestcrowError,
    events::{EvidenceSubmitted, FundsMoved, MilestoneResolved},
    meta_dao::{self, ProposalState},
    state::{Campaign, CampaignStatus, MilestoneStatus},
    transfer::transfer_out,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator @ BestcrowError::WrongParticipant,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: MetaDAO ownership, discriminator, identity and state are verified below.
    #[account(owner = meta_dao::ID)]
    pub proposal: UncheckedAccount<'info>,
}

pub fn submit_evidence(ctx: Context<SubmitEvidence>, evidence_hash: [u8; 32]) -> Result<()> {
    require!(evidence_hash != [0; 32], BestcrowError::EmptyEvidence);
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Active,
        BestcrowError::InvalidCampaignState
    );
    let index = campaign.current_milestone;
    let milestone = campaign.current()?;
    require!(
        milestone.status == MilestoneStatus::Pending,
        BestcrowError::InvalidMilestoneState
    );
    require!(now <= milestone.due_at, BestcrowError::DeadlinePassed);
    let proposal = meta_dao::validate_proposal(
        &ctx.accounts.proposal.to_account_info(),
        milestone.proposal,
        campaign.creator,
        campaign.meta_dao,
    )?;
    require!(
        !proposal.is_team_sponsored
            && matches!(proposal.state, ProposalState::Draft { .. })
            && proposal.timestamp_enqueued == 0,
        BestcrowError::InvalidProposalState
    );
    let timeout = campaign.market_timeout_secs;
    let campaign_key = campaign.key();
    let milestone = campaign.current_mut()?;
    milestone.evidence_hash = evidence_hash;
    milestone.submitted_at = now;
    milestone.market_deadline = now.checked_add(timeout).ok_or(BestcrowError::Arithmetic)?;
    milestone.status = MilestoneStatus::Reviewing;
    emit!(EvidenceSubmitted {
        campaign: campaign_key,
        milestone_index: index,
        proposal: milestone.proposal,
        evidence_hash,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveMilestone<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    /// CHECK: MetaDAO ownership, discriminator, identity and state are verified below.
    #[account(owner = meta_dao::ID)]
    pub proposal: UncheckedAccount<'info>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: The address must be the original creator; token account ownership is checked.
    #[account(address = campaign.creator @ BestcrowError::WrongParticipant)]
    pub creator: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn resolve_milestone(ctx: Context<ResolveMilestone>) -> Result<()> {
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Active,
        BestcrowError::InvalidCampaignState
    );
    let index = campaign.current_milestone;
    let milestone = campaign.current()?;
    require!(
        milestone.status == MilestoneStatus::Reviewing,
        BestcrowError::InvalidMilestoneState
    );
    let proposal = meta_dao::validate_proposal(
        &ctx.accounts.proposal.to_account_info(),
        milestone.proposal,
        campaign.creator,
        campaign.meta_dao,
    )?;
    if proposal.is_team_sponsored {
        campaign.current_mut()?.status = MilestoneStatus::Rejected;
        campaign.freeze_refunds(CampaignStatus::Terminated);
        emit!(MilestoneResolved {
            campaign: campaign.key(),
            milestone_index: index,
            approved: false,
            terminated: true,
        });
        return Ok(());
    }
    require!(
        proposal.timestamp_enqueued >= milestone.submitted_at
            && proposal.timestamp_enqueued <= milestone.market_deadline,
        BestcrowError::InvalidMarketBinding
    );
    match proposal.state {
        ProposalState::Passed => {
            let amount = milestone.amount;
            transfer_out(
                campaign,
                campaign_info,
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.creator_token.to_account_info(),
                ctx.accounts.quote_mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                amount,
                ctx.accounts.quote_mint.decimals,
            )?;
            campaign.escrow_balance = campaign
                .escrow_balance
                .checked_sub(amount)
                .ok_or(BestcrowError::InsufficientEscrow)?;
            campaign.total_released = campaign
                .total_released
                .checked_add(amount)
                .ok_or(BestcrowError::Arithmetic)?;
            campaign.current_mut()?.status = MilestoneStatus::Passed;
            campaign.current_milestone = campaign
                .current_milestone
                .checked_add(1)
                .ok_or(BestcrowError::Arithmetic)?;
            if campaign.current_milestone as usize == campaign.milestones.len() {
                campaign.status = CampaignStatus::Completed;
            }
            emit!(FundsMoved {
                campaign: campaign.key(),
                recipient: campaign.creator,
                amount,
                refund: false,
                mint: campaign.quote_mint,
            });
            emit!(MilestoneResolved {
                campaign: campaign.key(),
                milestone_index: index,
                approved: true,
                terminated: false,
            });
        }
        ProposalState::Failed => {
            campaign.current_mut()?.status = MilestoneStatus::Rejected;
            campaign.freeze_refunds(CampaignStatus::Terminated);
            emit!(MilestoneResolved {
                campaign: campaign.key(),
                milestone_index: index,
                approved: false,
                terminated: true,
            });
        }
        _ => return err!(BestcrowError::InvalidProposalState),
    }
    Ok(())
}

#[derive(Accounts)]
pub struct ExpireMilestone<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: A timely finalized MetaDAO result cannot be bypassed by a timeout.
    #[account(owner = meta_dao::ID)]
    pub proposal: UncheckedAccount<'info>,
}

pub fn expire_milestone(ctx: Context<ExpireMilestone>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Active,
        BestcrowError::InvalidCampaignState
    );
    let now = Clock::get()?.unix_timestamp;
    let index = campaign.current_milestone;
    let milestone = campaign.current()?;
    let proposal = meta_dao::validate_proposal(
        &ctx.accounts.proposal.to_account_info(),
        milestone.proposal,
        campaign.creator,
        campaign.meta_dao,
    )?;
    let expired = if proposal.is_team_sponsored {
        true
    } else {
        match milestone.status {
            MilestoneStatus::Pending => now > milestone.due_at,
            MilestoneStatus::Reviewing => {
                let valid_market_start = proposal.timestamp_enqueued >= milestone.submitted_at
                    && proposal.timestamp_enqueued <= milestone.market_deadline;
                require!(
                    !matches!(
                        proposal.state,
                        ProposalState::Passed | ProposalState::Failed
                    ) || !valid_market_start,
                    BestcrowError::InvalidProposalState
                );
                now > milestone.market_deadline
            }
            _ => return err!(BestcrowError::InvalidMilestoneState),
        }
    };
    require!(expired, BestcrowError::DeadlineOpen);
    campaign.current_mut()?.status = MilestoneStatus::Rejected;
    campaign.freeze_refunds(CampaignStatus::Terminated);
    emit!(MilestoneResolved {
        campaign: campaign.key(),
        milestone_index: index,
        approved: false,
        terminated: true,
    });
    Ok(())
}
