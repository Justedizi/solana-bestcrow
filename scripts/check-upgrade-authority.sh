#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <program-id> <rpc-url-or-cluster> <expected-authority-or-none>" >&2
  exit 2
fi

program_id="$1"
cluster="$2"
expected="$3"

solana program show "$program_id" --url "$cluster" --output json |
  python3 -c '
import json, sys
data = json.load(sys.stdin)
actual = data.get("authority")
expected = None if sys.argv[1].lower() == "none" else sys.argv[1]
program_id = data.get("programId", "unknown")
actual_text = actual if actual is not None else "none"
expected_text = expected if expected is not None else "none"
print(f"Program: {program_id}")
print(f"Upgrade authority: {actual_text}")
if actual != expected:
    print(f"Expected: {expected_text}", file=sys.stderr)
    sys.exit(1)
' "$expected"
