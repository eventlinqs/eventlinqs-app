#!/usr/bin/env bash
#
# Types-drift guard.
#
# Regenerates src/types/database.ts from the live Supabase schema and
# diffs against the committed copy, excluding the legacy-aliases
# appendix (everything from the first '// BEGIN LEGACY ALIASES' line
# onwards). Exits 0 when in sync, exits 1 with a diff when drifted.
#
# Used by .github/workflows/ci.yml > types-drift-guard so a migration
# that lands on the live DB without a corresponding regen of the
# committed types fails CI immediately, instead of silently waiting
# for a runtime error in a server-component render to surface it.
#
# Local usage:  bash scripts/check-types-drift.sh
# Requires:     supabase login (locally) OR SUPABASE_ACCESS_TOKEN env (CI)

set -euo pipefail

PROJECT_ID="${SUPABASE_PROJECT_ID:-gndnldyfudbytbboxesk}"
COMMITTED="src/types/database.ts"
MARKER="// BEGIN LEGACY ALIASES"

if [[ ! -f "$COMMITTED" ]]; then
  echo "[types-drift] FAIL: $COMMITTED not found (run from repo root)"
  exit 1
fi

if ! grep -q "$MARKER" "$COMMITTED"; then
  echo "[types-drift] FAIL: '$MARKER' marker missing from $COMMITTED."
  echo "[types-drift] The appendix-strip step has nothing to anchor on; either restore the marker or remove this guard."
  exit 1
fi

# Strip the legacy-aliases appendix from the committed file so the diff
# only covers the auto-generated section.
COMMITTED_TRIMMED=$(mktemp)
trap 'rm -f "$COMMITTED_TRIMMED" "$GENERATED" 2>/dev/null || true' EXIT
awk -v m="$MARKER" 'index($0, m) > 0 { exit } { print }' "$COMMITTED" > "$COMMITTED_TRIMMED"

# Generate fresh types from the live DB.
GENERATED=$(mktemp)
GEN_LOG=$(mktemp)
if ! npx --yes supabase gen types --lang=typescript --project-id "$PROJECT_ID" > "$GENERATED" 2>"$GEN_LOG"; then
  echo "[types-drift] FAIL: 'supabase gen types' could not reach the live DB."
  echo "[types-drift] In CI: ensure repository secret SUPABASE_ACCESS_TOKEN is set."
  echo "[types-drift] Locally: run 'npx supabase login' once."
  echo "[types-drift] --- gen-types stderr ---"
  cat "$GEN_LOG" | head -20
  rm -f "$GEN_LOG"
  exit 1
fi
rm -f "$GEN_LOG"

# Drift?
if diff -q "$GENERATED" "$COMMITTED_TRIMMED" > /dev/null 2>&1; then
  echo "[types-drift] OK: $COMMITTED generated section matches the live schema."
  exit 0
fi

# Drift detected. Fail loudly with the actionable diff.
echo "[types-drift] FAIL: $COMMITTED is out of date with the live database schema."
echo "[types-drift]"
echo "[types-drift] The committed generated section (above the BEGIN LEGACY ALIASES marker)"
echo "[types-drift] does not match the types regenerated from project $PROJECT_ID."
echo "[types-drift]"
echo "[types-drift] To resolve locally:"
echo "[types-drift]   1. Run: npx supabase gen types --lang=typescript --project-id $PROJECT_ID > /tmp/db.new"
echo "[types-drift]   2. Replace lines 1 through (BEGIN LEGACY ALIASES) in $COMMITTED with /tmp/db.new"
echo "[types-drift]   3. Re-run: bash scripts/check-types-drift.sh"
echo "[types-drift]   4. Update any consuming code surfaced by 'npx tsc --noEmit'"
echo "[types-drift]"
echo "[types-drift] --- first 60 lines of diff (committed -> generated) ---"
diff "$COMMITTED_TRIMMED" "$GENERATED" | head -60
exit 1
