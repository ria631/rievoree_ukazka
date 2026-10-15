#!/usr/bin/env bash
# Migration-safety scanner (PLAN.md §9). Fails CI if a policy ships a "fake RLS"
# USING (true) / WITH CHECK (true) escape hatch. Comments (-- …) are ignored, so
# the migrations that merely MENTION the rule in prose still pass.
set -euo pipefail

dir="supabase/migrations"
status=0

# Strip line comments, then look for an unrestricted policy predicate.
hits=$(grep -rniE '(using|with check)[[:space:]]*\([[:space:]]*true[[:space:]]*\)' "$dir" \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*--' || true)

if [ -n "$hits" ]; then
  echo "✗ migration-safety: unrestricted RLS predicate found (using/with check (true)):"
  echo "$hits"
  status=1
else
  echo "✓ migration-safety: no fake-RLS predicates"
fi

# Two tables legitimately allow anonymous INSERT with check (true): both are
# append-only visitor forms (leads = contact email, tour_feedback = 👍/👎 + note),
# with NO select policy, so nothing is readable back through the API — not
# tenant data. Allowlist exactly those files; any other hit still fails.
ALLOW='leads.sql|tour_feedback.sql'
if [ "$status" -eq 1 ] && [ -z "$(echo "$hits" | grep -vE "$ALLOW" || true)" ]; then
  echo "  (only the allowlisted append-only visitor INSERTs: leads, tour_feedback — OK)"
  status=0
fi

exit $status
