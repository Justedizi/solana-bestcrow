use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::{prelude::*, system_program};

#[derive(Accounts)]
pub struct ClaimSuccess<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimSuccess>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Succeeded,
        CharityVaultError::CampaignNotSucceeded
    );
    require!(!campaign.paid, CharityVaultError::AlreadyClaimed);
    campaign.paid = true;

    // Sweep the whole vault, contributions plus the rent reserve the creator
    // funded at creation, to the creator. The emptied vault is purged by the
    // runtime.
    let amount = ctx.accounts.vault.lamports();
    if amount > 0 {
        let campaign_key = campaign.key();
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, campaign_key.as_ref(), &[ctx.bumps.vault]];
        system_program::transfer(
            CpiContext::new_with_signer(
                system_program::ID,
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
                &[vault_seeds],
            ),
            amount,
        )?;
    }
    emit!(SuccessClaimed {
        campaign: campaign.key(),
        creator: campaign.creator,
        amount
    });
    Ok(())
}

#[event]
pub struct SuccessClaimed {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}
