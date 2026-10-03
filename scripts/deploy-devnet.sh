#!/usr/bin/env bash
# Deploy the Charity Vault program to Solana devnet.
#
# Usage:
#   scripts/deploy-devnet.sh [--wallet PATH] [--rpc URL] [--no-build] [--no-sync]
#
# Environment:
#   WALLET          deploy keypair                 (default: ~/.config/solana/id.json)
#   RPC_URL         cluster RPC                     (default: https://api.devnet.solana.com)
#   CLUSTER         anchor provider cluster label   (default: devnet)
#   CREATE_WALLET=1 create the keypair if missing   (default: off)
#   ALLOW_ID_CHANGE=1 rewrite declare_id!/Anchor.toml when the keypair id differs
#   NO_DNA=1        passed through to anchor
#
# Build note: the installed platform-tools target SBPFv3, so we build with
# `--arch v0` (the compatible target). This is required on this toolchain.

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

WALLET="${WALLET:-$HOME/.config/solana/id.json}"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
CLUSTER="${CLUSTER:-devnet}"
DO_BUILD=1
DO_SYNC=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wallet) WALLET="$2"; shift 2 ;;
    --rpc)    RPC_URL="$2"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-sync)  DO_SYNC=0; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

ROOT="$(repo_root)"
RUST_DIR="$ROOT/rust"
PROGRAM_NAME="charity_vault"
PROGRAM_KEYPAIR="$RUST_DIR/target/deploy/${PROGRAM_NAME}-keypair.json"

require_cmd anchor
require_cmd solana
require_cmd solana-keygen

# ----------------------------------------------------------------------------
# Wallet
# ----------------------------------------------------------------------------
if [[ ! -f "$WALLET" ]]; then
  if [[ "${CREATE_WALLET:-0}" == "1" ]]; then
    log "No wallet at $WALLET; creating a new devnet keypair"
    mkdir -p "$(dirname "$WALLET")"
    solana-keygen new --no-bip39-passphrase --silent --outfile "$WALLET"
  else
    die "wallet not found: $WALLET
     Create one with:  solana-keygen new --outfile $WALLET
     Or re-run with:   CREATE_WALLET=1 $0"
  fi
fi

PAYER="$(solana-keygen pubkey "$WALLET")"
BALANCE="$(solana balance "$PAYER" --url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo 0)"
log "Deployer: $PAYER  (${BALANCE:-0} SOL on $CLUSTER)"

if [[ "${BALANCE:-0}" == "0" || -z "${BALANCE:-}" ]]; then
  warn "deployer has ~0 SOL; requesting an airdrop on devnet"
  solana airdrop 2 "$PAYER" --url "$RPC_URL" >/dev/null 2>&1 || \
    warn "airdrop failed (rate limit?). Fund $PAYER manually before deploying."
fi

# ----------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------
if [[ "$DO_BUILD" == "1" ]]; then
  log "Building program (anchor build --no-idl -- --arch v0)"
  ( cd "$RUST_DIR" && NO_DNA="${NO_DNA:-1}" anchor build --no-idl -- --arch v0 )
  ok "build finished"
else
  info "skipping build (--no-build)"
fi

[[ -f "$PROGRAM_KEYPAIR" ]] || die "program keypair missing: $PROGRAM_KEYPAIR (run a build first)"
PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
log "Program id (from keypair): $PROGRAM_ID"

# ----------------------------------------------------------------------------
# Guard: declared id must match the deploy keypair
# ----------------------------------------------------------------------------
DECLARED_ID="$(grep -oE 'declare_id!\("[^"]+"\)' "$RUST_DIR/programs/$PROGRAM_NAME/src/lib.rs" | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}')" || true
if [[ -n "$DECLARED_ID" && "$DECLARED_ID" != "$PROGRAM_ID" ]]; then
  if [[ "${ALLOW_ID_CHANGE:-0}" == "1" ]]; then
    warn "declared id ($DECLARED_ID) != keypair id ($PROGRAM_ID); rewriting sources"
    grep -rl "$DECLARED_ID" "$RUST_DIR/programs/$PROGRAM_NAME/src" "$RUST_DIR/Anchor.toml" 2>/dev/null \
      | while IFS= read -r f; do
          tmp="$(mktemp)"; sed "s/$DECLARED_ID/$PROGRAM_ID/g" "$f" > "$tmp"; mv "$tmp" "$f"
        done
    ( cd "$RUST_DIR" && NO_DNA="${NO_DNA:-1}" anchor build --no-idl -- --arch v0 )
  else
    die "declare_id! ($DECLARED_ID) does not match the deploy keypair ($PROGRAM_ID).
     If this keypair is the one you want, re-run with ALLOW_ID_CHANGE=1 to rewrite
     declare_id! and Anchor.toml, then rebuild and redeploy."
  fi
fi

# ----------------------------------------------------------------------------
# Deploy
# ----------------------------------------------------------------------------
log "Deploying $PROGRAM_ID to $CLUSTER ($RPC_URL)"
( cd "$RUST_DIR" && NO_DNA="${NO_DNA:-1}" anchor deploy \
    --provider.cluster "$CLUSTER" \
    --provider.wallet "$WALLET" )
ok "deploy transaction submitted"

log "Verifying program is live"
solana program show "$PROGRAM_ID" --url "$RPC_URL" || warn "could not read program metadata yet"

# ----------------------------------------------------------------------------
# Sync project env files
# ----------------------------------------------------------------------------
if [[ "$DO_SYNC" == "1" ]]; then
  FE_ENV="$ROOT/frontend/.env.local"
  BE_ENV="$ROOT/backend/.env"
  [[ -f "$FE_ENV" ]] || { [[ -f "$ROOT/frontend/.env.example" ]] && cp "$ROOT/frontend/.env.example" "$FE_ENV"; }
  [[ -f "$BE_ENV" ]] || { [[ -f "$ROOT/backend/.env.example" ]] && cp "$ROOT/backend/.env.example" "$BE_ENV"; }
  upsert_env "$FE_ENV" NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
  upsert_env "$FE_ENV" NEXT_PUBLIC_SOLANA_RPC_URL "$RPC_URL"
  upsert_env "$BE_ENV" CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
  upsert_env "$BE_ENV" SOLANA_RPC_URL "$RPC_URL"
  upsert_env "$BE_ENV" CLUSTER "$CLUSTER"
  ok "synced $PROGRAM_ID into frontend/.env.local and backend/.env"
fi

printf '\n'
ok "Deployed Charity Vault"
info "program id : $PROGRAM_ID"
info "explorer   : https://explorer.solana.com/address/$PROGRAM_ID?cluster=$CLUSTER"
