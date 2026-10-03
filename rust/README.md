# Charity Vault

Modular Anchor program for the charity crowdfunding flow in `../EXECUTION_PLAN.md`.

## State machine

`Active -> Succeeded` when `finalize` is called after the deadline and the goal is met.
`Active -> Refunded` when `finalize` is called after the deadline and the goal is not met.

Funds are held in a program-owned vault PDA. The creator can claim only after
`Succeeded`; donors can claim only after `Refunded`. `refund_all` processes the
fixed donor registry (maximum 16 donors) in one transaction and validates every
ledger PDA before paying it.

`claim_success` and `refund_all` sweep the vault's rent reserve back to the
creator/caller so no lamports are stranded; an individual `claim_refund` returns
the donor's exact pledge and leaves only the small rent reserve.

## Layout

- `programs/charity-vault/src/state.rs`: account data, status, and fixed sizes.
- `programs/charity-vault/src/instructions/`: one file per instruction.
- `programs/charity-vault/src/lib.rs`: thin Anchor entrypoints and module exports.
- `programs/charity-vault/tests/flow.rs`: LiteSVM end-to-end tests.

## Build and test

From this directory:

```bash
# 1. Build the SBF program (the tests load target/deploy/charity_vault.so).
NO_DNA=1 anchor build --no-idl -- --arch v0

# 2. Run the LiteSVM integration tests (create/pledge/finalize/claim/refund_all).
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml

# Optional: regenerate the IDL and TypeScript types for the web client.
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

`anchor build` without `--arch v0` fails on this toolchain because the installed
platform-tools (v1.57) target SBPFv3 while the default build arch is v3; the
`--arch v0` flag selects the compatible target.

The program uses SOL lamports for the MVP. The generated `target/idl` and
`target/types` files are the integration boundary for a web client.
