#!/usr/bin/env bash
set -u

files=(
  tests/simulation.test.ts
  tests/physics.test.ts
  tests/roster.test.ts
  tests/test-lab.test.ts
)
failed=0
for file in "${files[@]}"; do
  printf '\n=== TEST_SERIAL %s ===\n' "$file"
  if ! npx vitest run "$file" --reporter=dot; then
    printf 'TEST_SERIAL_FAIL %s\n' "$file"
    failed=1
  else
    printf 'TEST_SERIAL_PASS %s\n' "$file"
  fi
done
if (( failed )); then
  exit 1
fi
printf '\nTEST_SERIAL_PASS all=%s\n' "${#files[@]}"
