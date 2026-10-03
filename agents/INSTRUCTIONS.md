# Bestcrow agent setup and development instructions

**The PDFs in `docs/` have the highest project priority.** Read them first and follow [AGENTS.md](AGENTS.md) for source precedence and conflicts. [CONTEXT.md](CONTEXT.md) is a secondary summary; setup guidance, skills, and MCP documentation must fit the PDF requirements. Run all commands below from the repository root.

Use the MCP setup already in this repository. Do not install a new server package or edit a user's global MCP config unless the existing launch path fails and the user asks for that change.

## Current work

Bestcrow now targets startup/prototype crowdfunding with at least five milestones, staged releases, contribution-weighted backer voting, a seven-day revision chance for a result from 50% to below 70%, a stricter show-cause phase below 50%, and refunds of remaining escrow after termination. Read [PROJECT.md](PROJECT.md) after the PDFs. The 70% approval direction comes from the user's latest design; details of the denominator, vote windows, and execution triggers are not yet an implemented protocol.

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

The existing [documentation lookup skill](../skills/documentation-lookup/SKILL.md) explains the tool workflow. Send focused technical questions to Context7; omit private project details, keys, and credentials.

## Verify the local server

Run this from the repository root:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sh mcp/start.sh
```

The response should list `project_overview`, `search_project`, `read_project_file`, and `run_local_check`. The latter allows only `cargo_fmt`, `cargo_check`, `cargo_test`, and `anchor_build` in the two Anchor projects. A check can fail because of existing source issues; report its exit code and output rather than treating a successful MCP call as a passing build.

Use `solana_docs` for current Solana and Anchor documentation. Use `surfpool` for local network simulation. Keep local network state separate from devnet or mainnet. Do not access wallet keys, deploy, sign, send transactions, or change RPC state through the local project MCP; those actions are intentionally not exposed.

## Verify crowdfunding behavior when implemented

Identify the campaign's actual source and test commands first; a canonical crowdfunding program has not been established in this checkout. Use local simulations for deadlines, voting and accounting before any authorized devnet demonstration.

Check the pre-goal pledge and on-chain deposit distinction, successful and failed fundraising, at least five milestones, no allocation above 50% of the base budget, exactly-once initial release, contribution-weighted eligibility, and the 70% approval boundary. Cover a 50%–69.99% first failed vote with seven-day revision, a below-50% show-cause phase, second vote, termination/refund, and creator disappearance. Test missed deadlines and any funded creator bond, as well as pro-rata claims from a fixed termination snapshot. Reject unauthorized recipients/releases, duplicate ballots and refunds, and attempts to alter funded terms.

Test overflow and extra-funding proposals separately: creator cannot spend the amount above the original goal without an approved request; a successful extra-funding poll opens an opt-in contribution path rather than minting money or charging wallets. Verify failed polls preserve the existing escrow rules.

Keep base funding, overflow, new-round funding, released, refundable, reward-reserved and fee amounts distinct. Show that they cannot exceed funded assets or spend the same unit twice. If revenue sharing is later implemented, test its separate vault, agreed percentage/cap, and direct claims from actual on-chain receipts. Use a known test asset and label simulated supplier events; a reward claim or API response is not proof of delivered merchandise. Do not claim wallet addresses are anonymous.

Link each demo check to the applicable PDF requirement: criteria p.3 requires on-chain enforcement and confirmed transactions; pp.2–3 require a complete live flow. Record the command, outcome and material gaps rather than treating tool connectivity as passing program tests.

See [mcp/README.md](../mcp/README.md) for the tool list and launcher details.
