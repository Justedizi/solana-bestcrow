#!/usr/bin/env bash
# Permanently remove the Bestcrow V2 Devnet program upgrade authority.
# This operation is irreversible and is intentionally separate from deployment.
#
# Dry-run verification:
#   scripts/finalize-devnet-v2.sh --evidence docs/deployments/devnet-v2.json
#
# Execute only after deployment, config initialization and smoke test:
#   scripts/finalize-devnet-v2.sh --evidence docs/deployments/devnet-v2.json \
#     --execute --confirm-final <PROGRAM_ID>

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FINALIZE_WALLET="${WALLET:-$HOME/.config/solana/id.json}"
FINALIZE_RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
EVIDENCE_FILE=""
EXECUTE_FINAL=0
CONFIRMED_PROGRAM_ID=""
DEVNET_GENESIS_HASH="EtWTRABZaYq6iMfeYKouRu166VU2xqa1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wallet) FINALIZE_WALLET="$2"; shift 2 ;;
    --rpc) FINALIZE_RPC_URL="$2"; shift 2 ;;
    --evidence) EVIDENCE_FILE="$2"; shift 2 ;;
    --execute) EXECUTE_FINAL=1; shift ;;
    --confirm-final) CONFIRMED_PROGRAM_ID="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd node
require_cmd npm
require_cmd solana
require_cmd solana-keygen
[[ -n "$EVIDENCE_FILE" && -f "$EVIDENCE_FILE" ]] || die "a valid --evidence JSON file is required"
[[ -f "$FINALIZE_WALLET" ]] || die "upgrade-authority wallet not found: $FINALIZE_WALLET"

read_evidence() {
  node -e '
    const fs = require("fs");
    const value = process.argv[2].split(".").reduce((v, key) => v?.[key], JSON.parse(fs.readFileSync(process.argv[1], "utf8")));
    if (value === undefined || value === null || value === "") process.exit(2);
    process.stdout.write(Array.isArray(value) ? value.join(",") : String(value));
  ' "$EVIDENCE_FILE" "$1"
}

PROGRAM_ID="$(read_evidence programId)" || die "evidence is missing programId"
EVIDENCE_CLUSTER="$(read_evidence cluster)" || die "evidence is missing cluster"
TREASURY="$(read_evidence treasury)" || die "evidence is missing treasury"
CONFIG_PDA="$(read_evidence configPda)" || die "evidence is missing configPda"
DEPLOYMENT_SIGNATURE="$(read_evidence deploymentSignature)" || die "evidence is missing deploymentSignature"
CONFIG_SIGNATURE="$(read_evidence configInitializationSignature)" || die "evidence is missing configInitializationSignature"
SMOKE_SIGNATURES="$(read_evidence smokeTestSignatures)" || die "evidence is missing smokeTestSignatures"
[[ "$EVIDENCE_CLUSTER" == "devnet" ]] || die "evidence cluster must be devnet"

GENESIS_HASH="$(solana genesis-hash --url "$FINALIZE_RPC_URL")"
[[ "$GENESIS_HASH" == "$DEVNET_GENESIS_HASH" ]] || die "RPC is not Devnet (unexpected genesis hash: $GENESIS_HASH)"
for signature in "$DEPLOYMENT_SIGNATURE" "$CONFIG_SIGNATURE" ${SMOKE_SIGNATURES//,/ }; do
  [[ "$signature" =~ ^[1-9A-HJ-NP-Za-km-z]{64,88}$ ]] || die "invalid or placeholder transaction signature in evidence: $signature"
  solana confirm "$signature" --url "$FINALIZE_RPC_URL" --commitment finalized >/dev/null
done
AUTHORITY="$(solana-keygen pubkey "$FINALIZE_WALLET")"

PROGRAM_SHOW_BEFORE="$(mktemp)"
trap 'rm -f "$PROGRAM_SHOW_BEFORE"' EXIT
solana program show "$PROGRAM_ID" --url "$FINALIZE_RPC_URL" --output json > "$PROGRAM_SHOW_BEFORE"
ONCHAIN_AUTHORITY="$(node -e '
  const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(value.authority ?? value.upgradeAuthority ?? ""));
' "$PROGRAM_SHOW_BEFORE")"
[[ "$ONCHAIN_AUTHORITY" == "$AUTHORITY" ]] || \
  die "wallet $AUTHORITY is not the on-chain upgrade authority ($ONCHAIN_AUTHORITY)"

CONFIG_OWNER="$(solana account "$CONFIG_PDA" --url "$FINALIZE_RPC_URL" --output json | node -e '
  let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => {
    const value=JSON.parse(data); process.stdout.write(String(value.account?.owner ?? value.owner ?? ""));
  });
')"
[[ "$CONFIG_OWNER" == "$PROGRAM_ID" ]] || die "Config PDA is not owned by the deployed program"

ROOT="$(repo_root)"
[[ -f "$ROOT/rust/target/idl/charity_vault.json" ]] || die "generated IDL is missing; rebuild before finalization"
( cd "$ROOT/rust" && npm run devnet:init-config -- \
    --treasury "$TREASURY" \
    --wallet "$FINALIZE_WALLET" \
    --rpc "$FINALIZE_RPC_URL" \
    --program-id "$PROGRAM_ID" \
    --evidence "$EVIDENCE_FILE" ) >/dev/null

printf '\nIRREVERSIBLE finalization summary:\n'
info "cluster          : devnet"
info "program id       : $PROGRAM_ID"
info "upgrade authority: $AUTHORITY"
info "treasury         : $TREASURY"
info "config PDA       : $CONFIG_PDA"
info "deployment tx    : $DEPLOYMENT_SIGNATURE"
info "config tx        : $CONFIG_SIGNATURE"
info "smoke tx(s)      : $SMOKE_SIGNATURES"

if [[ "$EXECUTE_FINAL" != "1" ]]; then
  printf '\n'
  ok "all finalization preconditions passed; no transaction was sent"
  info "Review every address and signature, then repeat with --execute --confirm-final $PROGRAM_ID"
  exit 0
fi
[[ "$CONFIRMED_PROGRAM_ID" == "$PROGRAM_ID" ]] || \
  die "--confirm-final must exactly match $PROGRAM_ID"

log "Permanently removing the upgrade authority"
FINAL_OUTPUT="$(solana program set-upgrade-authority "$PROGRAM_ID" \
  --final \
  --upgrade-authority "$FINALIZE_WALLET" \
  --url "$FINALIZE_RPC_URL" \
  --commitment finalized \
  --output json)"
printf '%s\n' "$FINAL_OUTPUT"
FINAL_SIGNATURE="$(printf '%s' "$FINAL_OUTPUT" | node -e '
  let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => {
    const value=JSON.parse(data); process.stdout.write(String(value.signature ?? ""));
  });
')"

PROGRAM_SHOW_AFTER="$(solana program show "$PROGRAM_ID" --url "$FINALIZE_RPC_URL" --output json)"
AFTER_AUTHORITY="$(printf '%s' "$PROGRAM_SHOW_AFTER" | node -e '
  let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => {
    const value=JSON.parse(data); process.stdout.write(String(value.authority ?? value.upgradeAuthority ?? ""));
  });
')"
[[ -z "$AFTER_AUTHORITY" || "$AFTER_AUTHORITY" == "null" ]] || \
  die "finalization transaction returned, but upgrade authority is still $AFTER_AUTHORITY"

EVIDENCE_FILE="$EVIDENCE_FILE" \
FINAL_SIGNATURE="$FINAL_SIGNATURE" \
PROGRAM_SHOW_AFTER="$PROGRAM_SHOW_AFTER" \
node <<'NODE'
const fs = require('node:fs');
const evidencePath = process.env.EVIDENCE_FILE;
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
evidence.finalizationSignature = process.env.FINAL_SIGNATURE || null;
evidence.finalizationExplorer = process.env.FINAL_SIGNATURE
  ? `https://explorer.solana.com/tx/${process.env.FINAL_SIGNATURE}?cluster=devnet`
  : null;
evidence.programShowAfterFinalization = JSON.parse(process.env.PROGRAM_SHOW_AFTER);
evidence.finalizedAt = new Date().toISOString();
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

ok "program is immutable; this cannot be undone"
