use crate::{
    error::BestcrowError,
    events::{CampaignFinalized, ContributionChanged, FundsMoved},
    policy::can_close_backer,
    state::{Backer, Campaign, CampaignStatus},
    transfer::{transfer_in, transfer_out},
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct Pledge<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(
        init_if_needed,
        payer = wallet,
        space = Backer::SPACE,
        seeds = [b"backer", campaign.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub backer: Account<'info, Backer>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = wallet
    )]
    pub wallet_token: Account<'info, TokenAccount>,
    /// CHECK: Only used to verify the fixed creator's associated token account.
    #[account(address = campaign.creator @ BestcrowError::WrongParticipant)]
    pub creator: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn pledge(ctx: Context<Pledge>, amount: u64) -> Result<()> {
    require!(amount > 0, BestcrowError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    require!(now < campaign.funding_deadline, BestcrowError::FundingEnded);
    let new_total = campaign
        .total_raised
        .checked_add(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    require!(new_total <= campaign.goal, BestcrowError::GoalExceeded);

    let backer = &mut ctx.accounts.backer;
    if backer.amount == 0 {
        if backer.campaign != Pubkey::default() {
            require_keys_eq!(
                backer.campaign,
                campaign.key(),
                BestcrowError::WrongParticipant
            );
            require_keys_eq!(
                backer.wallet,
                ctx.accounts.wallet.key(),
                BestcrowError::WrongParticipant
            );
        }
        backer.campaign = campaign.key();
        backer.wallet = ctx.accounts.wallet.key();
        backer.bump = ctx.bumps.backer;
        backer.claimed = false;
        campaign.backer_count = campaign
            .backer_count
            .checked_add(1)
            .ok_or(BestcrowError::Arithmetic)?;
    }

    transfer_in(
        ctx.accounts.wallet_token.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.quote_mint.to_account_info(),
        ctx.accounts.wallet.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
        ctx.accounts.quote_mint.decimals,
    )?;
    backer.amount = backer
        .amount
        .checked_add(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    campaign.total_raised = new_total;
    campaign.escrow_balance = campaign
        .escrow_balance
        .checked_add(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    emit!(ContributionChanged {
        campaign: campaign.key(),
        backer: backer.wallet,
        amount,
        withdrawn: false
    });

    if new_total == campaign.goal {
        require!(
            now <= campaign.current()?.due_at,
            BestcrowError::DeadlinePassed
        );
        let kickoff = campaign.initial_release;
        transfer_out(
            campaign,
            campaign_info,
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator_token.to_account_info(),
            ctx.accounts.quote_mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            kickoff,
            ctx.accounts.quote_mint.decimals,
        )?;
        campaign.escrow_balance = campaign
            .escrow_balance
            .checked_sub(kickoff)
            .ok_or(BestcrowError::InsufficientEscrow)?;
        campaign.total_released = kickoff;
        campaign.status = CampaignStatus::Active;
        emit!(CampaignFinalized {
            campaign: campaign.key(),
            succeeded: true
        });
        emit!(FundsMoved {
            campaign: campaign.key(),
            recipient: campaign.creator,
            amount: kickoff,
            refund: false,
            mint: campaign.quote_mint
        });
    }
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawPledge<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"backer", campaign.key().as_ref(), wallet.key().as_ref()],
        bump = backer.bump
    )]
    pub backer: Account<'info, Backer>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = wallet
    )]
    pub wallet_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_pledge(ctx: Context<WithdrawPledge>, amount: u64) -> Result<()> {
    require!(amount > 0, BestcrowError::ZeroAmount);
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    let backer = &mut ctx.accounts.backer;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    require!(
        Clock::get()?.unix_timestamp < campaign.funding_deadline,
        BestcrowError::FundingEnded
    );
    require_keys_eq!(
        backer.campaign,
        campaign.key(),
        BestcrowError::WrongParticipant
    );
    require_keys_eq!(
        backer.wallet,
        ctx.accounts.wallet.key(),
        BestcrowError::WrongParticipant
    );
    backer.amount = backer
        .amount
        .checked_sub(amount)
        .ok_or(BestcrowError::InsufficientEscrow)?;
    campaign.total_raised = campaign
        .total_raised
        .checked_sub(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    campaign.escrow_balance = campaign
        .escrow_balance
        .checked_sub(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    if backer.amount == 0 {
        campaign.backer_count = campaign
            .backer_count
            .checked_sub(1)
            .ok_or(BestcrowError::Arithmetic)?;
    }
    transfer_out(
        campaign,
        campaign_info,
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.wallet_token.to_account_info(),
        ctx.accounts.quote_mint.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
        ctx.accounts.quote_mint.decimals,
    )?;
    emit!(ContributionChanged {
        campaign: campaign.key(),
        backer: backer.wallet,
        amount,
        withdrawn: true
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseBacker<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Rent is always returned to the wallet recorded in the backer PDA.
    #[account(mut, address = backer.wallet @ BestcrowError::WrongParticipant)]
    pub wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        close = wallet,
        seeds = [b"backer", campaign.key().as_ref(), wallet.key().as_ref()],
        bump = backer.bump
    )]
    pub backer: Account<'info, Backer>,
}

pub fn close_backer(ctx: Context<CloseBacker>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let backer = &ctx.accounts.backer;
    require_keys_eq!(
        backer.campaign,
        campaign.key(),
        BestcrowError::WrongParticipant
    );
    require!(
        can_close_backer(campaign.status, backer.amount, backer.claimed),
        BestcrowError::ReceiptStillNeeded
    );
    Ok(())
}
