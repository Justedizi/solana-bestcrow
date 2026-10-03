//! Read-only ABI for MetaDAO futarchy v0.6.1 (source revision a8ca9f1d34ee8b135bf8fffe5ba7e8aa4cb10c9f).
//! Settlement is performed by MetaDAO; this program only verifies its finalized result.

use crate::error::BestcrowError;
use anchor_lang::prelude::*;

declare_id!("FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq");

const PROPOSAL_DISCRIMINATOR: [u8; 8] = [26, 94, 189, 187, 116, 136, 53, 33];
const DAO_DISCRIMINATOR: [u8; 8] = [163, 9, 47, 31, 52, 85, 197, 49];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProposalState {
    Draft { amount_staked: u64 },
    Pending,
    Passed,
    Failed,
    Removed,
}

#[allow(dead_code)]
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct Proposal {
    pub number: u32,
    pub proposer: Pubkey,
    pub timestamp_enqueued: i64,
    pub state: ProposalState,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub dao: Pubkey,
    pub pda_bump: u8,
    pub question: Pubkey,
    pub duration_in_seconds: u32,
    pub squads_proposal: Pubkey,
    pub pass_base_mint: Pubkey,
    pub pass_quote_mint: Pubkey,
    pub fail_base_mint: Pubkey,
    pub fail_quote_mint: Pubkey,
    pub is_team_sponsored: bool,
}

#[allow(dead_code)]
#[derive(AnchorDeserialize)]
struct TwapOracle {
    aggregator: u128,
    last_updated_timestamp: i64,
    created_at_timestamp: i64,
    last_price: u128,
    last_observation: u128,
    max_observation_change_per_update: u128,
    initial_observation: u128,
    start_delay_seconds: u32,
}

#[allow(dead_code)]
#[derive(AnchorDeserialize)]
struct Pool {
    oracle: TwapOracle,
    quote_reserves: u64,
    base_reserves: u64,
    quote_protocol_fee_balance: u64,
    base_protocol_fee_balance: u64,
}

#[allow(dead_code)]
#[derive(AnchorDeserialize)]
enum PoolState {
    Spot { spot: Pool },
    Futarchy { spot: Pool, pass: Pool, fail: Pool },
}

#[allow(dead_code)]
#[derive(AnchorDeserialize)]
struct Amm {
    state: PoolState,
    total_liquidity: u128,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    amm_base_vault: Pubkey,
    amm_quote_vault: Pubkey,
}

#[allow(dead_code)]
#[derive(AnchorDeserialize)]
struct DaoPrefix {
    amm: Amm,
    nonce: u64,
    dao_creator: Pubkey,
    pda_bump: u8,
    squads_multisig: Pubkey,
    squads_multisig_vault: Pubkey,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    proposal_count: u32,
    pass_threshold_bps: u16,
    seconds_per_proposal: u32,
    twap_initial_observation: u128,
    twap_max_observation_change_per_update: u128,
    twap_start_delay_seconds: u32,
    min_quote_futarchic_liquidity: u64,
    min_base_futarchic_liquidity: u64,
}

fn checked_body<'a>(
    info: &'a AccountInfo,
    discriminator: [u8; 8],
) -> Result<std::cell::Ref<'a, [u8]>> {
    require_keys_eq!(*info.owner, ID, BestcrowError::InvalidMetaDaoAccount);
    let data = info.try_borrow_data()?;
    require!(
        data.len() >= 8 && data[..8] == discriminator,
        BestcrowError::InvalidMetaDaoAccount
    );
    Ok(std::cell::Ref::map(data, |bytes| &bytes[8..]))
}

pub fn read_proposal(info: &AccountInfo) -> Result<Proposal> {
    let body = checked_body(info, PROPOSAL_DISCRIMINATOR)?;
    Proposal::deserialize(&mut &body[..]).map_err(|_| error!(BestcrowError::InvalidMetaDaoAccount))
}

pub fn validate_proposal(
    info: &AccountInfo,
    expected_key: Pubkey,
    expected_proposer: Pubkey,
    expected_dao: Pubkey,
) -> Result<Proposal> {
    require_keys_eq!(
        info.key(),
        expected_key,
        BestcrowError::InvalidMarketBinding
    );
    let proposal = read_proposal(info)?;
    require_keys_eq!(
        proposal.proposer,
        expected_proposer,
        BestcrowError::InvalidMarketBinding
    );
    require_keys_eq!(
        proposal.dao,
        expected_dao,
        BestcrowError::InvalidMarketBinding
    );
    Ok(proposal)
}

pub fn validate_dao(
    info: &AccountInfo,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    market_timeout_secs: i64,
) -> Result<()> {
    let body = checked_body(info, DAO_DISCRIMINATOR)?;
    let dao = DaoPrefix::deserialize(&mut &body[..])
        .map_err(|_| error!(BestcrowError::InvalidMetaDaoAccount))?;
    require_keys_eq!(
        dao.base_mint,
        base_mint,
        BestcrowError::InvalidMarketBinding
    );
    require_keys_eq!(
        dao.quote_mint,
        quote_mint,
        BestcrowError::InvalidMarketBinding
    );
    require_keys_eq!(
        dao.amm.base_mint,
        base_mint,
        BestcrowError::InvalidMarketBinding
    );
    require_keys_eq!(
        dao.amm.quote_mint,
        quote_mint,
        BestcrowError::InvalidMarketBinding
    );
    require!(
        dao.seconds_per_proposal >= 86_400
            && (dao.seconds_per_proposal as i64) < market_timeout_secs,
        BestcrowError::InvalidMarketBinding
    );
    require!(
        dao.min_base_futarchic_liquidity > 0 && dao.min_quote_futarchic_liquidity > 0,
        BestcrowError::InvalidMarketBinding
    );
    let PoolState::Spot { spot } = dao.amm.state else {
        return err!(BestcrowError::InvalidMarketBinding);
    };
    require!(
        spot.base_reserves / 2 >= dao.min_base_futarchic_liquidity
            && spot.quote_reserves / 2 >= dao.min_quote_futarchic_liquidity,
        BestcrowError::InvalidMarketBinding
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposal_abi_decodes_final_states() {
        let proposal = Proposal {
            number: 1,
            proposer: Pubkey::new_unique(),
            timestamp_enqueued: 123,
            state: ProposalState::Passed,
            base_vault: Pubkey::new_unique(),
            quote_vault: Pubkey::new_unique(),
            dao: Pubkey::new_unique(),
            pda_bump: 1,
            question: Pubkey::new_unique(),
            duration_in_seconds: 86_400,
            squads_proposal: Pubkey::new_unique(),
            pass_base_mint: Pubkey::new_unique(),
            pass_quote_mint: Pubkey::new_unique(),
            fail_base_mint: Pubkey::new_unique(),
            fail_quote_mint: Pubkey::new_unique(),
            is_team_sponsored: false,
        };
        // The externally owned account starts with Anchor's discriminator.
        let mut data = PROPOSAL_DISCRIMINATOR.to_vec();
        proposal.serialize(&mut data).unwrap();
        let decoded = Proposal::deserialize(&mut &data[8..]).unwrap();
        assert_eq!(decoded.state, ProposalState::Passed);
        assert_eq!(decoded.dao, proposal.dao);
    }
}
