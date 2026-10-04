# Charity Vault — Rust Program Reference

**One-liner:** an on-chain treasury for charity campaigns. Money sits in a program-owned
vault and can only move along the rules fixed when the campaign was created.

- **Program ID (devnet):** `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`
- **Framework:** Anchor 1.1.2 · Rust
- **Source:** `rust/programs/charity-vault/src/`

There are **two campaign modes**:

1. **Simple (all-or-nothing)** — goal + deadline. Goal met → creator sweeps the vault.
   Goal missed → every donor refunded, all in one transaction.
2. **Staged** — goal + deadline + milestones. Backers vote on milestones; funds release
   in tranches, optionally streamed over time, with a creator bond and a termination path.

Read §1 (mental model), then jump to the instruction you need in §3.

---

## 1. Mental model in 60 seconds

```
creator ──create──▶ Campaign ──pledge◀── donors ──▶ Vault (holds SOL)
                       │
      after deadline   ▼
   finalize() ──▶ Succeeded ──▶ claim_success / release_*   (creator gets paid)
              └─▶ Refunded  ──▶ claim_refund / refund_all   (donors made whole)
```

- **Nobody custodies funds.** The vault is a PDA owned by the program. No human can
  withdraw outside these instructions.
- **Rules are fixed at creation.** Goal, deadline, budget and split never change.
- **`finalize` decides the outcome.** Anyone can call it after the deadline; it sets
  `Succeeded` or `Refunded` by comparing `raised` to `goal`.
- **Votes only ever release money, never create it.** Staged campaigns gate each tranche
  on backer approval, but the vault balance is still the hard ceiling.

---

## 2. Accounts (state)

Seeds use `[base, ...]`. All are PDAs under this program.

| Account | Seeds | Holds |
| --- | --- | --- |
| `CampaignAccount` | `campaign, creator, campaign_id` | goal, deadline, `desc_hash`, `raised`, status, donor list, staged fields |
| `DonorLedgerAccount` | `donor, campaign, donor` | one donor's `amount` + `claimed` flag |
| Vault | `vault, campaign` | the tracked SOL (lamports) |
| Bond vault | `bond, campaign` | creator bond (staged) |
| `MilestoneAccount` | `milestone, campaign, index` | one milestone's amount, status, vote weights |
| `VoteRecord` | `vote, milestone, round, backer` | a backer's single vote |
| `SplitAccount` | `split, campaign` | up to 5 recipients + shares (bps) |
| `ClaimAccount` | `claim, campaign, index` | a released tranche, possibly vesting |

**Enums**

- `CampaignStatus`: `Active` → `Succeeded` | `Refunded`
- `MilestoneStatus`: `Pending` → `Submitted` → (`Released` | `Revision` → … | `Rejected`)

**Key constants** (`constants.rs`): `MAX_DONORS = 12`, `MAX_MILESTONES = 5`,
`MAX_SPLIT_RECIPIENTS = 5`, `APPROVE_BPS = 7000` (70%), `MAX_MILESTONE_BPS = 5000` (50%).

---

## 3. Instructions (the whole API)

### Simple campaign

| Instruction | Signer | What it does |
| --- | --- | --- |
| `create_campaign(campaign_id, goal, deadline, desc_hash)` | creator | Creates campaign + vault. |
| `pledge(amount)` | donor | Moves SOL into the vault, writes the donor ledger. Rejects if past deadline or over goal. |
| `finalize()` | anyone | After deadline: `Succeeded` if `raised >= goal`, else `Refunded`. |
| `claim_success()` | creator | On `Succeeded`: sweeps the whole vault to the creator, once. |
| `claim_refund()` | donor | On `Refunded`: returns that donor's exact pledge, once; closes the ledger. |
| `refund_all()` | anyone | On `Refunded`: pays every registered donor in **one** transaction. |

### Staged campaign

| Instruction | Signer | What it does |
| --- | --- | --- |
| `create_staged_campaign(campaign_id, goal, deadline, desc_hash, base_budget, initial_tranche, bond)` | creator | Like `create_campaign` plus a budget, an initial tranche, and an optional bond. |
| `add_milestone(index, amount, deadline, evidence_hash)` | creator | Adds milestones in order (0,1,2…). Each ≤ 50% of budget; sum ≤ budget. |
| `submit_evidence(index, evidence_hash)` | creator | On `Succeeded`: marks a milestone `Submitted`, opening the vote. |
| `vote_milestone(index, approve)` | backer | A donor votes. Weight = their cumulative pledge. One vote per round. |
| `finalize_vote(index)` | anyone | Tally: ≥70% of `raised` → `Released`; else round 1 → `Revision`, round 2 → `Rejected`. |
| `release_initial()` | creator | On `Succeeded`: pays the initial tranche to the creator, once. |
| `set_split(recipients, shares_bps)` | creator | Optional: splits future withdrawals across up to 5 recipients (must sum to 10000 bps). |
| `release_tranche(index, duration)` | creator | On a `Released` milestone: mints a claim; `duration=0` pays instantly, else vests linearly. |
| `withdraw_claim(index)` | anyone | Pays vested amount to the creator (or the split recipients). Closes the claim when fully paid. |
| `terminate()` | creator **or** anyone after a rejection | Freezes the refund pool; a rejected milestone forfeits the creator bond into it. |
| `claim_termination_refund()` | donor | After termination: pays the donor's pro-rata share of `refund_pool`. |
| `claim_bond()` | creator | On `Succeeded`, not terminated, not forfeited: returns the bond. |

---

## 4. Flows

**Happy path (simple):**
`create_campaign` → `pledge`×n → `finalize` → `claim_success`

**Refund path (simple):**
`create_campaign` → `pledge`×n → `finalize` (missed) → `refund_all` (or each `claim_refund`)

**Staged success:**
`create_staged_campaign` → `add_milestone`×n → `pledge`×n → `finalize` →
`release_initial` → per milestone: `submit_evidence` → `vote_milestone`×n →
`finalize_vote` → `release_tranche` → `withdraw_claim`

**Staged failure:**
… a milestone is `Rejected` (fails its second vote) → `terminate` → each donor
`claim_termination_refund`.

---

## 5. Security invariants

- **Vault is program-owned.** Funds move by direct lamport moves inside the program;
  seeds are re-derived on every path, so a forged account fails.
- **Double-spend guards.** `claimed` (refund) and `campaign.paid` (initial) block repeats.
- **Outcome is program-decided.** `finalize` compares on-chain counters; callers can't pass
  in the result.
- **Fail-closed.** Wrong status, past deadline, over-goal pledges, bad PDA, and bad split
  all revert the whole transaction.
- **Votes can't exceed backing.** A milestone's total vote weight is capped at `campaign.raised`.

---

## 6. Errors

Custom codes in `error.rs`. Most common:

| Error | Meaning |
| --- | --- |
| `CampaignNotActive` | Campaign already finalized. |
| `DeadlinePassed` / `DeadlineNotPassed` | Time gate on the call. |
| `GoalOverflow` | Pledge would push `raised` above `goal`. |
| `AlreadyClaimed` | Double refund / double payout. |
| `InvalidMilestoneStatus` | Wrong step order for a milestone. |
| `MilestoneExceedsHalf` / `MilestoneSumExceedsBudget` | Budget rules. |
| `VoteWeightExceedsRaised` | Vote total above backing. |
| `CampaignTerminated` / `CampaignNotTerminated` | Termination-state gate. |
| `InsufficientVaultBalance` | Vault can't cover the transfer. |

---

## 7. Build & test

```bash
cd rust
cargo build-sbf --manifest-path programs/charity-vault/Cargo.toml --arch v0
cargo test    --manifest-path programs/charity-vault/Cargo.toml
```

> `--arch v0` is required on this toolchain (platform-tools target SBPFv3).
