# Escrow development MCP

From the repository root, run `sh mcp/codex.sh`. This launches Codex with:

- `solana_bestcrow`: local, dependency-free stdio MCP for the three escrow projects.
- `surfpool`: local Solana network simulation tools from the installed Surfpool CLI.
- `solana_docs`: official Solana documentation and Anchor help at `https://mcp.solana.com/mcp` (requires internet).
- `context7`: current library documentation and examples at `https://mcp.context7.com/mcp` (requires internet).

For OpenCode desktop, run `sh mcp/opencode.sh` or open this repository as the project. The root `opencode.json` registers the same four MCP servers, with project-relative paths for the local servers. Reopen the project after changing the config.

Run `sh mcp/codex.sh mcp list` to confirm all four entries are registered. Registration does not verify a live connection. For another MCP client, set its stdio command to `/bin/sh` and its argument to the absolute path of `mcp/start.sh`. You can also launch the local server manually with `sh mcp/start.sh`; it waits for MCP JSON-RPC messages on stdin and prints responses on stdout.

## Current library documentation with Context7

Context7 uses its hosted HTTP service, so there is no additional local package to install. This configuration uses anonymous access; an API key is optional for higher rate limits. See the [official setup guide](https://context7.com/docs/resources/all-clients) if authentication is needed. Keep credentials in the client's private settings or environment rather than the repository.

After reopening OpenCode or starting a new session with `sh mcp/codex.sh`, try:

> Use Context7 to find Anchor documentation for the version declared in this project's Cargo.toml. Explain the token account owner constraints and cite the source.

The agent should call `resolve-library-id` followed by `query-docs`. Match the selected project's imports, manifests, and lockfiles to the documentation version. If that version is unavailable, say so and consult official versioned documentation. Use `solana_docs` for additional Solana and Anchor guidance. See [agent instructions](../agents/INSTRUCTIONS.md#documentation-lookup) for the full workflow.

Verify a live connection by checking that those two tools are available and one documentation query returns results. A 429 response means the service is rate-limiting requests; wait before retrying or use a private API key for higher limits. If the connection fails, report that failure and use official documentation or the local `docs/solana/` snapshot with its freshness limitation stated.

| Tool | Use |
| --- | --- |
| `project_overview` | Project paths and installed tool versions |
| `search_project` | Search a selected project's source and config text |
| `read_project_file` | Read a selected project's small text file |
| `run_local_check` | Run `cargo fmt`, `cargo check`, `cargo test`, or `anchor build` in an Anchor project |

`trustless` targets the external milestone escrow reference. `anchor_reference` and `native_reference` are token-swap escrow examples. See the [current product direction](../agents/PROJECT.md) and [ordered implementation plan](../docs/IMPLEMENTATION_PLAN.md); reference builds do not prove the new 2-5-tranche, 1%-fee Bestcrow protocol. The local MCP does not provide named deployment, signing, or transaction-sending tools. It does run local project code during checks; use trusted sources and do not treat it as a security sandbox. Checks may download uncached dependencies and can take several minutes.
