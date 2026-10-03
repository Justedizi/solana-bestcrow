#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec codex -C "$repo_root" \
  -c 'mcp_servers.solana_bestcrow.command="/bin/sh"' \
  -c "mcp_servers.solana_bestcrow.args=[\"$repo_root/mcp/start.sh\"]" \
  -c 'mcp_servers.surfpool.command="/bin/sh"' \
  -c "mcp_servers.surfpool.args=[\"$repo_root/mcp/surfpool.sh\"]" \
  -c 'mcp_servers.solana_docs.url="https://mcp.solana.com/mcp"' \
  -c 'mcp_servers.context7.url="https://mcp.context7.com/mcp"' \
  "$@"
