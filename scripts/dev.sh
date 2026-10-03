#!/usr/bin/env bash
# Run the full Bestcrow demo stack: backend indexer/API + Next.js frontend.
#
# Usage:
#   scripts/dev.sh [--no-install]
#
# Opens:
#   frontend  http://localhost:3000
#   backend   http://localhost:4000/api/health
#
# Press Ctrl-C to stop both processes.

set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ROOT="$(repo_root)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
DO_INSTALL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-install) DO_INSTALL=0; shift ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd node
require_cmd npm

# ----------------------------------------------------------------------------
# Env files
# ----------------------------------------------------------------------------
for pair in "frontend:$FRONTEND" "backend:$BACKEND"; do
  name="${pair%%:*}"; dir="${pair#*:}"
  if [[ ! -f "$dir/.env" && ! -f "$dir/.env.local" ]]; then
    if [[ -f "$dir/.env.example" ]]; then
      if [[ "$name" == "frontend" ]]; then cp "$dir/.env.example" "$dir/.env.local"; else cp "$dir/.env.example" "$dir/.env"; fi
      info "created $name env from .env.example"
    fi
  fi
done

# ----------------------------------------------------------------------------
# Dependencies
# ----------------------------------------------------------------------------
if [[ "$DO_INSTALL" == "1" ]]; then
  [[ -d "$BACKEND/node_modules" ]] || ( log "Installing backend deps"; cd "$BACKEND" && npm install )
  [[ -d "$FRONTEND/node_modules" ]] || ( log "Installing frontend deps"; cd "$FRONTEND" && npm install )
fi

# ----------------------------------------------------------------------------
# Launch
# ----------------------------------------------------------------------------
pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

log "Starting backend  (http://localhost:4000)"
( cd "$BACKEND" && npm run dev ) &
pids+=("$!")

log "Starting frontend (http://localhost:3000)"
( cd "$FRONTEND" && npm run dev ) &
pids+=("$!")

printf '\n'
ok "Demo stack running. Open http://localhost:3000"
info "backend health: http://localhost:4000/api/health"
info "Ctrl-C to stop"
printf '\n'

wait
