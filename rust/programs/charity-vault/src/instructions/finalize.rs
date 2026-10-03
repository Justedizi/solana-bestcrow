use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Finalize<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignAccount>,
}

pub fn handler(ctx: Context<Finalize>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Active,
        CharityVaultError::CampaignNotActive
    );
    require!(
        Clock::get()?.unix_timestamp >= campaign.deadline,
        CharityVaultError::DeadlineNotPassed
    );
    campaign.status = if campaign.raised >= campaign.goal {
        CampaignStatus::Succeeded
    } else {
        CampaignStatus::Refunded
    };
    emit!(CampaignFinalized {
        campaign: campaign.key(),
        status: campaign.status
    });
    Ok(())
}

#[event]
pub struct CampaignFinalized {
    pub campaign: Pubkey,
    pub status: CampaignStatus,
}
