use crate::{
    error::BestcrowError,
    events::FundsMoved,
    policy::refund_amount,
    state::{Backer, Campaign, CampaignStatus},
    transfer::transfer_out,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Its key is checked against the backer PDA; it receives account rent.
    #[account(mut, address = backer.wallet @ BestcrowError::WrongParticipant)]
    pub wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        close = wallet,
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
        init_if_needed,
        payer = caller,
        associated_token::mint = quote_mint,
        associated_token::authority = wallet
    )]
    pub wallet_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    let backer = &mut ctx.accounts.backer;
    require!(
        matches!(
            campaign.status,
            CampaignStatus::Failed | CampaignStatus::Terminated
        ),
        BestcrowError::RefundUnavailable
    );
    require_keys_eq!(
        backer.campaign,
        campaign.key(),
        BestcrowError::WrongParticipant
    );
    require!(backer.amount > 0, BestcrowError::RefundUnavailable);
    require!(!backer.claimed, BestcrowError::AlreadyClaimed);
    let amount = refund_amount(
        backer.amount,
        campaign.refund_pool,
        campaign.refund_denominator,
    )?;
    campaign.escrow_balance = campaign
        .escrow_balance
        .checked_sub(amount)
        .ok_or(BestcrowError::InsufficientEscrow)?;
    campaign.refunded_amount = campaign
        .refunded_amount
        .checked_add(amount)
        .ok_or(BestcrowError::Arithmetic)?;
    campaign.refund_claim_count = campaign
        .refund_claim_count
        .checked_add(1)
        .ok_or(BestcrowError::Arithmetic)?;
    backer.claimed = true;
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
    emit!(FundsMoved {
        campaign: campaign.key(),
        recipient: backer.wallet,
        amount,
        refund: true,
        mint: campaign.quote_mint,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SweepDust<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Its key is checked against the campaign creator.
    #[account(address = campaign.creator @ BestcrowError::WrongParticipant)]
    pub creator: UncheckedAccount<'info>,
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
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn sweep_dust(ctx: Context<SweepDust>) -> Result<()> {
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    require!(
        matches!(
            campaign.status,
            CampaignStatus::Failed | CampaignStatus::Terminated
        ),
        BestcrowError::RefundUnavailable
    );
    require!(
        campaign.refund_claim_count == campaign.backer_count,
        BestcrowError::RefundsOutstanding
    );
    let dust = campaign.escrow_balance;
    campaign.escrow_balance = 0;
    transfer_out(
        campaign,
        campaign_info,
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.creator_token.to_account_info(),
        ctx.accounts.quote_mint.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        dust,
        ctx.accounts.quote_mint.decimals,
    )?;
    emit!(FundsMoved {
        campaign: campaign.key(),
        recipient: campaign.creator,
        amount: dust,
        refund: false,
        mint: campaign.quote_mint,
    });
    Ok(())
}
