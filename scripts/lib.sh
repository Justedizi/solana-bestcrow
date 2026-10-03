#!/usr/bin/env bash
# Shared helpers for the Bestcrow scripts. Source this, do not execute it.

set -euo pipefail

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''
fi

log()  { printf '%s\n' "${C_CYAN}=>${C_RESET} $*"; }
info() { printf '%s\n' "   $*"; }
ok()   { printf '%s\n' "${C_GREEN}ok${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YELLOW}warn${C_RESET} $*" >&2; }
die()  { printf '%s\n' "${C_RED}error${C_RESET} $*" >&2; exit 1; }

script_dir() { cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd; }
repo_root()  { cd -- "$(script_dir)/.." && pwd; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# upsert_env <file> <KEY> <VALUE>
# Sets KEY=VALUE in a dotenv-style file, replacing an existing uncommented line.
upsert_env() {
  local file="$1" key="$2" value="$3"
  [[ -f "$file" ]] || : > "$file"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    # Portable in-place edit without sed -i portability headaches.
    local tmp; tmp="$(mktemp)"
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[[:space:]]*${key}= ]]; then
        printf '%s=%s\n' "$key" "$value"
      else
        printf '%s\n' "$line"
      fi
    done < "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
