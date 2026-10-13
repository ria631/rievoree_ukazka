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

# The leads table legitimately allows anonymous INSERT with check (true); that
# is an append-only contact form, not tenant data. Allowlist it explicitly.
# (If the only hit is leads.sql, treat as pass.)
if [ "$status" -eq 1 ] && [ -z "$(echo "$hits" | grep -v 'leads.sql' || true)" ]; then
  echo "  (only the allowlisted leads INSERT — OK)"
  status=0
fi

exit $status
