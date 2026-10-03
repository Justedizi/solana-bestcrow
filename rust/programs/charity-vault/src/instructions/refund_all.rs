use super::claim_refund::RefundIssued;
use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RefundAll<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RefundAll>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Refunded,
        CharityVaultError::CampaignNotRefunded
    );
    let count = campaign.donor_count as usize;
    require!(
        ctx.remaining_accounts.len() == count * 2,
        CharityVaultError::InvalidRefundAccounts
    );

    let vault = ctx.accounts.vault.to_account_info();
    for index in 0..count {
        let ledger_info = &ctx.remaining_accounts[index * 2];
        let recipient_info = &ctx.remaining_accounts[index * 2 + 1];
        let donor = campaign.donors[index];
        require_keys_eq!(
            *recipient_info.key,
            donor,
            CharityVaultError::InvalidRefundAccounts
        );
        let expected = Pubkey::find_program_address(
            &[DONOR_SEED, campaign.key().as_ref(), donor.as_ref()],
            &crate::ID,
        )
        .0;
        require_keys_eq!(
            *ledger_info.key,
            expected,
            CharityVaultError::InvalidRefundAccounts
        );
        require!(
            ledger_info.is_writable,
            CharityVaultError::InvalidRefundAccounts
        );
        require_keys_eq!(
            *ledger_info.owner,
            crate::ID,
            CharityVaultError::InvalidRefundAccounts
        );
        require!(
            recipient_info.is_writable,
            CharityVaultError::InvalidRefundAccounts
        );
        let mut ledger: Account<DonorLedgerAccount> = Account::try_from(ledger_info)?;
        require_keys_eq!(
            ledger.campaign,
            campaign.key(),
            CharityVaultError::InvalidRefundAccounts
        );
        require_keys_eq!(
            ledger.donor,
            donor,
            CharityVaultError::InvalidRefundAccounts
        );
        if ledger.claimed {
            continue;
        }
        let amount = ledger.amount;
        require!(
            vault.lamports() >= amount,
            CharityVaultError::InsufficientVaultBalance
        );
        ledger.claimed = true;
        ledger.exit(&crate::ID)?;
        let vault_balance = vault.lamports();
        **vault.try_borrow_mut_lamports()? = vault_balance
            .checked_sub(amount)
            .ok_or(CharityVaultError::InsufficientVaultBalance)?;
        let recipient_balance = recipient_info.lamports();
        **recipient_info.try_borrow_mut_lamports()? = recipient_balance
            .checked_add(amount)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
        emit!(RefundIssued {
            campaign: campaign.key(),
            donor,
            amount
        });
    }

    // Sweep the vault's rent reserve to the caller so no lamports are stranded.
    let residual = vault.lamports();
    if residual > 0 {
        **vault.try_borrow_mut_lamports()? = 0;
        let caller_balance = ctx.accounts.caller.lamports();
        **ctx
            .accounts
            .caller
            .to_account_info()
            .try_borrow_mut_lamports()? = caller_balance
            .checked_add(residual)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }
    Ok(())
}
