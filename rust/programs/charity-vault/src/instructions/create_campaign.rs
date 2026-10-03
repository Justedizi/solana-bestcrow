use anchor_lang::prelude::*;

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + CampaignAccount::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        init,
        payer = creator,
        space = 0,
        seeds = [VAULT_SEED, campaign.key().as_ref()],
        bump
    )]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateCampaign>,
    campaign_id: u64,
    goal: u64,
    deadline: i64,
    desc_hash: [u8; 32],
) -> Result<()> {
    require!(goal > 0, CharityVaultError::InvalidGoal);
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, CharityVaultError::InvalidDeadline);

    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = campaign_id;
    campaign.goal = goal;
    campaign.deadline = deadline;
    campaign.desc_hash = desc_hash;
    campaign.raised = 0;
    campaign.paid = false;
    campaign.status = CampaignStatus::Active;
    campaign.donor_count = 0;
    campaign.donors = [Pubkey::default(); MAX_DONORS];
    campaign.bump = ctx.bumps.campaign;

    emit!(CampaignCreated {
        campaign: campaign.key(),
        creator: campaign.creator,
        campaign_id,
        goal,
        deadline,
        desc_hash,
    });
    Ok(())
}

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub deadline: i64,
    pub desc_hash: [u8; 32],
}
