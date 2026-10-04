# Bestcrow

**Startup/prototype crowdfunding on Solana where funds release by rule, not by an
operator.** Backers fund a campaign in SOL; the creator gets a starting tranche;
every later tranche depends on contribution-weighted votes.

Built for **HackYeah 2026 · Superteam Poland — "Finance Without Intermediaries."**

> **Read this first.** This README separates what is **target** (the agreed MVP),
> what is **implemented** (code present), and what is **verified** (tests/builds).
> The canonical protocol is [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md);
> current-direction decisions are in [docs/DECISIONS.md](docs/DECISIONS.md); the
> governing requirements are the PDFs in [docs/](docs/).

## Where the intermediary disappears

A traditional crowdfunding platform holds the money, charges a fee, decides who
qualifies, and — after a target is met — usually pays the creator the whole
balance with no further accountability. Bestcrow moves custody and settlement
into a Solana program: funds sit in a program-owned vault, releases follow the
tranche schedule and backer votes fixed before the first pledge, and if the
campaign stops, backers reclaim the remaining pool pro-rata.

**Target users:** early-stage startup/prototype teams raising in milestones and
the backers who fund them. Reward/grant-based funding — not equity or an
investment return.

## Target MVP (proposed — not yet implemented)

- **One campaign type:** startup staged campaign in SOL. Draft, then lock goal,
  7–183 day window, and a **2–5 tranche** schedule (each ≤50%, total 100%)
  before the first pledge.
- **Overfunding allowed.** No 12-donor cap. Contributions may exceed the goal.
- **On success:** a fixed **1% of the final raised amount** is charged once to a
  disclosed treasury; tranche percentages apply to the remaining 99%.
- **On failure:** no fee; each backer may claim **100%** of their own pledge.
- **0.1 SOL creator deposit**, separate from pledges.
- **Voting:** after evidence, a **7-day** window; approval is **yes weight
  strictly > 50% of all final contributions**. First failure → 30-day revision →
  second 7-day vote. Second failure → termination and pro-rata refunds.
- **Anyone** may submit an eligible finalization/settlement transaction; only the
  program's fixed rules choose recipients and amounts.

Full rules, open decisions, and the ordered task list (P0–P5):
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). The old charity /
5-milestone / 70% / no-fee / `refund_all` model is **legacy** (see
[docs/archive/](docs/archive/)) and is not the MVP.

## Repository state (what is implemented)

| Area | State |
| --- | --- |
| `rust/` — Anchor program `charity_vault`, 18 instructions (base all-or-nothing + staged), 6 account types + vault/bond PDAs | **Implemented.** `cargo test` passes (6 flow tests). Program ID `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`. |
| `frontend/` — Next.js 16 + `@solana/kit`: discover, create, campaign detail, milestone/vote UI, wallet (Phantom) signing | **Implemented.** typecheck, production build, and 22 unit tests pass. |
| `backend/` — Node/Express indexer + REST API (SQLite), instruction builders | **Implemented (chain only).** typecheck and 30 tests pass. Account/wallet/session system described in older docs is **not present**. |
| Devnet deployment of the latest build | **Not verified** from this checkout. The latest proxy build was previously deployed; re-confirm before relying on it. |
| Target MVP rules above | **Not implemented.** The deployed program still uses the legacy staged flow. |

The program is **not** safe for real funds before the P1/P2 fixes and adversarial
tests in the plan are done.

## Run it

```bash
# whole stack (web + API)
docker compose up --build          # http://localhost:3000  ·  http://localhost:4000/api/health
```

```bash
# program
cd rust
NO_DNA=1 anchor build --no-idl -- --arch v0     # --arch v0 required on this toolchain
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml
```

```bash
# frontend                          # backend
cd frontend                         cd backend
npm install                         npm install
npm run typecheck                   npm run typecheck
npm test                            npm test
```

## Repository map

```text
rust/       Anchor program, LiteSVM tests, program API docs (rust/docs/)
backend/    Indexer + REST API (chain sector)
frontend/   Next.js app + Solana client library
docs/       Competition PDFs, implementation plan, decisions, reference material
agents/     Product direction and agent/dev instructions
mcp/        Local dev + Solana documentation tooling
scripts/    Local/dev/deploy helpers
```

## Competition requirements

The [criteria PDF](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)
requires the trust-replacing logic in the **on-chain program** (not the backend),
at least one complete live journey, and honest disclosure of author powers
(upgrade authority, fee recipient). The [rules PDF](docs/RULES%20Finance%20Without%20Intermediaries.pdf)
governs submission and the code-freeze deadline. See
[agents/AGENTS.md](agents/AGENTS.md) for source precedence. Do not claim the
target protocol is done until it is tested, deployed, and demonstrated.
