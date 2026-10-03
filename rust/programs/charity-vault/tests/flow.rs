//! End-to-end instruction tests against an in-process LiteSVM.
//!
//! Build the SBF binary first, then run:
//!   NO_DNA=1 anchor build --no-idl -- --arch v0
//!   NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml

use anchor_lang::prelude::Pubkey;
use litesvm::LiteSVM;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const CREATE_CAMPAIGN: [u8; 8] = [111, 131, 187, 98, 160, 193, 114, 244];
const PLEDGE: [u8; 8] = [235, 47, 156, 254, 0, 88, 212, 142];
const FINALIZE: [u8; 8] = [171, 61, 218, 56, 127, 115, 12, 217];
const CLAIM_SUCCESS: [u8; 8] = [253, 236, 33, 52, 70, 98, 143, 87];
const CLAIM_REFUND: [u8; 8] = [15, 16, 30, 161, 255, 228, 97, 60];
const REFUND_ALL: [u8; 8] = [174, 87, 222, 126, 23, 59, 189, 155];

const SOL: u64 = 1_000_000_000;
/// Rent-exempt reserve for a zero-data account (the account-overhead portion).
const RENT: u64 = 890_880;
/// Derived from the on-chain `MAX_DONORS` so a constant change can never silently
/// desync the test layout from the program (and the TS mirrors in backend/frontend).
const CAMPAIGN_SIZE: usize =
    8 + 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1 + charity_vault::constants::MAX_DONORS * 32 + 1;
const LEDGER_SIZE: usize = 8 + 32 + 32 + 8 + 1 + 1;

fn program_id() -> Address {
    Address::new_from_array(charity_vault::ID.to_bytes())
}

fn system_program() -> Address {
    Address::new_from_array(anchor_lang::system_program::ID.to_bytes())
}

fn setup() -> (LiteSVM, Address) {
    let program = program_id();
    let mut svm = LiteSVM::new();
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/charity_vault.so"
    );
    let bytes = std::fs::read(path).expect(
        "missing target/deploy/charity_vault.so — run: NO_DNA=1 anchor build --no-idl -- --arch v0",
    );
    svm.add_program(program, &bytes).expect("add program");
    (svm, program)
}

fn to_address(pubkey: Pubkey) -> Address {
    Address::new_from_array(pubkey.to_bytes())
}

fn campaign_pda(creator: &Address, id: u64) -> Address {
    to_address(
        Pubkey::find_program_address(
            &[b"campaign", creator.as_ref(), &id.to_le_bytes()],
            &charity_vault::ID,
        )
        .0,
    )
}

fn vault_pda(campaign: &Address) -> Address {
    to_address(Pubkey::find_program_address(&[b"vault", campaign.as_ref()], &charity_vault::ID).0)
}

fn ledger_pda(campaign: &Address, donor: &Address) -> Address {
    to_address(
        Pubkey::find_program_address(
            &[b"donor", campaign.as_ref(), donor.as_ref()],
            &charity_vault::ID,
        )
        .0,
    )
}

fn meta(address: Address, is_signer: bool, is_writable: bool) -> AccountMeta {
    AccountMeta {
        pubkey: address,
        is_signer,
        is_writable,
    }
}

fn instruction(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts,
        data,
    }
}

fn fund(svm: &mut LiteSVM, who: &Keypair) {
    svm.airdrop(&who.pubkey(), 10 * SOL).expect("airdrop");
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
        .expect("transaction should succeed");
}

/// Submit a transaction and report whether it succeeded, for negative-path tests.
fn send_ok(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> bool {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).is_ok()
}

fn campaign_data(svm: &LiteSVM, campaign: &Address) -> Vec<u8> {
    svm.get_account(campaign)
        .expect("campaign account exists")
        .data
        .clone()
}

fn u64_at(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
}

fn create_ix(creator: &Address, id: u64, goal: u64, deadline: i64) -> Instruction {
    let campaign = campaign_pda(creator, id);
    let vault = vault_pda(&campaign);
    let mut data = CREATE_CAMPAIGN.to_vec();
    data.extend_from_slice(&id.to_le_bytes());
    data.extend_from_slice(&goal.to_le_bytes());
    data.extend_from_slice(&deadline.to_le_bytes());
    data.extend_from_slice(&[7u8; 32]);
    instruction(
        vec![
            meta(*creator, true, true),
            meta(campaign, false, true),
            meta(vault, false, true),
            meta(system_program(), false, false),
        ],
        data,
    )
}

fn pledge_ix(donor: &Address, campaign: &Address, amount: u64) -> Instruction {
    let ledger = ledger_pda(campaign, donor);
    let vault = vault_pda(campaign);
    let mut data = PLEDGE.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    instruction(
        vec![
            meta(*donor, true, true),
            meta(*campaign, false, true),
            meta(ledger, false, true),
            meta(vault, false, true),
            meta(system_program(), false, false),
        ],
        data,
    )
}

#[test]
fn refund_flow_returns_exact_donations() {
    let (mut svm, _program) = setup();
    let creator = Keypair::new();
    let donor = Keypair::new();
    fund(&mut svm, &creator);
    fund(&mut svm, &donor);

    let id = 1;
    let goal = 5 * SOL;
    let now = svm.get_sysvar::<Clock>().unix_timestamp;
    let campaign = campaign_pda(&creator.pubkey(), id);

    send(
        &mut svm,
        &[create_ix(&creator.pubkey(), id, goal, now + 3_600)],
        &creator,
        &[],
    );
    assert_eq!(campaign_data(&svm, &campaign).len(), CAMPAIGN_SIZE);

    let vault = vault_pda(&campaign);
    let pledge = 2 * SOL;
    send(
        &mut svm,
        &[pledge_ix(&donor.pubkey(), &campaign, pledge)],
        &donor,
        &[],
    );
    assert_eq!(u64_at(&campaign_data(&svm, &campaign), 96), pledge);
    assert_eq!(
        svm.get_balance(&vault).unwrap(),
        pledge + RENT,
        "vault holds the pledge plus rent"
    );

    // Move time past the deadline and finalize; the goal is unmet, so it flips to Refunded.
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now + 7_200;
    svm.set_sysvar(&clock);
    let caller = Keypair::new();
    fund(&mut svm, &caller);
    send(
        &mut svm,
        &[instruction(
            vec![
                meta(caller.pubkey(), true, false),
                meta(campaign, false, true),
            ],
            FINALIZE.to_vec(),
        )],
        &caller,
        &[],
    );
    assert_eq!(
        campaign_data(&svm, &campaign)[105],
        2,
        "status should be Refunded"
    );

    // The donor claims their contribution back; the ledger is closed and its
    // rent returned to the donor in the same instruction.
    let ledger = ledger_pda(&campaign, &donor.pubkey());
    let ledger_rent = svm.get_balance(&ledger).unwrap();
    let before = svm.get_balance(&donor.pubkey()).unwrap();
    send(
        &mut svm,
        &[instruction(
            vec![
                meta(donor.pubkey(), true, true),
                meta(campaign, false, true),
                meta(ledger, false, true),
                meta(vault, false, true),
            ],
            CLAIM_REFUND.to_vec(),
        )],
        &donor,
        &[],
    );
    let after = svm.get_balance(&donor.pubkey()).unwrap();
    let expected = before + pledge + ledger_rent;
    assert!(
        after <= expected && after >= expected - 10_000,
        "donor refunded {after}, expected about {expected}"
    );
    assert_eq!(
        svm.get_balance(&vault).unwrap_or(0),
        RENT,
        "only rent reserve remains"
    );
    assert!(
        svm.get_account(&ledger).is_none(),
        "ledger should be closed after a refund"
    );

    // A second claim must fail.
    let tx = Transaction::new_signed_with_payer(
        &[instruction(
            vec![
                meta(donor.pubkey(), true, true),
                meta(campaign, false, true),
                meta(ledger, false, true),
                meta(vault, false, true),
            ],
            CLAIM_REFUND.to_vec(),
        )],
        Some(&donor.pubkey()),
        &[&donor],
        svm.latest_blockhash(),
    );
    assert!(
        svm.send_transaction(tx).is_err(),
        "double refund must revert"
    );
}

#[test]
fn success_flow_releases_to_creator_and_batch_refunds() {
    let (mut svm, _program) = setup();
    let creator = Keypair::new();
    let donors: Vec<Keypair> = (0..2).map(|_| Keypair::new()).collect();
    fund(&mut svm, &creator);
    for donor in &donors {
        fund(&mut svm, donor);
    }

    let id = 2;
    let goal = 2 * SOL;
    let now = svm.get_sysvar::<Clock>().unix_timestamp;

    // Campaign A: goal met -> creator claims.
    let campaign_a = campaign_pda(&creator.pubkey(), id);
    send(
        &mut svm,
        &[create_ix(&creator.pubkey(), id, goal, now + 3_600)],
        &creator,
        &[],
    );
    for donor in &donors {
        send(
            &mut svm,
            &[pledge_ix(&donor.pubkey(), &campaign_a, SOL)],
            donor,
            &[],
        );
    }
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now + 7_200;
    svm.set_sysvar(&clock);
    let caller = Keypair::new();
    fund(&mut svm, &caller);
    send(
        &mut svm,
        &[instruction(
            vec![
                meta(caller.pubkey(), true, false),
                meta(campaign_a, false, true),
            ],
            FINALIZE.to_vec(),
        )],
        &caller,
        &[],
    );
    assert_eq!(
        campaign_data(&svm, &campaign_a)[105],
        1,
        "status should be Succeeded"
    );

    let creator_before = svm.get_balance(&creator.pubkey()).unwrap();
    send(
        &mut svm,
        &[instruction(
            vec![
                meta(creator.pubkey(), true, true),
                meta(campaign_a, false, true),
                meta(vault_pda(&campaign_a), false, true),
            ],
            CLAIM_SUCCESS.to_vec(),
        )],
        &creator,
        &[],
    );
    let creator_after = svm.get_balance(&creator.pubkey()).unwrap();
    let expected = creator_before + goal + RENT;
    assert!(
        creator_after <= expected && creator_after >= expected - 10_000,
        "creator received {creator_after}, expected about {expected}"
    );
    assert_eq!(
        svm.get_balance(&vault_pda(&campaign_a)).unwrap_or(0),
        0,
        "success vault drained"
    );

    // Campaign B: goal missed -> refund_all pays every donor in one instruction.
    let campaign_b = campaign_pda(&creator.pubkey(), id + 1);
    let t1 = svm.get_sysvar::<Clock>().unix_timestamp;
    send(
        &mut svm,
        &[create_ix(&creator.pubkey(), id + 1, 5 * SOL, t1 + 3_600)],
        &creator,
        &[],
    );
    let mut balances = Vec::new();
    for donor in &donors {
        send(
            &mut svm,
            &[pledge_ix(&donor.pubkey(), &campaign_b, SOL)],
            donor,
            &[],
        );
        balances.push(svm.get_balance(&donor.pubkey()).unwrap());
    }
    clock.unix_timestamp = t1 + 7_200;
    svm.set_sysvar(&clock);
    send(
        &mut svm,
        &[instruction(
            vec![
                meta(caller.pubkey(), true, false),
                meta(campaign_b, false, true),
            ],
            FINALIZE.to_vec(),
        )],
        &caller,
        &[],
    );

    let ledger_rents: Vec<u64> = donors
        .iter()
        .map(|donor| {
            svm.get_balance(&ledger_pda(&campaign_b, &donor.pubkey()))
                .unwrap()
        })
        .collect();

    let mut accounts = vec![
        meta(caller.pubkey(), true, false),
        meta(campaign_b, false, true),
        meta(vault_pda(&campaign_b), false, true),
        meta(creator.pubkey(), false, true),
    ];
    for donor in &donors {
        accounts.push(meta(ledger_pda(&campaign_b, &donor.pubkey()), false, true));
        accounts.push(meta(donor.pubkey(), false, true));
    }
    send(
        &mut svm,
        &[instruction(accounts, REFUND_ALL.to_vec())],
        &caller,
        &[],
    );

    assert_eq!(
        svm.get_balance(&vault_pda(&campaign_b)).unwrap_or(0),
        0,
        "refund_all drained the vault"
    );
    for (index, donor) in donors.iter().enumerate() {
        assert_eq!(
            svm.get_balance(&donor.pubkey()).unwrap(),
            balances[index] + SOL + ledger_rents[index],
            "donor {index} should be made whole (pledge plus returned ledger rent)"
        );
    }
    assert_eq!(
        svm.get_account(&campaign_b).unwrap().data.len(),
        CAMPAIGN_SIZE
    );
    for donor in &donors {
        assert!(
            svm.get_account(&ledger_pda(&campaign_b, &donor.pubkey()))
                .is_none(),
            "refund_all should close each donor ledger"
        );
    }
}

#[test]
fn rejects_invalid_terms_and_out_of_window_calls() {
    let (mut svm, _program) = setup();
    let creator = Keypair::new();
    let donor = Keypair::new();
    fund(&mut svm, &creator);
    fund(&mut svm, &donor);
    let now = svm.get_sysvar::<Clock>().unix_timestamp;

    // create_campaign: goal must be positive and the deadline must be in the future.
    assert!(
        !send_ok(
            &mut svm,
            &[create_ix(&creator.pubkey(), 10, 0, now + 3_600)],
            &creator,
            &[],
        ),
        "zero goal must be rejected"
    );
    assert!(
        !send_ok(
            &mut svm,
            &[create_ix(&creator.pubkey(), 10, SOL, now - 1)],
            &creator,
            &[],
        ),
        "a past deadline must be rejected"
    );

    let id = 11;
    let campaign = campaign_pda(&creator.pubkey(), id);
    send(
        &mut svm,
        &[create_ix(&creator.pubkey(), id, 5 * SOL, now + 3_600)],
        &creator,
        &[],
    );

    // finalize before the deadline must fail.
    assert!(
        !send_ok(
            &mut svm,
            &[instruction(
                vec![
                    meta(creator.pubkey(), true, false),
                    meta(campaign, false, true),
                ],
                FINALIZE.to_vec(),
            )],
            &creator,
            &[],
        ),
        "finalize before deadline must be rejected"
    );

    // claim_success before the campaign reaches Succeeded must fail.
    assert!(
        !send_ok(
            &mut svm,
            &[instruction(
                vec![
                    meta(creator.pubkey(), true, true),
                    meta(campaign, false, true),
                    meta(vault_pda(&campaign), false, true),
                ],
                CLAIM_SUCCESS.to_vec(),
            )],
            &creator,
            &[],
        ),
        "claim_success on an active campaign must be rejected"
    );

    // A pledge inside the window succeeds.
    send(
        &mut svm,
        &[pledge_ix(&donor.pubkey(), &campaign, SOL)],
        &donor,
        &[],
    );

    // Once the deadline passes, further pledges must fail.
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now + 7_200;
    svm.set_sysvar(&clock);
    assert!(
        !send_ok(
            &mut svm,
            &[pledge_ix(&donor.pubkey(), &campaign, SOL)],
            &donor,
            &[],
        ),
        "pledge after the deadline must be rejected"
    );
}
