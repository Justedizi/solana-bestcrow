#!/usr/bin/env bash
# =============================================================================
# Bestcrow — one-command presentation stack.
#
#   scripts/up.sh                 localnet: validator + program + app + seed data
#   scripts/up.sh --devnet        devnet:   build + deploy + app + seed data
#   scripts/up.sh --no-seed       skip seeding demo campaigns
#   scripts/up.sh --no-install    skip npm install
#
# Brings up everything a mentor demo needs, then waits. Ctrl-C stops the app
# (and, on localnet, the validator this script started).
# =============================================================================

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ROOT="$(repo_root)"
RUST="$ROOT/rust"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
MODE="local"
DO_SEED=1
DO_INSTALL=1
WALLET="${WALLET:-$HOME/.config/solana/id.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)      MODE="local"; shift ;;
    --devnet)     MODE="devnet"; shift ;;
    --no-seed)    DO_SEED=0; shift ;;
    --no-install) DO_INSTALL=0; shift ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

for cmd in node npm solana solana-keygen; do require_cmd "$cmd"; done

if [[ "$MODE" == "local" ]]; then
  RPC_URL="http://127.0.0.1:8899"
  CLUSTER="localnet"
else
  RPC_URL="https://api.devnet.solana.com"
  CLUSTER="devnet"
fi

WE_STARTED_VALIDATOR=0
SERVER_PIDS=()
VALIDATOR_PID=""
LEDGER="$RUST/target/demo-ledger"

cleanup() {
  trap - INT TERM EXIT
  printf '\n'
  log "Shutting down"
  for pid in "${SERVER_PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  if [[ "$WE_STARTED_VALIDATOR" == "1" && -n "$VALIDATOR_PID" ]]; then
    kill "$VALIDATOR_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ---------------------------------------------------------------------------
# 1. Cluster
# ---------------------------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
  require_cmd solana-test-validator
  if solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; then
    warn "a local validator is already running on $RPC_URL (reusing it)"
  else
    log "Starting solana-test-validator (fresh ledger at rust/target/demo-ledger)"
    mkdir -p "$LEDGER"
    nohup solana-test-validator --reset --ledger "$LEDGER" --quiet >"$ROOT/rust/target/demo-validator.log" 2>&1 &
    VALIDATOR_PID=$!
    WE_STARTED_VALIDATOR=1
    for _ in $(seq 1 60); do
      solana cluster-version --url "$RPC_URL" >/dev/null 2>&1 && break
      sleep 1
    done
    solana cluster-version --url "$RPC_URL" >/dev/null 2>&1 || die "validator did not come up (see rust/target/demo-validator.log)"
    ok "validator ready"
  fi
fi
require_cmd solana-keygen

# ---------------------------------------------------------------------------
# 2. Wallet
# ---------------------------------------------------------------------------
if [[ ! -f "$WALLET" ]]; then
  log "Creating a $CLUSTER wallet at $WALLET"
  mkdir -p "$(dirname "$WALLET")"
  solana-keygen new --no-bip39-passphrase --silent --outfile "$WALLET"
fi
PAYER="$(solana-keygen pubkey "$WALLET")"

fund_payer() {
  local want="$1"
  local bal
  bal="$(solana balance "$PAYER" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo 0)"
  if [[ "${bal:-0}" == "0" || -z "${bal:-}" ]]; then
    log "Airdropping $want SOL to $PAYER"
    solana airdrop "$want" "$PAYER" --url "$RPC_URL" >/dev/null 2>&1 || \
      warn "airdrop failed (rate limit?). Fund $PAYER manually if the demo stalls."
  fi
}
[[ "$MODE" == "local" ]] && fund_payer 500
if [[ "$MODE" == "devnet" ]]; then fund_payer 2; fi

# ---------------------------------------------------------------------------
# 3. Build + deploy the program
# ---------------------------------------------------------------------------
require_cmd anchor
require_cmd cargo
PROGRAM_ID="$( ( cd "$RUST" && NO_DNA=1 anchor keys list 2>/dev/null ) | awk -F': ' '/charity_vault/{print $2}' )"
[[ -n "$PROGRAM_ID" ]] || die "could not read the program id (run 'anchor keys list' in rust/)"
SO="$RUST/target/deploy/charity_vault.so"
KEYPAIR="$RUST/target/deploy/charity_vault-keypair.json"

if [[ ! -f "$SO" ]]; then
  log "Building program (anchor build --no-idl -- --arch v0)"
  ( cd "$RUST" && NO_DNA=1 anchor build --no-idl -- --arch v0 )
fi

if solana program show "$PROGRAM_ID" --url "$RPC_URL" >/dev/null 2>&1; then
  ok "program already deployed on $CLUSTER: $PROGRAM_ID"
else
  log "Deploying $PROGRAM_ID to $CLUSTER"
  solana program deploy "$SO" --program-id "$KEYPAIR" --url "$RPC_URL" --commitment confirmed
  ok "program deployed"
fi

# ---------------------------------------------------------------------------
# 4. Point the app at this cluster
# ---------------------------------------------------------------------------
FE_ENV="$FRONTEND/.env.local"
BE_ENV="$BACKEND/.env"
[[ -f "$FE_ENV" ]] || { [[ -f "$FRONTEND/.env.example" ]] && cp "$FRONTEND/.env.example" "$FE_ENV"; }
[[ -f "$BE_ENV" ]] || { [[ -f "$BACKEND/.env.example" ]] && cp "$BACKEND/.env.example" "$BE_ENV"; }
upsert_env "$FE_ENV" NEXT_PUBLIC_SOLANA_RPC_URL "$RPC_URL"
upsert_env "$FE_ENV" NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
upsert_env "$BE_ENV" SOLANA_RPC_URL "$RPC_URL"
upsert_env "$BE_ENV" CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
upsert_env "$BE_ENV" CLUSTER "$CLUSTER"
ok "app configured for $CLUSTER"

# ---------------------------------------------------------------------------
# 5. Dependencies
# ---------------------------------------------------------------------------
if [[ "$DO_INSTALL" == "1" ]]; then
  [[ -d "$BACKEND/node_modules" ]] || ( log "Installing backend deps"; cd "$BACKEND" && npm install )
  [[ -d "$FRONTEND/node_modules" ]] || ( log "Installing frontend deps"; cd "$FRONTEND" && npm install )
fi

# ---------------------------------------------------------------------------
# 6. Seed demo campaigns
# ---------------------------------------------------------------------------
if [[ "$DO_SEED" == "1" ]]; then
  log "Seeding showcase campaigns"
  ( cd "$BACKEND" && \
    SOLANA_RPC_URL="$RPC_URL" DEMO_KEYPAIR="$WALLET" DEMO_MODE="seed" \
    npx tsx scripts/run-demo.ts ) || warn "seeding failed; continuing with an empty campaign list"
fi

# ---------------------------------------------------------------------------
# 7. Start backend + frontend
# ---------------------------------------------------------------------------
log "Starting backend API + indexer"
( cd "$BACKEND" && npm run dev 2>&1 | sed -u 's/^/[api] /' ) &
SERVER_PIDS+=("$!")

log "Starting frontend"
( cd "$FRONTEND" && npm run dev 2>&1 | sed -u 's/^/[web] /' ) &
SERVER_PIDS+=("$!")

sleep 3
DEMO_FLAG="--local"
[[ "$MODE" == "devnet" ]] && DEMO_FLAG="--devnet"
printf '\n'
printf '%s\n' "${C_BOLD}======================================================================${C_RESET}"
printf '%s\n' "${C_BOLD}  BESTCROW — demo ready${C_RESET}"
printf '%s\n' "${C_BOLD}======================================================================${C_RESET}"
printf '  %-10s %s\n' "App"     "http://localhost:3000"
printf '  %-10s %s\n' "API"     "http://localhost:4000/api/health"
printf '  %-10s %s\n' "Cluster" "$CLUSTER ($RPC_URL)"
printf '  %-10s %s\n' "Program" "$PROGRAM_ID"
printf '  %-10s %s\n' "Wallet"  "$WALLET"
printf '\n'
printf '%s\n' "  ${C_BOLD}Talk track${C_RESET}"
printf '   1. Campaigns list: goal, deadline, progress, status.\n'
printf '   2. Open a campaign: pledge, live countdown, donor list.\n'
printf '   3. At the deadline anyone can finalize -> Succeeded or Refunded.\n'
printf '   4. On Refunded: refund_all repays every donor in ONE transaction.\n'
printf '   5. On Succeeded: claim_success pays the creator.\n'
printf '   6. Honest boundary: the program enforces money flow, not worthiness.\n'
printf '\n'
printf '  Hero CLI run:  scripts/demo.sh %s\n' "$DEMO_FLAG"
printf '  Stop:          Ctrl-C\n'
printf '%s\n' "${C_BOLD}======================================================================${C_RESET}"
printf '\n'

wait
