#!/usr/bin/env bash
# Alias for the Docker development stack on this branch.
set -euo pipefail
exec "$(dirname "$0")/up.sh" "$@"
