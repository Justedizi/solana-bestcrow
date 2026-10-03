use anchor_lang::prelude::*;

use crate::constants::MAX_DONORS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CampaignStatus {
    Active,
    Succeeded,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignAccount {
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub deadline: i64,
    pub desc_hash: [u8; 32],
    pub raised: u64,
    pub paid: bool,
    pub status: CampaignStatus,
    pub donor_count: u8,
    pub donors: [Pubkey; MAX_DONORS],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DonorLedgerAccount {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
