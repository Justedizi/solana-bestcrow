#!/usr/bin/env bash
# Run the scripted Bestcrow / Charity Vault end-to-end demo.
#
# Usage:
#   scripts/demo.sh [--local] [--deadline SECS] [--mode both|refund|success]
#                   [--donors N] [--keypair PATH] [--rpc URL]
#
#   --local   target a local validator at http://127.0.0.1:8899 instead of devnet
#
# The actual flow lives in backend/scripts/run-demo.ts and signs the same
# instruction bytes the web client sends. This wrapper only prepares the
# environment (deps, wallet, funding) and forwards the config.

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ROOT="$(repo_root)"
BACKEND="$ROOT/backend"
CLUSTER_LABEL="devnet"
RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
KEYPAIR="${DEMO_KEYPAIR:-$HOME/.config/solana/id.json}"
DEADLINE="${DEMO_DEADLINE_SECS:-30}"
DONORS="${DEMO_DONORS:-3}"
MODE="${DEMO_MODE:-both}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)    CLUSTER_LABEL="localnet"; RPC_URL="http://127.0.0.1:8899"; shift ;;
    --rpc)      RPC_URL="$2"; CLUSTER_LABEL="custom"; shift 2 ;;
    --deadline) DEADLINE="$2"; shift 2 ;;
    --donors)   DONORS="$2"; shift 2 ;;
    --mode)     MODE="$2"; shift 2 ;;
    --keypair)  KEYPAIR="$2"; shift 2 ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd node

# ----------------------------------------------------------------------------
# Dependencies
# ----------------------------------------------------------------------------
if [[ ! -d "$BACKEND/node_modules" ]]; then
  log "Installing backend dependencies"
  ( cd "$BACKEND" && npm install )
fi

# ----------------------------------------------------------------------------
# Wallet + funding
# ----------------------------------------------------------------------------
if [[ ! -f "$KEYPAIR" ]]; then
  die "keypair not found: $KEYPAIR
     For devnet create one with: solana-keygen new --outfile $KEYPAIR
     or pass --keypair PATH"
fi
PAYER="$(solana-keygen pubkey "$KEYPAIR" 2>/dev/null || true)"

if [[ "$CLUSTER_LABEL" == "localnet" ]]; then
  if ! curl -s -o /dev/null --max-time 2 "$RPC_URL"; then
    die "no local validator at $RPC_URL. Start one with:  surfpool start   (or solana-test-validator)"
  fi
  log "Requesting a local airdrop for $PAYER"
  solana airdrop 100 "$PAYER" --url "$RPC_URL" >/dev/null 2>&1 || warn "airdrop failed; continuing"
elif [[ -n "$PAYER" ]]; then
  BAL="$(solana balance "$PAYER" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo 0)"
  if [[ "${BAL:-0}" == "0" || -z "${BAL:-}" ]]; then
    log "Payer $PAYER looks unfunded; requesting devnet airdrop"
    solana airdrop 2 "$PAYER" --url "$RPC_URL" >/dev/null 2>&1 || \
      warn "airdrop failed (rate limit?). The demo may still work if the payer has funds."
  fi
fi

# ----------------------------------------------------------------------------
# Run
# ----------------------------------------------------------------------------
log "Running demo against $CLUSTER_LABEL ($RPC_URL)"
( cd "$BACKEND" && \
  SOLANA_RPC_URL="$RPC_URL" \
  DEMO_KEYPAIR="$KEYPAIR" \
  DEMO_DEADLINE_SECS="$DEADLINE" \
  DEMO_DONORS="$DONORS" \
  DEMO_MODE="$MODE" \
  NO_COLOR="${NO_COLOR:-}" \
  npx tsx scripts/run-demo.ts )
