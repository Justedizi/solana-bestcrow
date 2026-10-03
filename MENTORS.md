# Task Escrow — HackYeah 2026

*Finance Without Intermediaries — Superteam Poland*

---

## The Problem

Paying an unknown person for work requires a middleman.

When a client hires a freelancer they've never met, the money has to go through someone neither of them trusts:

- **Platform (Upwork, Useme)** — takes 4–6%, holds funds, can freeze or reverse payouts, requires registration and identity
- **Direct transfer (bank, PayPal)** — sender must trust receiver pays; no reversal, no proof
- **Informal promise** — zero protection on either side

Who profits: the intermediary. Who pays: both parties — in fees and in risk.

---

## Our Solution

Task Escrow — a Solana program that holds the payment and enforces the rules, so no party and no operator ever controls the funds.

```text
┌────────────┐        ┌──────────────────┐        ┌────────────┐
│   CLIENT   │ locks  │  TASK ACCOUNT    │ reads  │   WORKER   │
│            │──────▶ │  (Program PDA)   │ ◀──────│            │
│ funds once │        └────────┬─────────┘        │            │
└─────┬──────┘                 │                  │            │
      │                        │                  └──────┬─────┘
      │                        │                         │
      ▼                        │                         ▼
   creates task                │                    submits work
   (0.01 SOL)                  │                   (hash on-chain)
                               ▼
                     release → worker
          or refund → client after deadline
```

**Key properties (all enforced by the program):**

- The client locks an exact SOL amount for one specific worker before work starts
- Only that worker can submit before the deadline (signature-gated)
- After submission, only the client releases the funds — irreversible
- After the deadline, only the client refunds — refunds are the developer's out, since the client has the authority to withdraw
- Amount, worker address, deadline, brief-hash — all immutable once the task is created

---

## The Intermediary Disappears Here

This line of code is the moment the middleman becomes unnecessary:

```rust
// The task account is a PDA — derived from seeds + program ID.
// No private key exists. Only the program can sign a CPI to move the funds.
let task = &mut ctx.accounts.task;
```

- Neither party holds the money — the program does
- Neither party can change the rules — they're fixed at compile time + `declare_id!`
- The client doesn't need to trust the worker — deposit is provable on Explorer before work starts
- The worker doesn't need to trust the client — the locked amount is public on-chain

Show this on Explorer: one `create_task` transaction with the SOL visibly transferred into the task PDA — that is the intermediary disappearing.

---

## Target User

Freelancers invoicing foreign clients who want payment locked before work begins. Small-grain tasks: single reviewable deliverable, one deadline.

Deliberate choices:

- **SOL, not USDC** — avoids the token/mint setup; keeps devnet honest and demo-ready
- **Grainy, single deliverable** — matches how real small jobs work (a logo, an article, a config fix)
- **Public description via URL; only a SHA-256 hash on-chain** — the work product travels off-chain, the commitment stays verifiable

---

## Why Solana (and not a database)

| | Solana program | Regular database |
| --- | --- | --- |
| Rules | Program code + network validation | Opaque, editable by operator |
| Control | Nobody holds a key to funds | Operator owns the DB server |
| Cost | ~$0.0003 per transfer | Platform fee 4–6% + reversal risk |
| Trust | Public ledger, verifiable | Trust the operator's response |
| After some dispute | Rules can't be changed post-deploy | One admin click reverses the payment |

---

## What We Did Deliberately NOT Build

- **Arbitration / dispute path** — adds a third trusted party + dispute state machine; needed for real adoption, but not MVP scope
- **USDC / Token-2022** — adds mint/CPI plumbing; the trust guarantee is token-agnostic
- **Milestones (partial payouts)** — elegantly solves the "client won't pay for subjective quality" boundary; would need dispute rules
- **Rent reclaim on close** — deposit-only MVP leaves the task account alive; adding close = one more state transition to verify

This is where the honest trust boundary sits: the program guarantees deposit, roles, deadline, submission hash, and the transfer itself. It cannot evaluate whether the delivered work is good. The client still judges quality — that's the product boundary, and we say this plainly in the demo and pitch.

---

## Demo Plan (3 minutes, live)

1. **Problem framing** (20 s) — two browser profiles: client + worker, two wallets, different addresses
2. **Deposit** (40 s) — client creates a 0.01 SOL task for the worker's address with 15-min deadline → Explorer link opens
3. **Submission** (40 s) — worker opens the share link in his profile, submits deliverable hash → status Submitted
4. **Release** (40 s) — client clicks Approve & release → Explorer link of Released tx; status flips
5. **Refund** (25 s) — second (pre-created) task with 1-min deadline → expired → client clicks Refund
6. **Honest boundary** (15 s) — "The program guarantees deposit and rules — but quality is the client's call. Arbitration is the next step."

**Plan-B (if the Wi-Fi drops):** pre-loaded recording of the same flow + Explorer links to real, previously recorded devnet transactions.

---

## Stack

| Area | Technology | Notes |
| --- | --- | --- |
| On-chain | Rust + Anchor 1.x | 4 instructions, program-controlled PDA, LiteSVM unit tests |
| Client | Next.js 26 + Codama client | wallet-standard connect (Phantom / Solflare), cluster switcher, @solana/kit 6.3 |
| Repo | Public GitHub | program + tests + frontend, CI build; README as submission source-of-truth |
| Deploy | Devnet | test SOL via faucet; no real funds |

---

## What's Next (if we had another week)

1. **Milestones** — split the payment into partial payouts tied to accepted deliverables; elegantly solves the quality-verification boundary
2. **Arbitration module** — third verdict path when the client refuses to release; staked arbitrator or small panel
3. **USDC / Token-2022 support** — real-world settlement currency; the escrow pattern is token-agnostic
4. **Marketplace integration** — Task Escrow as the settlement primitive an OLX-style listings site could plug in; the same happy-path escrow we shipped, positioned as infrastructure
5. **Rent reclaim + account close** — return SOL to the client when a task finishes cleanly

---

## Judging Criteria — how we map onto them

| Criterion | Weight | Our answer |
| --- | --- | --- |
| Relevance | 30% | Payment-to-unknown-freelancer is the cleanest possible intermediary-removal case; the program enforces deposit, role, deadline, release/refund |
| Completeness & functionality | 25% | Full payout + refund path works live on Devnet with two wallets; every tx verifiable on Explorer |
| Idea & choice of problem | 20% | Deliberately narrow scope (one deliverable, one deadline) chosen for honest assessment of trust limits |
| Implementation potential | 15% | Anchor + LiteSVM tests + clean Codama client; documented invariants, README-first architecture |
| Originality | 10% | Not chasing novelty on a 24h clock — the value is in the honest trust-boundary framing, not feature novelty |

---

## Links

- **Repo:** [github.com/Justedizi/solana-escrow](https://github.com/Justedizi/solana-escrow) (HackYeah 26/ folder)
- **Program ID (devnet):** TBD after deploy — printed in submission.md
- **Demo video:** TBD — 3-min backup recording
- **Live demo:** http://localhost:3000 — two-wallet flow, available during presentation
