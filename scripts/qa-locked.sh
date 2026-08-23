#!/usr/bin/env bash
set -euo pipefail

ROOT="/root/workspace/tactical-kickoff"
LOCK_PATH="/tmp/tactical-kickoff-simulation-qa.lock"

actual_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ "$actual_root" != "$ROOT" ]]; then
  printf 'BLOCKER: QA must run from canonical workspace %s (got %s)\n' "$ROOT" "$actual_root" >&2
  exit 74
fi

exec 9>"$LOCK_PATH"
if ! flock -n 9; then
  printf 'BLOCKED: another tactical-kickoff simulation QA is already running (lock: %s)\n' "$LOCK_PATH" >&2
  exit 73
fi

printf 'QA_LOCK_ACQUIRED pid=%s root=%s seeds=%s\n' "$$" "$ROOT" "${QA_SEEDS:-100}"
exec vite-node scripts/simulation-qa.ts
