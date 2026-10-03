# Charity Vault

Modular Anchor program for the charity crowdfunding flow in `../EXECUTION_PLAN.md`.

## State machine

`Active -> Succeeded` when `finalize` is called after the deadline and the goal is met.
`Active -> Refunded` when `finalize` is called after the deadline and the goal is not met.

Funds are held in a program-owned vault PDA. The creator can claim only after
`Succeeded`; donors can claim only after `Refunded`. `refund_all` processes the
fixed donor registry (maximum 16 donors) in one transaction and validates every
ledger PDA before paying it.

## Layout

- `programs/charity-vault/src/state.rs`: account data, status, and fixed sizes.
- `programs/charity-vault/src/instructions/`: one file per instruction.
- `programs/charity-vault/src/lib.rs`: thin Anchor entrypoints and module exports.

## Build and test

From this directory:

```bash
NO_DNA=1 anchor build
NO_DNA=1 anchor test
```

The program uses SOL lamports for the MVP. The generated `target/idl` and
`target/types` files are the integration boundary for a web client.
