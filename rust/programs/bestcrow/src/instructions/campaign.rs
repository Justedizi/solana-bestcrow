use crate::{
    constants::{USDC_DEVNET_MINT, USDC_MAINNET_MINT},
    error::BestcrowError,
    events::{CampaignCreated, CampaignFinalized},
    meta_dao::{self, ProposalState},
    policy::validate_terms,
    state::{Campaign, CampaignStatus, CreateCampaignArgs, DaoBinding, Milestone, MilestoneStatus},
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(args: CreateCampaignArgs)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = Campaign::SPACE,
        seeds = [b"campaign", creator.key().as_ref(), &args.campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(
        init,
        payer = creator,
        space = DaoBinding::SPACE,
        seeds = [b"dao-binding", meta_dao.key().as_ref()],
        bump
    )]
    pub dao_binding: Account<'info, DaoBinding>,
    pub quote_mint: Account<'info, Mint>,
    pub base_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        seeds = [b"vault", campaign.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    /// CHECK: Owner and account layout are verified against MetaDAO's pinned ABI.
    #[account(owner = meta_dao::ID)]
    pub meta_dao: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
    validate_terms(&args, Clock::get()?.unix_timestamp)?;
    require!(
        ctx.accounts.quote_mint.key() == USDC_DEVNET_MINT
            || ctx.accounts.quote_mint.key() == USDC_MAINNET_MINT,
        BestcrowError::InvalidTokenAccount
    );
    require!(
        ctx.accounts.quote_mint.decimals == 6,
        BestcrowError::InvalidTokenAccount
    );
    require_keys_neq!(
        ctx.accounts.base_mint.key(),
        ctx.accounts.quote_mint.key(),
        BestcrowError::InvalidTerms
    );
    meta_dao::validate_dao(
        &ctx.accounts.meta_dao.to_account_info(),
        ctx.accounts.base_mint.key(),
        ctx.accounts.quote_mint.key(),
        args.market_timeout_secs,
    )?;
    require!(
        ctx.remaining_accounts.len() == args.milestones.len(),
        BestcrowError::InvalidMarketBinding
    );
    for (spec, proposal_info) in args.milestones.iter().zip(ctx.remaining_accounts.iter()) {
        let proposal = meta_dao::validate_proposal(
            proposal_info,
            spec.proposal,
            ctx.accounts.creator.key(),
            ctx.accounts.meta_dao.key(),
        )?;
        require!(
            matches!(proposal.state, ProposalState::Draft { .. }),
            BestcrowError::InvalidProposalState
        );
        require!(
            !proposal.is_team_sponsored
                && proposal.timestamp_enqueued == 0
                && proposal.duration_in_seconds as i64 <= args.market_timeout_secs,
            BestcrowError::InvalidMarketBinding
        );
    }

    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = args.campaign_id;
    campaign.quote_mint = ctx.accounts.quote_mint.key();
    campaign.base_mint = ctx.accounts.base_mint.key();
    campaign.vault = ctx.accounts.vault.key();
    campaign.meta_dao = ctx.accounts.meta_dao.key();
    campaign.goal = args.goal;
    campaign.total_raised = 0;
    campaign.escrow_balance = 0;
    campaign.total_released = 0;
    campaign.initial_release = args.initial_release;
    campaign.refund_pool = 0;
    campaign.refund_denominator = 0;
    campaign.refunded_amount = 0;
    campaign.funding_deadline = args.funding_deadline;
    campaign.market_timeout_secs = args.market_timeout_secs;
    campaign.metadata_hash = args.metadata_hash;
    campaign.current_milestone = 0;
    campaign.status = CampaignStatus::Funding;
    campaign.backer_count = 0;
    campaign.refund_claim_count = 0;
    campaign.bump = ctx.bumps.campaign;
    campaign.vault_bump = ctx.bumps.vault;
    campaign.milestones = args
        .milestones
        .into_iter()
        .map(|input| Milestone {
            amount: input.amount,
            due_at: input.due_at,
            proposal: input.proposal,
            evidence_hash: [0; 32],
            submitted_at: 0,
            market_deadline: 0,
            status: MilestoneStatus::Pending,
        })
        .collect();

    let binding = &mut ctx.accounts.dao_binding;
    binding.dao = ctx.accounts.meta_dao.key();
    binding.campaign = campaign.key();
    binding.bump = ctx.bumps.dao_binding;

    emit!(CampaignCreated {
        campaign: campaign.key(),
        creator: campaign.creator,
        goal: campaign.goal,
        funding_deadline: campaign.funding_deadline,
        quote_mint: campaign.quote_mint,
        base_mint: campaign.base_mint,
        meta_dao: campaign.meta_dao,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeFunding<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn finalize_funding(ctx: Context<FinalizeFunding>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    require!(
        Clock::get()?.unix_timestamp >= campaign.funding_deadline,
        BestcrowError::FundingOpen
    );
    require!(
        campaign.total_raised < campaign.goal,
        BestcrowError::InvalidCampaignState
    );
    campaign.freeze_refunds(CampaignStatus::Failed);
    emit!(CampaignFinalized {
        campaign: campaign.key(),
        succeeded: false
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelCampaign<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator @ BestcrowError::WrongParticipant,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn cancel_campaign(ctx: Context<CancelCampaign>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    campaign.freeze_refunds(CampaignStatus::Failed);
    emit!(CampaignFinalized {
        campaign: campaign.key(),
        succeeded: false
    });
    Ok(())
}
