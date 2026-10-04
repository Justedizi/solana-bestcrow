# Bestcrow agent setup and development instructions

Read the competition PDFs in `docs/` before making competition claims, and
follow [AGENTS.md](AGENTS.md) for source precedence. The target protocol and
chronological work list are in [the implementation plan](../docs/IMPLEMENTATION_PLAN.md);
[PROJECT.md](PROJECT.md) explains product intent. Run commands below from the
repository root unless a command explicitly changes directories.

Use the MCP setup already in this repository. Do not install a new server package or edit a user's global MCP config unless the existing launch path fails and the user asks for that change.

## Current work

Bestcrow targets startup/prototype campaigns in SOL with 2-5 locked tranches
whose shares sum to 100%, a 1% fee only on successful fundraising, and a
separate 0.1 SOL creator deposit. A vote passes only with YES weight strictly
above half of all final contributions. The first and second vote windows are
seven days each, separated after a first failure by 30 full days for
improvement. These are **target rules**; the current Rust program and
frontend do not yet enforce them. Keep current, target and verified behavior
distinct.

The local `trustless` MCP target is a freelance escrow reference. Its client approval and cancellation rules are not a crowdfunding implementation. Do not claim that a passing reference build proves our campaign model.

## Quick start

1. Work from the repository root. The MCP's `trustless` alias targets `context/trustless-escrow`, a milestone escrow reference. Read the context before assuming its design is the team's chosen implementation. These Git-ignored reference folders may be absent in another clone.
2. For **Codex CLI**, start with `sh mcp/codex.sh`. To confirm registration first, run `sh mcp/codex.sh mcp list`.
3. For **OpenCode desktop**, run `sh mcp/opencode.sh` or open this repository folder. The root `opencode.json` registers the MCP servers. Reopen the project after changing that file.
4. For another MCP client, add these entries using that client's config format:

   | Name | Transport | Command or URL |
   | --- | --- | --- |
   | `solana_bestcrow` | stdio | `/bin/sh` with the absolute path to `mcp/start.sh` as its argument |
   | `surfpool` | stdio | `/bin/sh` with the absolute path to `mcp/surfpool.sh` as its argument |
   | `solana_docs` | HTTP | `https://mcp.solana.com/mcp` |
   | `context7` | HTTP | `https://mcp.context7.com/mcp` |

   Obtain the absolute script paths with `pwd` from the repository root. Set the working directory to the repository root when using relative paths. Solana docs and Context7 need internet access; the local server does not. Context7 is configured for anonymous access, with an optional API key for higher rate limits. No extra npm package is needed.

## Documentation lookup

Use Context7 for library/API questions and implementation or setup work that depends on external APIs, without waiting for the user to explicitly request a lookup.

1. Select the project being worked on. Inspect its imports, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `Anchor.toml`, `package.json`, and relevant JavaScript lockfile to determine the versions actually used.
2. Call Context7's `resolve-library-id` with `libraryName` and a focused `query` that includes the relevant version. Prefer the official library or framework source.
3. Call `query-docs` with the returned `libraryId` and the specific question. Use a versioned ID when the resolution result provides one; do not invent an ID or silently substitute a newer major version.
4. Cite the source and explain any version mismatch. Looking up new documentation does not authorize upgrading the project's dependencies.

Use `solana_docs` for Solana/Anchor-specific guidance. If Context7 lacks the library/version, is offline, or returns a rate-limit error, state the limitation and consult official versioned documentation. The local `docs/solana/` snapshot is also available, but its freshness is unverified. Never report a live lookup as successful unless a tool call returned documentation.

Send focused technical questions to Context7; omit private project details,
keys and credentials. The optional repository-local lookup skill referenced
in older instructions is not present in this checkout.

## Verify the local server

Run this from the repository root:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sh mcp/start.sh
```

The response should list `project_overview`, `search_project`, `read_project_file`, and `run_local_check`. The latter allows only `cargo_fmt`, `cargo_check`, `cargo_test`, and `anchor_build` in the two Anchor projects. A check can fail because of existing source issues; report its exit code and output rather than treating a successful MCP call as a passing build.

Use `solana_docs` for current Solana and Anchor documentation. Use `surfpool` for local network simulation. Keep local network state separate from devnet or mainnet. Do not access wallet keys, deploy, sign, send transactions, or change RPC state through the local project MCP; those actions are intentionally not exposed.

## Verify crowdfunding behavior when implemented

The source is `rust/programs/charity-vault/src`; use its actual commands
from [rust/README.md](../rust/README.md). Use local simulations for deadlines,
voting and accounting before devnet demonstrations. See the ordered P1/P2
test matrix in [the implementation plan](../docs/IMPLEMENTATION_PLAN.md).

Cover 2 and 5 tranches, the 100% sum and 50% per-tranche boundary, funding
durations of 7 and 183 days, overfunding, pre-deadline cancellation, a failed
goal with exact refunds and no fee, and a successful goal with exactly 1%
deducted once from gross raised. Verify that fee, payout shares, creator
deposit, reserved claims, rent and refund liabilities cannot double-count
the same lamports.

Test the strict >50% vote boundary using all final contribution weight:
zero votes and exactly half must fail. Warp through the first seven-day
vote, all 30 improvement days and the second seven-day vote. Test missing
proof, creator disappearance, early finalization, duplicate votes,
unauthorized recipients, repeat release after claim closure, split bypass,
early/stranded bond, termination with an unpaid approved claim, and
duplicate refunds. Use more than 12 donors to prove the old registry and
batch-refund constraint is gone.

Rewards are off-chain promises unless independently verified. Do not call
a reward claim proof of merchandise delivery, or public wallet addresses
anonymous. Separate optional later work such as USDC, revenue sharing,
extra funding and automated keepers from the core MVP.

Link each demo check to the applicable PDF requirement: criteria p.3 requires on-chain enforcement and confirmed transactions; pp.2–3 require a complete live flow. Record the command, outcome and material gaps rather than treating tool connectivity as passing program tests.

See [mcp/README.md](../mcp/README.md) for the tool list and launcher details.
