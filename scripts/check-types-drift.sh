#!/usr/bin/env bash
#
# Types-drift guard - entry point.
#
# The logic moved to scripts/ci/types-drift-guard.mjs on 16 August 2026. This
# file stays because .github/workflows/ci.yml > types-drift-guard invokes it by
# name, and because a guard's entry point is exactly the wrong thing to rename
# in the same change that alters what it decides.
#
# WHAT CHANGED, in one line: the guard used to ask "does the committed types
# file equal the live schema?", which reported PENDING MIGRATIONS (expected,
# correct) and STALE TYPES (a defect) as the same failure with the same remedy,
# and that remedy destroys correct work in the first case. It now tells them
# apart. The full reasoning is at the top of scripts/ci/types-drift-analyse.mjs.
#
# Exit 0 = in sync, OR every difference is explained by a migration committed
#          here and not yet applied to the target (named in the output).
# Exit 1 = at least one difference is not explained. That is drift.
#
# Local usage:  bash scripts/check-types-drift.sh
# Requires:     SUPABASE_ACCESS_TOKEN (CI and local). `npx supabase login` alone
#               is enough to GENERATE types but not to list applied migrations,
#               which is what distinguishes pending from stale.

set -euo pipefail

exec node scripts/ci/types-drift-guard.mjs
