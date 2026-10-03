#!/usr/bin/env bash
# Start the Bestcrow v2 API and Pass/Fail frontend. No program is deployed here.
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose --profile backend --profile frontend up --build backend frontend
