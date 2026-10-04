#!/usr/bin/env bash
# Build, validate and optionally deploy Charity Vault V2 to Solana Devnet.
#
# Safe default (no deployment transaction):
#   scripts/deploy-devnet.sh --wallet ~/.config/solana/id.json
#
# After reviewing the printed summary:
#   scripts/deploy-devnet.sh --wallet ~/.config/solana/id.json --execute-deploy
#
# Options:
#   --wallet PATH            deployer / upgrade-authority keypair
#   --rpc URL                Devnet RPC (default: https://api.devnet.solana.com)
#   --program-keypair PATH   program keypair (default: rust/target/deploy/charity_vault-keypair.json)
#   --evidence PATH          evidence JSON (default: docs/deployments/devnet-v2.json)
#   --execute-deploy         submit the deployment after all checks pass
#   --no-build               reuse existing .so and generated IDL
#   --no-sync                do not update local frontend/backend environment files

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DEPLOY_WALLET="${WALLET:-$HOME/.config/solana/id.json}"
DEPLOY_RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
DO_BUILD=1
DO_SYNC=1
EXECUTE_DEPLOY=0

ROOT="$(repo_root)"
RUST_DIR="$ROOT/rust"
PROGRAM_NAME="charity_vault"
PROGRAM_KEYPAIR="$RUST_DIR/target/deploy/${PROGRAM_NAME}-keypair.json"
EVIDENCE_FILE="$ROOT/docs/deployments/devnet-v2.json"
DEVNET_GENESIS_HASH="EtWTRABZaYq6iMfeYKouRu166VU2xqa1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wallet) DEPLOY_WALLET="$2"; shift 2 ;;
    --rpc) DEPLOY_RPC_URL="$2"; shift 2 ;;
    --program-keypair) PROGRAM_KEYPAIR="$2"; shift 2 ;;
    --evidence) EVIDENCE_FILE="$2"; shift 2 ;;
    --execute-deploy) EXECUTE_DEPLOY=1; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-sync) DO_SYNC=0; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd anchor
require_cmd node
require_cmd solana
require_cmd solana-keygen

[[ -f "$DEPLOY_WALLET" ]] || die "deployer wallet not found: $DEPLOY_WALLET"
PAYER="$(solana-keygen pubkey "$DEPLOY_WALLET")"

log "Checking that the RPC is Solana Devnet"
GENESIS_HASH="$(solana genesis-hash --url "$DEPLOY_RPC_URL")"
[[ "$GENESIS_HASH" == "$DEVNET_GENESIS_HASH" ]] || \
  die "RPC is not Devnet (unexpected genesis hash: $GENESIS_HASH)"

ANCHOR_VERSION="$(anchor --version | awk '{print $2}')"
ANCHOR_LANG_VERSION="$(sed -nE 's/.*anchor-lang = \{ version = "=([^"]+)".*/\1/p' "$RUST_DIR/programs/charity-vault/Cargo.toml")"
[[ -n "$ANCHOR_LANG_VERSION" ]] || die "cannot read pinned anchor-lang version"
[[ "$ANCHOR_VERSION" == "$ANCHOR_LANG_VERSION" ]] || \
  die "anchor CLI $ANCHOR_VERSION does not match anchor-lang $ANCHOR_LANG_VERSION"

[[ -f "$PROGRAM_KEYPAIR" ]] || die "program keypair missing: $PROGRAM_KEYPAIR
Create or restore the intended Devnet program keypair, run 'anchor keys sync' in rust/, then rebuild."
PREBUILD_PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
PREBUILD_DECLARED_ID="$(grep -oE 'declare_id!\("[^"]+"\)' "$RUST_DIR/programs/$PROGRAM_NAME/src/lib.rs" | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}')"
[[ "$PREBUILD_PROGRAM_ID" == "$PREBUILD_DECLARED_ID" ]] || \
  die "program keypair ($PREBUILD_PROGRAM_ID) does not match declare_id! ($PREBUILD_DECLARED_ID).
Restore the intended keypair or run 'anchor keys sync' in rust/, review the source change, and retry."

ANCHOR_TOOLCHAIN_PATH="$PATH"
if command -v rustup >/dev/null 2>&1; then
  RUSTUP_SHIM_DIR="$(dirname "$(command -v rustup)")"
  if [[ -x "$RUSTUP_SHIM_DIR/cargo" ]]; then
    ANCHOR_TOOLCHAIN_PATH="$RUSTUP_SHIM_DIR:$PATH"
  fi
fi

if [[ "$DO_BUILD" == "1" ]]; then
  log "Building the program with Anchor $ANCHOR_VERSION"
  ( cd "$RUST_DIR" && PATH="$ANCHOR_TOOLCHAIN_PATH" NO_DNA="${NO_DNA:-1}" anchor build --no-idl -- --arch v0 )
  ( cd "$RUST_DIR" && PATH="$ANCHOR_TOOLCHAIN_PATH" NO_DNA="${NO_DNA:-1}" anchor keys list )
  mkdir -p "$RUST_DIR/target/idl"
  ( cd "$RUST_DIR" && PATH="$ANCHOR_TOOLCHAIN_PATH" NO_DNA="${NO_DNA:-1}" anchor idl build -o target/idl/charity_vault.json )
else
  info "skipping build (--no-build)"
fi

PROGRAM_SO="$RUST_DIR/target/deploy/${PROGRAM_NAME}.so"
IDL="$RUST_DIR/target/idl/${PROGRAM_NAME}.json"
[[ -f "$PROGRAM_SO" ]] || die "compiled program missing: $PROGRAM_SO"
[[ -f "$IDL" ]] || die "generated IDL missing: $IDL"

PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
DECLARED_ID="$(grep -oE 'declare_id!\("[^"]+"\)' "$RUST_DIR/programs/$PROGRAM_NAME/src/lib.rs" | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}')"
ANCHOR_ID="$(awk '
  /^\[programs\.devnet\]$/ { section=1; next }
  /^\[/ { section=0 }
  section && $1 == "charity_vault" { gsub(/["[:space:]]/, "", $3); print $3 }
' "$RUST_DIR/Anchor.toml")"
IDL_ID="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).address)' "$IDL")"

for pair in "declare_id!:$DECLARED_ID" "Anchor.toml:$ANCHOR_ID" "IDL:$IDL_ID"; do
  LABEL="${pair%%:*}"
  VALUE="${pair#*:}"
  [[ "$VALUE" == "$PROGRAM_ID" ]] || die "$LABEL program ID ($VALUE) does not match keypair ($PROGRAM_ID).
Restore the intended keypair or run 'anchor keys sync' in rust/, review the source change, and rebuild."
done

BALANCE="$(solana balance "$PAYER" --url "$DEPLOY_RPC_URL" | awk '{print $1}')"
[[ -n "$BALANCE" && "$BALANCE" != "0" && "$BALANCE" != "0.000000000" ]] || \
  die "deployer $PAYER has no Devnet SOL; fund it before deployment"

PROGRAM_SHA256="$(shasum -a 256 "$PROGRAM_SO" | awk '{print $1}')"
IDL_SHA256="$(shasum -a 256 "$IDL" | awk '{print $1}')"

printf '\nDeployment summary (no secrets):\n'
info "cluster         : devnet"
info "RPC             : $DEPLOY_RPC_URL"
info "deployer        : $PAYER"
info "balance         : $BALANCE SOL"
info "program id      : $PROGRAM_ID"
info "program SHA-256 : $PROGRAM_SHA256"
info "IDL SHA-256     : $IDL_SHA256"
info "evidence        : $EVIDENCE_FILE"

if [[ "$EXECUTE_DEPLOY" != "1" ]]; then
  printf '\n'
  ok "preflight passed; no deployment transaction was sent"
  info "Review the summary, then repeat with --execute-deploy."
  exit 0
fi

EVIDENCE_DIR="$(dirname "$EVIDENCE_FILE")"
mkdir -p "$EVIDENCE_DIR"
DEPLOY_LOG="$EVIDENCE_DIR/devnet-v2-anchor-deploy.log"
PROGRAM_SHOW_FILE="$EVIDENCE_DIR/devnet-v2-program-show-before-finalization.json"

log "Deploying $PROGRAM_ID to Devnet"
( cd "$RUST_DIR" && NO_DNA="${NO_DNA:-1}" anchor deploy \
    --program-name "$PROGRAM_NAME" \
    --program-keypair "$PROGRAM_KEYPAIR" \
    --provider.cluster "$DEPLOY_RPC_URL" \
    --provider.wallet "$DEPLOY_WALLET" \
    --commitment confirmed \
    --no-idl \
    -- --output json --use-rpc ) 2>&1 | tee "$DEPLOY_LOG"

DEPLOYMENT_SIGNATURE="$(grep -Eo '[1-9A-HJ-NP-Za-km-z]{64,88}' "$DEPLOY_LOG" | tail -n 1 || true)"
log "Verifying the deployed program"
solana program show "$PROGRAM_ID" --url "$DEPLOY_RPC_URL" --output json | tee "$PROGRAM_SHOW_FILE"

EVIDENCE_FILE="$EVIDENCE_FILE" \
EVIDENCE_PROGRAM_ID="$PROGRAM_ID" \
EVIDENCE_DEPLOYER="$PAYER" \
EVIDENCE_RPC="$DEPLOY_RPC_URL" \
EVIDENCE_SIGNATURE="$DEPLOYMENT_SIGNATURE" \
EVIDENCE_PROGRAM_SHA="$PROGRAM_SHA256" \
EVIDENCE_IDL_SHA="$IDL_SHA256" \
EVIDENCE_PROGRAM_SHOW="$PROGRAM_SHOW_FILE" \
node <<'NODE'
const fs = require('node:fs');
const evidencePath = process.env.EVIDENCE_FILE;
const programShow = JSON.parse(fs.readFileSync(process.env.EVIDENCE_PROGRAM_SHOW, 'utf8'));
const evidence = {
  cluster: 'devnet',
  rpcUrl: process.env.EVIDENCE_RPC,
  programId: process.env.EVIDENCE_PROGRAM_ID,
  deployer: process.env.EVIDENCE_DEPLOYER,
  programSha256: process.env.EVIDENCE_PROGRAM_SHA,
  idlSha256: process.env.EVIDENCE_IDL_SHA,
  deploymentSignature: process.env.EVIDENCE_SIGNATURE || null,
  deploymentExplorer: process.env.EVIDENCE_SIGNATURE
    ? `https://explorer.solana.com/tx/${process.env.EVIDENCE_SIGNATURE}?cluster=devnet`
    : null,
  programShowBeforeFinalization: programShow,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

if [[ -z "$DEPLOYMENT_SIGNATURE" ]]; then
  warn "could not extract a deployment signature from Anchor output; copy it from $DEPLOY_LOG into $EVIDENCE_FILE"
fi

if [[ "$DO_SYNC" == "1" ]]; then
  FE_ENV="$ROOT/frontend/.env.local"
  BE_ENV="$ROOT/backend/.env"
  [[ -f "$FE_ENV" ]] || { [[ -f "$ROOT/frontend/.env.example" ]] && cp "$ROOT/frontend/.env.example" "$FE_ENV"; }
  [[ -f "$BE_ENV" ]] || { [[ -f "$ROOT/backend/.env.example" ]] && cp "$ROOT/backend/.env.example" "$BE_ENV"; }
  upsert_env "$FE_ENV" NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
  upsert_env "$FE_ENV" NEXT_PUBLIC_SOLANA_RPC_URL "$DEPLOY_RPC_URL"
  upsert_env "$BE_ENV" CHARITY_VAULT_PROGRAM_ID "$PROGRAM_ID"
  upsert_env "$BE_ENV" SOLANA_RPC_URL "$DEPLOY_RPC_URL"
  upsert_env "$BE_ENV" CLUSTER devnet
  ok "synced local frontend/backend environment files"
fi

printf '\n'
ok "deployment confirmed and evidence started"
info "program : https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
info "next    : initialize ProtocolConfigV2; see docs/DEVNET_DEPLOYMENT.md"
