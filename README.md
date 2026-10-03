# Bestcrow — milestone-gated crowdfunding on Solana

**Backers fund a campaign in stages and decide every release. No operator holds the
money, takes a cut, or decides who gets paid.**

Built for **HackYeah 2026 · Superteam Poland — “Finance Without Intermediaries.”**
Working repo name: `solana-bestcrow`; the web app is branded *Common Ground*.

> Crowdfunding today runs on a trusted operator: GoFundMe, Kickstarter, Zrzutka.pl,
> Siepomaga. The operator custodies the money, charges a fee, can freeze a campaign,
> and after a target is met typically pays the creator the whole balance — even if
> nothing is ever delivered. Bestcrow moves custody and settlement into a Solana
> program: funds sit in a program-owned vault, releases are unlocked only by the
> milestone rules and backer votes fixed at creation, and if a campaign stops, every
> backer can reclaim their share of what is left.

**Target user (named explicitly):** early-stage teams and small charities that raise
in milestones, and the backers/donors who fund them — people who today must trust a
platform to hold the money and to release it fairly. Not investors; funding is
reward/grant-based, not equity.

---

## The intermediary we remove

| Before (managed crowdfunding) | After (Bestcrow) |
| --- | --- |
| Platform custodies all pledges | Funds sit in a program-owned PDA vault |
| Platform decides releases and refunds | `goal`, `deadline`, milestone budgets, and vote rules are fixed at creation |
| Platform takes a fee, can freeze or reject | No operator account; only the encoded rules move money |
| Success pays the creator everything at once | Releases are milestone-gated; the rest stays in escrow |
| Refunds are discretionary | Permissionless termination + pro-rata refunds from a frozen pool |

**Why a blockchain and not a database?** Because here the trust is in a rule that
no one — not the creator, not the backers, not us — can rewrite. A database admin
can edit campaign state and still controls the payment rails; the program’s budgets,
vote outcomes, and vault permissions cannot be changed unilaterally. A backend can
read and display state, but it can never bypass settlement.

## How it works

1. **Define terms.** The creator commits a goal, a deadline, a base budget, an
   initial tranche, a creator bond, and a milestone schedule (each milestone stores
   an amount, a deadline, and an evidence hash). No single milestone may exceed 50%
   of the base budget; the schedule may not exceed it in total.
2. **Collect deposits.** Backers pledge SOL into the campaign vault; each backer gets
   an on-chain ledger entry that fixes their vote weight and refund entitlement.
3. **Finalize fundraising.** After the deadline anyone can finalize. If the goal is
   missed the campaign is `Refunded` and backers reclaim their exact pledge. If the
   goal is met it is `Succeeded` and the initial tranche unlocks.
4. **Deliver and prove.** The creator submits an evidence hash for the next
   milestone. Backers vote with weight equal to their contribution.
5. **Release, revise, or stop.** At least 70% approval releases the tranche. Below
   70% on the first vote opens a revision round; a second failure marks the milestone
   rejected and the campaign terminable. Termination freezes the remaining pool and
   each backer claims a pro-rata share; a rejected milestone forfeits the creator's bond
   into that pool.
6. **Pay out.** Released tranches are pull-based claims. A release can be split across
   up to five recipients by basis points, and can stream linearly over time so the
   creator is paid against progress rather than all at once.

```text
creator ── create_staged_campaign(goal, deadline, base_budget, initial_tranche, bond)
                 │
backers ── pledge(amount) ─────────────► vault (PDA) + DonorLedger (PDA, vote weight)
                 │
anyone  ── finalize()  ──► Succeeded | Refunded
                 │
   Succeeded ──► release_initial() ──► creator
                 │
creator ── submit_evidence(i, hash) ── backers ── vote_milestone(i, yes/no)
                 │
anyone  ── finalize_vote(i) ──► Released (>=70%) | Revision (round 2) | Rejected
                 │
creator ── release_tranche(i, duration) ──► claim (split / streamed) ── withdraw_claim
                 │
anyone  ── terminate()  ──► freeze pool ── backers ── claim_termination_refund()
creator ── claim_bond()  (when the campaign is not terminated)
```

### State model

- `CampaignStatus`: `Active → Succeeded | Refunded`.
- `MilestoneStatus`: `Pending → Submitted → Released | Revision → Rejected`.
- Independent `terminated` flag; a frozen `refund_pool` after termination.

### Instruction set (all enforced on-chain)

Base vault flow:

| Instruction | Signer | Effect |
| --- | --- | --- |
| `create_campaign` | creator | Create campaign + vault PDAs; fix goal, deadline, description hash |
| `pledge` | backer | Move SOL into the vault; create/update the donor ledger |
| `finalize` | anyone | After the deadline, set `Succeeded` or `Refunded` |
| `claim_success` | creator | Sweep the vault to the creator (only when `Succeeded`) |
| `claim_refund` | backer | Refund that backer’s exact pledge (only when `Refunded`) |
| `refund_all` | anyone | Repay every backer in one transaction and drain the vault |

Staged (Bundle A) flow:

| Instruction | Signer | Effect |
| --- | --- | --- |
| `create_staged_campaign` | creator | Goal, deadline, base budget, initial tranche, creator bond |
| `add_milestone` | creator | Add a milestone (`amount`, `deadline`, `evidence_hash`), enforcing the 50%/budget caps |
| `submit_evidence` | creator | Commit the evidence hash for a milestone and open voting |
| `vote_milestone` | backer | Contribution-weighted approve/reject, one vote per backer per round |
| `finalize_vote` | anyone | Apply the 70% threshold; release, revision round, or reject |
| `release_initial` | creator | Unlock the initial tranche after success |
| `set_split` | creator | Split a release across up to five recipients by bps |
| `release_tranche` | creator | Mint a claim for a released milestone, optionally streaming over time |
| `withdraw_claim` | anyone | Withdraw vested funds to the creator or the split recipients |
| `terminate` | anyone* | Freeze the remaining pool; forfeit the bond if a milestone was rejected |
| `claim_termination_refund` | backer | Pro-rata share of the frozen pool |
| `claim_bond` | creator | Reclaim the bond when the campaign is not terminated |

\* anyone once a milestone is rejected; otherwise the creator.

### Accounts

- `CampaignAccount` — `[b"campaign", creator, campaign_id]` (terms, raised, status,
  budget/tranche/released/bond accounting, donor registry).
- `DonorLedgerAccount` — `[b"donor", campaign, backer]` (amount, claimed flag).
- `Vault` / `BondVault` — `[b"vault", campaign]` / `[b"bond", campaign]` (program-owned).
- `MilestoneAccount` — `[b"milestone", campaign, index]`.
- `VoteRecord` — `[b"vote", milestone, round, backer]` (one vote per round).
- `SplitAccount` — `[b"split", campaign]` (recipients + basis points).
- `ClaimAccount` — `[b"claim", campaign, index]` (vesting schedule for a release).

## Trust boundary (what the program cannot do)

Bestcrow removes the operator’s custody and settlement discretion. It does **not**
judge whether a cause or product is worthy, verify anyone’s identity, prove that
evidence is truthful, or guarantee delivery. Backer votes measure approval, not
objective quality. Previously released tranches cannot be clawed back. The devnet
deploy wallet holds upgrade authority until it is made final, and that power is
disclosed rather than hidden. A real-money launch needs a legal/KYC layer and a
published dispute policy; this project demonstrates the financial mechanics, not
compliance.

## Originality and precedent

All-or-nothing crowdfunding (Kickstarter) protects backers only until the target is
met; after that the creator receives the whole balance. Bestcrow applies enforceable
rules *after* success and is honest that milestone crowdfunding is not new
(Pledgecamp and others are close precedents). What this implementation contributes:

- **Contribution-weighted backer approval with a revision round** and a permissionless
  termination path — no administrator decides.
- **Pro-rata refunds from a frozen pool**, with the creator’s **bond forfeited** on a
  rejected milestone (skin in the game).
- **Multi-payee splits and streamed releases**, so funds track progress instead of
  being handed over at once.
- A deterministic, tokenless conditional-vault design — no oracle, no token, no market.

---

## Repository layout

```text
rust/                         Anchor program + tests
  programs/charity-vault/     state, one module per instruction group, entrypoints
    tests/flow.rs             LiteSVM end-to-end tests (base + staged flows)
frontend/                     Next.js 16 app (@solana/kit, Wallet Standard)
  app/                        campaign list, create, detail, how-it-works
  app/lib/                    program client: PDAs, instructions, decoding, eligibility
  scripts/devnet-smoke.mjs    devnet end-to-end smoke test (prints explorer links)
backend/                      Node indexer + REST API (SQLite)
compose.yaml                  one-command demo stack (web + API)
docs/                         challenge PDFs and Solana reference material
EXECUTION_PLAN.md             design plan, rubric mapping, trust model
agents/                       project context and tooling notes
```

Stack: **Anchor 1.1.2 / Rust** on-chain, **Next.js 16 + `@solana/kit`** and Wallet
Standard on the client, a **Node/SQLite** indexer/API, **LiteSVM** for tests.

## Run it

### One command (Docker)

```bash
docker compose up --build
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/api/health

The web app talks to the Solana program directly; the indexer/API serves fast
listings and decoded events. Stop with `docker compose down`.

### Program

```bash
cd rust
NO_DNA=1 anchor build --no-idl -- --arch v0        # --arch v0 is required on this toolchain
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

### Frontend (without Docker)

```bash
cd frontend
npm install
cp .env.example .env.local        # devnet RPC + program id
npm run dev
```

### Deploy

```bash
cd rust
NO_DNA=1 anchor deploy --provider.cluster devnet -p charity-vault
node ../frontend/scripts/devnet-smoke.mjs   # create -> pledge -> finalize -> refund
```

## Verification status

| Piece | State |
| --- | --- |
| On-chain program (18 instructions, 6 account types + vault/bond PDAs) | Implemented; compiles to SBF |
| LiteSVM end-to-end tests | **Passing** — base refund/success/refund-all and staged approve/release/stream, revision/terminate/pro-rata, split |
| Frontend (list/create/detail, wallet, explorer links, eligibility) | Implemented; typecheck, unit tests, and production build pass |
| Indexer/API (SQLite, decoded events) | Implemented; typecheck and tests pass |
| One-command demo (`docker compose up --build`) | Both services build and run the base flow |
| Devnet deployment | Pending: a funded devnet wallet/RPC is required to deploy the latest build (program ID `74GsU9x…`); the code and tests are complete |

Program ID (intended devnet): `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`.

Upgrade authority and the team's own contribution are documented so judges can see
exactly where trust still lives.

## How this maps to the judging criteria

| Criterion (weight) | Evidence |
| --- | --- |
| Relevance to the challenge (30%) | A real intermediary — the crowdfunding operator’s custody, fee, and discretionary release — removed by a program-controlled vault, milestone rules, and backer votes enforced on-chain |
| Completeness and functionality (25%) | Full lifecycle create → pledge → finalize → milestone vote → release → terminate → pro-rata refund, exercised by passing on-chain tests and a wired UI |
| Idea and choice of problem (20%) | An explicitly named user, a concrete pain, and an honest statement of what the chain can and cannot prove |
| Implementation potential (15%) | Modular Anchor program with fixed-size state, bounded accounts, typed client, indexer, and tests |
| Originality (10%) | Contribution-weighted approval with revision and permissionless termination, creator bond, splits and streaming — a deterministic tokenless conditional vault |

## The questions we expect, answered

- **Where exactly does the intermediary disappear?** In the vault and the rules:
  funds are held by a program-owned PDA, and only `release_initial`,
  `release_tranche` (after a successful `finalize_vote`), `claim_refund`, or
  `claim_termination_refund` can move them. No backend or admin can redirect escrow.
- **What if a party disappears?** A missed goal is refundable by anyone; an accepted
  tranche can be released and withdrawn later; a rejected milestone lets anyone
  terminate and every backer claim their pro-rata share without the creator.
- **Who has permissions?** The creator submits evidence and releases within the rules;
  backers vote with their own weight; anyone can finalize and terminate; the deploy
  wallet holds upgrade authority until final.
- **Why blockchain and not a database?** The rule, not an operator, is the source of
  truth; a database admin could edit state and control payouts.

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the full trust model and the challenge
PDFs under [docs/](docs/) for the authoritative requirements.
