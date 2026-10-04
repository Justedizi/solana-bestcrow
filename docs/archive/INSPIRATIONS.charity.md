> **ARCHIVED / SUPERSEDED — do not use as spec.** Prior-art research from the charity phase; the atomic refund_all differentiator it celebrates is being removed in the target MVP.
> Canonical protocol: [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). See [../DECISIONS.md](../DECISIONS.md) (D-001).

# Inspirations & Prior Art

*Research date: 2026-10-03. Sources: GitHub code inspection (actual program sources, not READMEs) + production landscape. Purpose: know who built what before us, prove our differentiators survive contact with reality, and steal the good parts.*

---

## TL;DR

The all-or-nothing crowdfunding mechanic exists many times over in our exact stack (Anchor + Rust + JS). **Nobody ships atomic `refund_all`** — every implementation does per-donor claim transactions or no refund path at all. The ecosystem's gaps are exactly our pitch: restitution, determinism, and honest scope.

---

## Same idea, same stack (GitHub)

| Project | Stars / status | What it does | What it's missing (vs Charity Vault) |
| --- | --- | --- | --- |
| [ASCorreia/anchor-fundraiser](https://github.com/ASCorreia/anchor-fundraiser) | 29★, active Sep 2026 | initialize → contribute → refund, Anchor 0.30 — proof the pattern is alive and current | No goal-threshold logic worth the name, no refund_all, no finalize-by-anyone |
| [NZT48/solraiser](https://github.com/NZT48/solraiser) | active | close_campaign / contribute / refund_contribution / withdraw_funds — "automatic refunds" | Refunds are **per-donor claims**, one tx each. No atomic batch refund |
| [xfajarr/crowdfounding-solana](https://github.com/xfajarr/crowdfounding-solana) | small | Escrowed SOL; create_campaign / contribute / refund / withdraw | Same: per-donor refund only |
| [CalvinSkunnies/Solana-Crowdfunding](https://github.com/CalvinSkunnies/Solana-Crowdfunding) | 10★, Apr 2026 | Donations in a **PDA vault**, `claimed` flag guarding double-refund — closest to our account model | No refund_all, no donor registry, tutorial-grade tests |
| [Daltonic/fundus](https://github.com/Daltonic/fundus) | 16★ | **Exact stack: Anchor + Next.js** — create/donate/update/delete campaign | **No refund path at all** — donors can't get money back. The most-starred tutorial proves the niche ignores restitution |
| [StockpileLabs/stockpile-v2](https://github.com/StockpileLabs/stockpile-v2) | 19★, dormant since Mar 2024 | Pooled community funding (deposit / withdraw / withdraw_and_close) | Different model — no all-or-nothing goal, no refunds; dead 2.5 years |
| [Samuellyworld/anchor-crowdfund](https://github.com/Samuellyworld/anchor-crowdfund) + [dev.to tutorial](https://dev.to/samuellyworld/build-a-decentralized-crowdfunding-dapp-on-solana-with-anchor-and-rust-4888) | 10★ | The canonical tutorial most of the above copy | Source of the "yet another crowdfunding dapp" fatigue |

---

## The verdict on our differentiator claim

Instruction sets were read from source. Findings:

- **Atomic `refund_all`: unclaimed.** Every repo does per-donor refund txs (solraiser, xfajarr, ASCorreia) or nothing (fundus, stockpile). Our §3 "killer demo beat" survives verification.
- **`finalize` callable by anyone: unclaimed.** All of them gate finality on the creator or implicit deadline state.
- **Deterministic refund conditions:** our Clock-sysvar + program-counter model (EXECUTION_PLAN.md §15) has no counterpart in the sampled code — most check `goal_amount` against a counter without the vault-balance invariant.

Booth line: *"Seven repos do per-donor refunds or none — we do everyone, atomically, one click."*

---

## Production world (incumbents, not code)

- **[Change (getchange.io)](https://getchange.io/how-it-works)** — [Solana Foundation case study](https://solana.com/news/case-study-change-and-charitable-donations-on-chain): **$1M+ moved, 200k+ nonprofits**, API mapping nonprofits to wallet addresses. It is *operator forwards donations* — exactly the intermediary we remove, live on Solana. Deck gold: a real, named "before" state.
  - Roadmap bonus: their nonprofit-registry API is a concrete model for the identity/verification layer our §5 honest boundary says is missing.
- **pumpfund.me** (2026) — memecoin creator fees routed to charity, 0% commission. Validates demand for charity flows on Solana; the intermediary (pump.fun fee split) is still an operator.

---

## What to steal (concretely)

1. **From fundus:** campaign update/delete UX + the appetite for cleanup → strengthens the case for **rent reclaim + account close** (our roadmap #5; solraiser ships `close_campaign`, so the ecosystem expects it — reframe our "deferred" note as "exists in prior art, roadmap #5").
2. **From solraiser:** combine refund + vault close into one instruction — donors get their rent back too. Post-MVP target.
3. **From Change:** registry/attestation angle → slide 9's "verified campaign attestations" gets a concrete, citable model.
4. **From Stockpile:** pooled-funding variant → future USDC / milestones direction (already in "What's Next").
5. **Positioning lesson:** 6 of 7 repos are tutorial rehashes with dead test suites. Judges will have seen them. **LiteSVM tests + CI + documented invariants + honest boundary as UX** is the separation — the §14 scoring mechanism, now competitor-verified.
