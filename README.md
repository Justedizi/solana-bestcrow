# Common Ground — Charity Vault

**Charity crowdfunding on Solana where the operator never holds the money.**

Built for **HackYeah 2026 · Superteam Poland — “Finance Without Intermediaries.”**
Working repo name: `solana-bestcrow`.

A charity commits to a goal and a deadline. Donors pledge straight into a
program-controlled vault. After the deadline, anyone can finalize: if the goal is
met the charity claims the funds; if it is missed, **every donor is refunded their
exact contribution — up to all of them in a single transaction.** No platform
custody, no fee, no discretionary freeze.

The intermediary that disappears is the fundraising operator (Zrzutka.pl,
GoFundMe, Siepomaga): the party that used to hold the money, charge a cut, and
decide whether a campaign “qualifies.”

---

## Where the intermediary disappears

| Before (managed crowdfunding) | After (Charity Vault) |
| --- | --- |
| Operator custodies pledges | Funds sit in a PDA vault owned by the program |
| Operator decides release/refund | `goal`, `deadline`, and refund rules are fixed at creation |
| Operator takes a fee, can freeze | No operator account; only the encoded rules move money |
| Refunds are manual | `finalize` → `claim_refund` / one-tx `refund_all` |

**Why blockchain and not a database?** Because here the trust is in a rule that
neither party can edit — not in an operator who can. A database admin can rewrite
order status; the program’s `goal`, `deadline`, and vault permissions cannot be
changed by anyone, including us.

## Honest limits

The program does **not** judge whether a cause is worthy, verify a charity’s
identity, or guarantee delivery after a successful campaign. It removes custody
and settlement discretion; the moral and legal risk of the cause stays with the
parties. Real deployment would need a legal/KYC layer — this demo shows the
financial mechanics, not compliance.

---

## How it works

```text
                 create_campaign(goal, deadline, desc_hash)
   charity ───────────────────────────────────────────────►  CampaignAccount (PDA)
                                                              vault (PDA)

                 pledge(amount)                                  │
   donor   ───────────────────────────────────────────────►  vault += amount
                                                              DonorLedger (PDA)

                 finalize()   (anyone, after deadline)
   anyone  ───────────────────────────────────────────────►  status =
                                                               Succeeded if raised >= goal
                                                               Refunded  otherwise
                 ┌── Succeeded ──► claim_success (charity) ──► vault swept to charity
                 └── Refunded  ──► claim_refund (donor)
                                   refund_all (anyone)    ──► every donor repaid in 1 tx
```

### State machine

`Active → Succeeded` (goal met at deadline) · `Active → Refunded` (goal missed).

### Instruction set

| Instruction | Signer | Effect |
| --- | --- | --- |
| `create_campaign` | charity | Create campaign + vault PDAs; fixes goal, deadline, description hash |
| `pledge` | donor | Move SOL into the vault; create/update the donor ledger |
| `finalize` | anyone | After the deadline, set `Succeeded` or `Refunded` |
| `claim_success` | charity | Sweep the vault to the charity (only when `Succeeded`) |
| `claim_refund` | donor | Refund that donor’s exact pledge (only when `Refunded`) |
| `refund_all` | anyone | Repay every donor in one transaction and drain the vault |

### Accounts

- `CampaignAccount` — seeds `[b"campaign", creator, campaign_id]`
  (creator, goal, deadline, description hash, raised, status, donor registry ≤ 16).
- `DonorLedgerAccount` — seeds `[b"donor", campaign, donor]`
  (cumulative amount, `claimed` flag).
- **Vault** — seeds `[b"vault", campaign]`, program-owned lamport treasury.

---

## Repository layout

```text
rust/                         Anchor program + tests
  programs/charity-vault/     state, one file per instruction, entrypoints
    tests/flow.rs             LiteSVM end-to-end tests (refund + success + refund_all)
frontend/                     Next.js 16 app (@solana/kit, Wallet Standard)
  app/                        list, create, detail, how-it-works
  app/lib/                    program client: PDAs, instruction builders, decoding
docs/                         challenge PDFs and Solana reference material
EXECUTION_PLAN.md             build plan, rubric mapping, trust model
agents/                       project context and tooling notes
```

Stack: **Anchor 1.1.2 / Rust** on-chain, **Next.js 16 + `@solana/kit`** and
Wallet Standard on the client, **LiteSVM** for tests.

---

## Run it

### Program

```bash
cd rust
NO_DNA=1 anchor build --no-idl -- --arch v0        # --arch v0 is required on this toolchain
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local        # devnet RPC + program id
npm run dev
```

### Build & verification status

| Piece | State |
| --- | --- |
| Anchor program (6 instructions, 3 PDAs) | Implemented; compiles |
| LiteSVM tests (refund, success, batch `refund_all`) | Passing |
| Frontend (list/create/detail, wallet, explorer links) | Implemented; typecheck + production build pass |
| Devnet deployment | **Pending** — deploy plan ready; nothing deployed yet |

Program ID (devnet, not yet deployed): `F1EjmWkLJRSYqzwswQCDDADPE8mXNrgiX8AEq17PBdW3`.

---

## Rubric alignment

| Criterion (weight) | How this project answers it |
| --- | --- |
| Relevance (30%) | Real intermediary (fundraising operator custody + fee + freeze), removed by a program-controlled vault and automatic refunds |
| Completeness (25%) | Full flow create → pledge → finalize → claim/refund, exercised by passing on-chain tests; live UI wired to the program |
| Idea & problem fit (20%) | Named target user (small charities and their donors) with an honest trust boundary |
| Implementation potential (15%) | Clean modular Anchor program, fixed-size state, typed client, tests |
| Originality (10%) | Deterministic, tokenless conditional vault — the MetaDAO primitive with the market stripped out — plus one-tx batch refunds |

## Trust boundary (the questions judges ask)

- **Who can move funds?** Only the program, per the campaign’s fixed rules.
- **Party disappears mid-flow?** Unaccepted/unfunded campaigns refund; an
  unclaimed success can always be claimed; a missed goal can be refunded by
  anyone via `claim_refund` / `refund_all`.
- **Can the author change it?** On devnet the deploy wallet holds upgrade
  authority until set final; that power is disclosed, not hidden.
- **Why not a database?** See above — the rule, not an operator, is the source of truth.

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the full trust model and
[agents/](agents/) for context. Challenge requirements live in the PDFs under
[docs/](docs/).
