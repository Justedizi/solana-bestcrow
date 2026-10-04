# bestcrow program (target MVP — Phase 1)

New Anchor program implementing the target startup-staged MVP from
[docs/IMPLEMENTATION_PLAN.md](../../docs/IMPLEMENTATION_PLAN.md), phases 0-1.
The legacy `programs/charity-vault/` is retained as reference and is not the
target.

Program ID (devnet, not yet deployed): `3jGgPRa4gH25wfL49E3TAtpix5ePUZKWrQLT83eNZBVr`.

## Implemented (Phase 1)

- `create_draft` — campaign in `Draft`; no funds, pledges rejected.
- `add_tranche` — 2–5 tranches, each share ≤ 50%.
- `seal_terms` — atomic validation (shares sum to 10000 bps, funding window
  7–183 days), funds the 0.1 SOL bond, opens `Funding`.
- `pledge` — **no goal cap** (overfunding allowed).
- `cancel_pledge` — full cancellation only while funding is open.
- `finalize_funding` — freezes `raised`; 1% fee once on success; reserves each
  tranche amount from `distributable` (rounding remainder in the last tranche);
  marks `Failed` (no fee) otherwise.
- `refund_for` — permissionless 100% refund to the registered backer.
- `claim_bond` — returns the bond after `Failed` or `Completed`.
- `close_backer` — closes a finished backer ledger, rent back to the backer.

## Not yet implemented (Phase 2)

Voting windows, `finalize_vote`, `release_tranche`/withdraw, and `terminate`.
See the plan's section 2. Do not present this as the final protocol until
those land and adversarial tests pass.

## Build

```bash
cd rust
NO_DNA=1 anchor build --no-idl -- --arch v0
NO_DNA=1 cargo check --workspace
```
