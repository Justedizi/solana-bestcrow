#!/usr/bin/env bash
# Bring up a local Solana network for Bestcrow and point the CLI at it.
#
#   scripts/localnet.sh up        start surfpool (background), configure CLI, airdrop
#   scripts/localnet.sh deploy    build + deploy both programs to localnet
#   scripts/localnet.sh down      stop the surfpool instance this script started
#   scripts/localnet.sh status    show RPC, wallet, balances, program ids
#
# Uses a dedicated local payer keypair, never the user's Phantom wallet.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUST="$ROOT/rust"
RPC="http://127.0.0.1:8899"
PAYER="$RUST/target/deploy/local-payer.json"
PIDFILE="$RUST/target/deploy/surfpool.pid"
LOG="$RUST/target/deploy/surfpool.log"
BESTCROW_ID="$(cd "$RUST" && NO_DNA=1 anchor keys list 2>/dev/null | awk -F': ' '/bestcrow/{print $2}')"

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
require surfpool; require solana; require solana-keygen

ensure_payer() {
  [ -f "$PAYER" ] || solana-keygen new --no-bip39-passphrase --silent -o "$PAYER"
  solana config set --keypair "$PAYER" >/dev/null
}

cmd_up() {
  ensure_payer
  if curl -s -o /dev/null --max-time 2 "$RPC"; then
    echo "surfpool already running on $RPC"
  else
    echo "starting surfpool (offline, no auto-deploy; log: $LOG)"
    # --offline: pure local chain (no mainnet fork stall).
    # --no-deploy: skip the interactive program picker (fails without a TTY).
    cd "$RUST"
    NO_DNA=1 surfpool start --offline --no-deploy --no-tui --no-studio --port 8899 \
      --airdrop-keypair-path "$PAYER" --airdrop-amount 100000000000 \
      >"$LOG" 2>&1 &
    disown || true
    for _ in $(seq 1 30); do
      curl -s -o /dev/null --max-time 2 "$RPC" && break
      sleep 1
    done
    curl -s -o /dev/null --max-time 2 "$RPC" || { echo "surfpool did not come up; see $LOG" >&2; exit 1; }
    pgrep -f 'surfpool start' | tail -1 >"$PIDFILE" || true
  fi
  solana config set --url "$RPC" >/dev/null
  solana airdrop 100 2>/dev/null || true
  echo "localnet ready: RPC=$RPC payer=$(solana address) balance=$(solana balance 2>/dev/null || echo 0)"
}

cmd_deploy() {
  ensure_payer
  solana config set --url "$RPC" >/dev/null
  ( cd "$RUST" && NO_DNA=1 anchor build --no-idl -- --arch v0 \
      && NO_DNA=1 anchor deploy --provider.cluster localnet --provider.wallet "$PAYER" )
  echo "bestcrow program id: $BESTCROW_ID"
}

cmd_down() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "stopped surfpool"
  else
    echo "no pidfile; stop surfpool manually if it is running"
  fi
}

cmd_status() {
  echo "RPC    : $(solana config get | awk '/RPC URL/{print $3}')"
  echo "wallet : $(solana address 2>/dev/null || echo '?')"
  echo "balance: $(solana balance --url "$RPC" 2>/dev/null || echo 'unreachable')"
  echo "bestcrow id: $BESTCROW_ID"
}

case "${1:-}" in
  up) cmd_up ;;
  deploy) cmd_deploy ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "usage: $0 {up|deploy|down|status}" >&2; exit 1 ;;
esac
