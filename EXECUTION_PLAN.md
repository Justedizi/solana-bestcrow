# Charity Crowdfunding on Solana — Complete Execution Plan

**Goal:** win the Finance Without Intermediaries track (11 300 PLN).
**Timeline:** code window Sat 23:00 → Sun 23:00, HackTribe submission, 10-slide PDF, 3-min video, live demo.
**What exists:** starter escrow program (256 lines, 4 instructions, tested) + Next.js frontend (610 lines) — we rename and extend, not rewrite.

---

## 1. The Pitch (this is your one-paragraph core)

> "Small charities can't fundraise without an operator. Zrzutka.pl, GoFundMe, Siepomaga — they all hold the money, charge 1.5–5%, and can freeze or reject a campaign. Donors trust the operator, not the charity. Our Solana program removes that intermediary: a charity encodes its goal and deadline at creation; every donation locks into a program-controlled vault; if the goal succeeds, funds release to the charity; if the deadline passes without the goal, every donor is refunded their exact amount, atomically, in one click — no claims, no operator, no fee. The program doesn't judge whether the charity is 'deserving' — that's encoded as public conditions anyone can read before they pledge.

**Target user (name them explicitly — 20% of score):**
"Small Polish charities and their donors, where the donor currently has to trust a fundraising operator to hold and forward their money."

---

## 2. On-chain program — account model

### Account 1: CampaignAccount

```text
seeds: [b"campaign", creator.key(), campaign_id_le]

creator:   Pubkey   (the charity's wallet)
goal:      u64      (lamports target; all-or-nothing)
deadline:  i64      (Unix ts, must be > now)
desc_hash: [u8; 32] (SHA-256 of public description)
raised:    u64      (progress; updated on pledge)
status:    CampaignStatus
bump:      u8

CampaignStatus: Active | Succeeded | Refunded
```

- init, payer = creator, fixed space (compute SPACE at compile-time; no variable-length fields → no Office-style LEN bugs from earlier lessons)
- The campaign_id is a simple incrementing u64 the creator supplies — lets one charity run multiple campaigns, same pattern the starter already uses for task_id

### Account 2: DonorLedgerAccount

```text
seeds: [b"donor", campaign.key(), donor.key()]

donor:   Pubkey
amount:  u64  (cumulative pledge by this donor to this campaign)
claimed: bool (prevents double-refund)
bump:    u8
```

- One record per (campaign, donor) pair, created lazily on the first pledge
- This is what lets refund_all iterate without an external indexer
- Fixed SPACE — borrow the starter's SPACE pattern from Task

### Account 3: TreasuryVault — the PDA-owned lamport account

```text
seeds: [b"vault", campaign.key()]
```

- The campaign PDA signs the CPI when funds leave (same pattern as the starter — invoke_signed with the campaign's bump)
- The starter already does this with the task PDA; just stop thinking of it as "task balance" and start thinking of it as "campaign vault"

### Account 4 (existing): USDC-style SOL handling

- For MVP: raw lamports (SOL) is fine. If you want USDC support, it's an optional follow-up — do not spend 24 h on token plumbing if the SOL version works.

---

## 3. Instruction set (7 instructions; 5 reuse the starter mechanically)

| # | Instruction | Signer | Effect |
| --- | --- | --- | --- |
| 1 | create_campaign | creator | creates campaign PDA + treasury vault |
| 2 | pledge | donor | transfer SOL into treasury, create/update DonorLedger |
| 3 | finalize | — anyone — | if now >= deadline: status = Succeeded if raised >= goal, else Refunded. This is the auto-refund trigger — no manual claim by either party |
| 4 | claim_success | creator | only valid if Succeeded; releases full treasury to creator |
| 5 | claim_refund | donor | only valid if Refunded, only once per donor (claimed = true) |
| 6 | refund_all | — anyone — | ⭐ the differentiator: one transaction that loops the donor ledger and repays everyone at once. Anchor CPI loop over donor ledger entries |
| 7 | extend_deadline | creator | optional; only before the deadline; prevents accidental gas-out |

The killer demo beat is #6. Nobody in your judge pool will demo "kill the goal → three wallets refunded in one tx."

---

## 4. The Trust Story (the "where exactly does the intermediary disappear" answer)

This answers the brief's required question directly. Memorize this — you'll be asked:

- **Before (managed crowdfunding):** the operator custodies the pledge, decides if the campaign "qualifies," charges a fee, and can freeze/reject it. Either party's protection is "trust the operator."
- **After (our program):** the terms are encoded — goal, deadline, refund logic — before any money moves. Once pledged, no party (including you, the developer) can change the amount, the deadline, or the refund rules. If the goal fails, the refund is automatic and proportional; the operator cannot selectively "review" and keep donors' money. If the operator disappeared tomorrow, the pledge never left the donor's control once the funding was finalized.

---

## 5. Trust boundary — the honest limit (this is a *strength*, say it plainly)

The program does NOT evaluate whether the charity is "worthy" or whether the project is real. That's the 20%-weighted idea/choice-of-problem bias and it's core honesty, not a flaw.

What it does guarantee:

1. Goal, deadline, and refund rules are immutable post-creation
2. No single party can move funds unilaterally — goal conditions drive it
3. Every donation and refund is public on-chain
4. The charity cannot grab funds before the deadline and dodge the goal

What it does not guarantee:

- The charity will deliver the promised work after a successful campaign (risk shifts to the donor)
- Identity of the charity wallet (legitimate-looking ≠ legitimate)
- Privacy of donor wallet addresses (Solana is fully transparent)

Pitch line for this: "The program removes the middleman's custody and fee, but not the charity's moral risk. Real production would need a legal layer and probably a KYC service — we're showing the financial mechanics, not the compliance."

---

## 6. UI — 4 screens, one polished loop

### `/` — campaign list

- All-wallet accessible; cluster switcher carried over from starter
- Show: title, goal, deadline, progress bar, status badge

### `/campaign/new` — create

- Wallet connect; form: goal (SOL), deadline (picker: 1h / 1d / 1w), description
- Public description text → hashed to [u8; 32] on submission; full text lives in the URL (public by design — no secrets)
- Toast with Explorer link

### `/campaign/[address]` — detail page

- Progress bar: raised / goal
- Countdown timer to the deadline (this is your live theater — big digit render, update every 500ms)
- Donor list (from DonorLedgerAccount lookups)
- Action buttons that change based on connected wallet:
  - Pledge — for anyone
  - Finalize (deadline passed) — callable by anyone, prominent button
  - Claim success (creator only, Succeeded) / Claim refund (donor only, Refunded)
  - Refund All — the hero button, shown when Refunded and more donors exist
- Every button fires toast + Explorer link

### `/how-it-works` — static explainer

- The account model, the state diagram, the intermediary-disappears map — this is the slide you hand judges the URL for during evaluation
- Publicly viewable in the repo too

---

## 7. Deliverables schedule (Sat 23:00 → Sun 23:00, reverse-ordered to the deadline)

| Window | Task | Output |
| --- | --- | --- |
| Sat 23:00–00:30 | Competition window opens. Environment check (node, anchor, solana CLI PATH fix). anchor build on the starter as-is. | working toolchain |
| Sun 00:30–03:00 | Rename task_escrow → campaign. Port create_task → create_campaign. Port pledge scaffold from submit_work. | 3 instructions live |
| Sun 03:00–05:00 | Add DonorLedgerAccount + pledge full logic + claim_refund. Get a real pledge → refund path in localnet. | core loop working |
| Sun 05:00–08:00 | Add finalize (anyone-callable) + refund_all (the differentiator). Anchor tests for each. | hero feature in |
| Sun 08:00–10:00 | Frontend: clone / list page shape, wire /campaign/new, /campaign/[address]. Two-wallet devnet config. | UI live on devnet |
| Sun 10:00–13:00 | Deploy the program to devnet. Real program ID. Pledge → finalize → refund_all path end-to-end on devnet, two browsers. | LIVE demo state |
| Sun 13:00–15:00 | Record 3-min backup video (same flow as live): problem → create → pledge → finalize → refund_all → boundary. Upload to YouTube/Drive unlisted, get link. | video link ready |
| Sun 15:00–17:00 | Rehearse live demo twice: two browsers, devnet, hotspot as plan B. Fix only demo-blocking bugs. | 2 rehearsals done |
| Sun 17:00–20:00 | Fill submission.md: title, team, member names, description, 10-slide PDF, repo link, program ID, explorer links (4-5 tx URLs), video link. Prepare deck. | HackTribe submission pack ready |
| Sun 20:00–22:00 | Upload to HackTribe. Verify all links resolve. Verify program ID matches deploy. Freeze code (any change after 23:00 = disqualified per rules.pdf §13). | submission submitted |
| Sun 22:00–23:00 | Buffer. No new features. Pitch rehearsal in the corridor if you have a free mentor. | calm close |

**Rule of the night:** if refund_all isn't shipped and tested by 05:00, demote it to slide-only. Ship the 5-instruction simple version; a working claim-refund loop + a working claim-success loop is enough to clear 50% Phase 1.

---

## 8. Which existing starter code you reuse line-for-line

You're not rebuilding from zero — the starter is already 60% of this program.

| Existing starter | Maps to | Change |
| --- | --- | --- |
| `create_task(task_id, worker, amount, deadline, brief_hash)` | `create_campaign(id, goal, deadline, desc_hash)` | rename, drop worker field, keep validation shape |
| `submit_work(submission_hash)` | `pledge()` | different logic — adds funds, not a hash; new DonorLedger PDA |
| `approve_and_release()` | `claim_success()` | same pattern; signer check shifts worker → creator |
| `refund_after_deadline()` | `finalize()` + `claim_refund()` + `refund_all()` | split into three instructions — biggest change, but the deadline logic is already there |
| `Task` struct + SPACE | `Campaign` struct + `DonorLedger` struct + SPACE | rename + add fields; same compile-time sizing pattern |
| `TaskStatus` enum | `CampaignStatus` | new variant names, same shape |
| Events (`TaskCreated` etc.) | `CampaignCreated`, `PledgeReceived`, `CampaignFinalized`, `RefundIssued` | same pattern, new names |
| `TaskError` enum | `CampaignError` | add `AlreadyClaimed`, `GoalNotMet`, `RefundLoopFailed` |

The 163-line test file ports similarly — most negative-path tests already cover the state machine; you just swap nouns and add double-pledge / double-refund / refund_all assertions.

---

## 9. Pitch deck (10 slides, because rubric weight is on narrative framing)

1. **Title + one-line:** "Task Escrow has become Charity Vault — crowdfunding where the operator disappears."
2. **Target user:** Small Polish charities + their donors. Explicit sentence.
3. **Pre-Solana:** how zrzutka/GoFundMe/Siepomaga operate today (custody, fees, freeze/reject) — one diagram, three painpoints.
4. **Intermediary removed:** the campaign program — goal, deadline, atomic refund — before any money moves.
5. **Account model:** Campaign PDA + DonorLedger PDA + TreasuryVault — one diagram.
6. **State machine:** Funded → InProgress → Succeeded / Refunded. All transitions are program-enforced.
7. **Live demo beats:** (screenshots) create → pledge ×3 → finalize → refund_all → boundary slide.
8. **Honest limitations:** the program doesn't judge charity worth, doesn't touch identity/KYC, doesn't anonymize donors, isn't audited. Say it loud.
9. **Roadmap:** USDC support, verified campaign attestations, ZK donor privacy (via Solana Confidential Transfers), reputation layer, marketplace integration.
10. **Contact + live links:** repo, program ID, explorer txs, video link, team.

---

## 10. Judging criteria — how this plan scores

| Criterion | Weight | How this plan hits it |
| --- | --- | --- |
| Relevance to the challenge | 30% | Real market (charity fundraising), real intermediary (operator custody + fee + freeze), real removal (program-controlled vault + automatic proportional refunds) — the exact "remove-trust" pattern the brief asks for |
| Completeness & functionality | 25% | Full live path (create → pledge ×3 → finalize → refund_all) works on devnet with two wallets; every step is verifiable on Explorer; the video exists as backup |
| Idea & choice of problem | 20% | Deliberately narrow (one campaign, one goal, one deadline) chosen for honest assessment of trust limits; the honest boundary is stated explicitly, as the brief instructs |
| Implementation potential | 15% | Anchor + LiteSVM tests + Codama client + clean repo layout; the account model extends to Token-2022 / multi-party milestones cleanly |
| Originality | 10% | Proportional atomic refund loop in one transaction is a genuinely uncommon demo beat; the domain (charity) removes the "yet another freelance escrow" fatigue |

---

## 11. What NOT to do (this kills teams in your judge pool every year)

- Don't rewrite to Pinocchio, Steel, or Token-2022. Framework migration is never a scoring win and is a pure time sink.
- Don't add a token, a DAO, or a rewards layer. The brief says the intermediary must be removed — a token zooms past scope.
- Don't chase anonymous/mixer territory. It's the regulatory TS that judges will spot and it undermines your Relevance story.
- Don't fake the donor wallet ↔ charity identity link. The honest answer is "this is a hackathon prototype; real adoption would need a legal + KYC layer." Judges reward awareness, not pretending.
- Don't skip the Explorer walkthrough. The brief says "the quickest way to prove something really happened is to show the transaction on-chain."
- Don't run npm run setup on a second machine without sharing the deploy keypair file. It generates a new keypair/discord ID — which means your devnet program ID no longer matches declare_id! and the demo fails slow.
- Don't demo on mainnet or real USDC. The brief says Devnet is enough; real funds mean audit pressure you don't have.

---

## 12. Resources you'll use on-site

- **Superteam booth** — first stop; get the devnet faucet SOL, ask about why-blockchain framing, and get a technical mentor to skim lib.rs for 3 minutes (exact ask in the MentorBrief.md already in your repo)
- **HackTribe** — the submission platform; verify your account works before Sat night
- **Official brief (the PDF you just gave me)** — sections 3, 5, 6, 8 are the immediate rubric and exact scoring weights
- **Templates** — templates/submission.md is your pre-formatted pack; fill in explorer links when the program is deployed
- **GitHub repo** — Justedizi/solana-escrow; keep it public for the duration of the evaluation (rules explicitly require this)

---

## 13. My workflow during the event (same contract as before)

- **Role 1 — Debug buddy:** paste the error, get a root-cause + concrete fix. Anchor 0.x vs 1.x API differences, PDA seeds, borrows, IDL/Codama issues.
- **Role 2 — Code reviewer:** I hold your fork at /tmp/escrow; I'll do a live git fetch upstream every hour, review real diffs, flag security regressions, and open hermes/<topic> PRs (one logical change per commit) for tests/docs tweaks.
- **Deliverables I can prep *tonight* (before 23:00):** the README skeleton, the 10-slide outline, the submission.md hard-coded fields, the MentorBrief.md (already pushed, eval-line ready), and the DonorLedger + refund_all Rust stubs for the program side.
- **On-site:** Explorer link verification, humanitarian "is this legal enough" sanity checks.

---

## 14. The acceptance path is a scoring *mechanism*, not paperwork

Every rubric column maps to a demonstrable property of the program — not a checklist you fill out:

| Criterion | Weight | What the judge needs to see, concretely |
| --- | --- | --- |
| Relevance | 30% | Two wallets, one charity campaign, one program. The "why blockchain not a database" answer is one sentence: "Because the trust here is in the rule, not the operator." |
| Completeness | 25% | A working create→pledge→finalize→refund_all loop live on Devnet with explorer links for all 4–5 transactions, real tx parse |
| Idea | 20% | The explicitly-named target user + the deliberately narrow scope |
| Implementation | 15% | Anchor + tests + a clean Codama client + a documented state machine |
| Originality | 10% | Proportional atomic refund-all is the demo beat nobody else will have |

<<<<<<< HEAD
If you want to win, the checklist runs itself — build the 5-instruction simple version, ship it live, and make refund_all the demo's climactic beat. That's the whole game.
<<<<<<< main

---

## 15. How refund conditions are verified (the trust model)

The refund path has exactly three conditions. All three are checked by the program, from data that lives in the ledger itself — no oracle, no human, no operator:

1. **Time** — `now >= deadline`. Read from the Clock sysvar (validator consensus). Nobody can fake it; users cannot set their own clock.
2. **Goal not met** — `raised < goal`. `raised` is a counter the program itself increments inside `pledge`, in the same atomic transaction that moves real lamports into the vault. Test invariant: `vault_lamports == raised + rent`. A lying counter would require lying lamports.
3. **Entitlement** — who gets how much back. Not taken from the caller's word: for every donor the program re-derives the DonorLedger PDA `[b"donor", campaign, donor]` and refuses any account whose seeds don't match. The refund destination and amount are read from *inside* the validated ledger record, never from instruction arguments. A forged or substituted entry fails seed derivation and the whole transaction reverts (fail-closed).

Plus the double-refund guard: `claimed` flips to true inside the same atomic transaction; a second attempt hits `AlreadyClaimed`. And on the way in: `pledge` requires `status == Active` and `now < deadline`, so there is no post-deadline sniping.

### The one real engineering gap: how does refund_all know the donor list?

PDA accounts cannot be enumerated on-chain. Two honest fixes; pick one:

- **A. Donor registry (recommended for the demo):** the campaign account carries `[Pubkey; 16] + count`, filled by `pledge`. Fixed SPACE, compile-time sized (~512 B for the keys). `refund_all` takes the list from the campaign itself → genuinely one-click. The cap is documented honestly: "max 16 donors per campaign" (16 was chosen because a legacy tx fits ~32 accounts — 16 donors + campaign + vault + program + caller stays comfortably inside).
- **B. Off-chain discovery:** an indexer (`getProgramAccounts` filtered by seeds prefix) builds the list off-chain; `refund_all` accepts up to ~6 donor accounts per tx and validates each exactly as in (3) above. Unlimited donors, but the demo shows 2–3 transactions instead of one.

Either way the *verification* is identical — the list is only a hint; the program is the judge.

### Weak point we are cutting: extend_deadline

A creator who can extend the deadline forever can trap donations in limbo — donors cannot be refunded while status is Active. That is a unilateral change of the refund condition: exactly the intermediary behavior this program exists to remove. MVP: **no extension**. Roadmap: extension rights fixed at creation (max 1 extension, max +7 days), or a donor-approval threshold.

### What remains unverifiable (unchanged)

Whether the charity does the work after a successful campaign, and who the charity is. The refund side is fully trustless; the delivery side stays the honest boundary already stated in §5.

---

## 16. MetaDAO & this project (mentor directive)

### How MetaDAO actually works (futarchy, not voting)

- Futarchy = "vote on values, bet on beliefs" (Hanson, 2000). MetaDAO is the only production implementation on Solana: proposals are decided by prediction markets, not token votes.
- A proposal wraps an executable Solana instruction. Opening it spins up **two conditional vaults** (base + quote token). Depositing into a vault mints **pass- and fail-conditional tokens 1:1** (deposit 10 USDC → 10 USDC-on-pass + 10 USDC-on-fail).
- **Two constant-product AMMs** trade the conditional pairs; a hardened Uniswap-V2-style **TWAP oracle** accumulates price × Δtime on every swap.
- At finalization, autocrat compares pass-TWAP vs fail-TWAP. Higher side wins: winning vault finalizes (winners redeem 1:1), **losing tokens expire worthless** (value flows to winning traders), and on a pass verdict autocrat **executes the wrapped instruction as signer**. Decision = action, atomically.
- Stack: `autocrat` + `conditional_vault` + `amm` (+ launchpad); TypeScript SDK `@metadaoproject/futarchy-sdk`; mainnet v0.6 (`FUTARELBf…`), with real treasury decisions running through it.

### The honest comparison — where we win, where we lose

| Dimension | MetaDAO | Our Charity Vault | Stronger |
| --- | --- | --- | --- |
| Problem class | Governance: decide what a DAO does | Payment escrow: hold & conditionally release | different categories — not competitors |
| Judging worthiness | Market aggregates dispersed beliefs | Deliberately cannot judge (§5) | **MetaDAO** |
| Losing side | Tokens → zero; value flows to winning traders | Every donor refunded exactly, atomically | **Ours** |
| Token requirement | Needs tradeable base + quote mints | Plain SOL, no token | **Ours** |
| Oracle surface | TWAP skews on thin markets (their extra guards exist for a reason) | No oracle: deterministic deadline + program counter | **Ours** |
| Complexity / audit surface | 3 programs, mints, AMMs | 1 program, 3 PDAs | **Ours** |
| Maturity | Mainnet, live treasury use | 24h prototype | **MetaDAO** |

The honest sentence: **we are not "better than MetaDAO".** We implement a deterministic, tokenless subset of the same conditional-vault primitive MetaDAO industrialized — specialized for a domain where markets are unusable (charities have no token, markets would be thin and skewable, and donors must be made whole, not liquidated into traders' profits). MetaDAO, not us, answers the hardest question in our §5 boundary: *is this charity worthy?* Say that out loud in the pitch — it's ecosystem awareness, and it makes our trust-boundary slide stronger, not weaker.

### Integration tiers

- **Tier 0 — this weekend, zero risk (do this):** adopt the vocabulary. Deck slide 5 + `/how-it-works`: "Our campaign vault is a **deterministic conditional vault** — the MetaDAO primitive with the market stripped out: condition = (deadline passed ∧ goal unmet) instead of a TWAP comparison." Booth talking point: one paragraph, cost ~0, shows ecosystem fluency.
- **Tier 1 — stretch, slide-only (unless everything ships by Sun 17:00):** a mini futarchy gate on `claim_success`: after the goal is met, a small two-outcome market (release vs refund) decides. Requires minting claim-style instruments + a price mechanism we don't have. Do NOT attempt during the window.
- **Tier 2 — roadmap (replaces "staked arbitrator" in the arbitration module):** post-hackathon, USDC version, `claim_success` gated by a MetaDAO-style market: donors and observers trade "release / refund" positions; the verdict executes. This is the intellectually correct upgrade of our weakest guarantee.

### Why we do NOT integrate the actual MetaDAO programs this weekend

- We are raw lamports; MetaDAO is SPL-token plumbing + a 3-program dependency chain. Deploying their stack to devnet ourselves is a multi-hour detour with zero scoring weight.
- Thin charity markets make TWAP manipulation cheap — it would *weaken* our trust story, not strengthen it.
- §11's rule applies: framework/integration migration on a 24h clock is a pure time sink. Completeness (25%) is scored on the working create→pledge→finalize→refund_all loop.
=======
=======
If you want to win, the checklist runs itself — build the 5-instruction simple version, ship it live, and make refund_all the demo's climactic beat. That's the whole game.
>>>>>>> 7eb812d7aa478b2434c25e7972d91e19a55dd742
>>>>>>> main