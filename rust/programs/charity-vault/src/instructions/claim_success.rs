use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimSuccess<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
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
    // funded at creation, to the creator. The vault is program-owned, so the
    // System Program cannot debit it; move the lamports directly. The emptied
    // account is purged by the runtime.
    let vault = ctx.accounts.vault.to_account_info();
    let amount = vault.lamports();
    if amount > 0 {
        **vault.try_borrow_mut_lamports()? = 0;
        let creator_info = ctx.accounts.creator.to_account_info();
        let creator_balance = creator_info.lamports();
        **creator_info.try_borrow_mut_lamports()? = creator_balance
            .checked_add(amount)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
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
