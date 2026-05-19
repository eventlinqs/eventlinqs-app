# SUMMARY - Schema Hygiene Migration Draft

Branch: `autonomous/schema-hygiene-draft` (base: `feat/ticketing-v1-steps-5-6` @ `08a3688`)
Mode: AUTONOMOUS BATCH (Tab B). DRAFT ONLY - not applied, not pushed.

## P-IDs closed by this migration

| ID | Fix |
|---|---|
| P1-1 | pricing_rules RLS: region-default rows public, per-org override rows scoped to owning org owner OR member with owner/admin/manager |
| P1-2 | organiser_balance_ledger / payouts / payout_holds member SELECT policies gain `role IN ('owner','admin','manager')` filter |
| P1-3 | orders (7 cents cols), order_items (2), payments.amount_cents: INT4 -> BIGINT |
| P1-4 | discount_codes.discount_value split into discount_amount_cents BIGINT + discount_percentage NUMERIC(5,2); data migrated by discount_type; legacy column dropped |
| P1-4b | pricing_rules.value: whole-number CHECK for fixed/integer rows (NOT a destructive type change - see plan for rationale; founder decision point) |
| P1-5 | non-negative CHECK on all orders / order_items cents columns (NOT VALID then VALIDATE) |
| P1-6 | squads.leader_user_id FK CASCADE -> SET NULL (+ DROP NOT NULL, required for SET NULL) |
| P1-7 | squads RLS: USING(true) replaced with leader + member scope |
| P1-8 | pricing_rules.created_by FK -> ON DELETE SET NULL |
| P1-9 | indexes on orders.discount_code_id, tickets.ticket_tier_id, squad_members.order_id |
| P1-10 | updated_at + set_updated_at trigger on order_items, reservations, squads, squad_members, waitlist, payout_holds |
| P1-11 | waitlist org-view policy gains organisation_members parity |
| P3-6 | drop redundant idx_orders_order_number (UNIQUE orders_order_number_key already enforces DB-level uniqueness) |
| P3-7 | payments.idempotency_key promoted to UNIQUE index (true DB-level idempotency) |
| P3-9 | orders.reservation_id + squads.reservation_id missing FK -> reservations ON DELETE SET NULL, each indexed |
| P4-6 | orders.currency CHECK = 'AUD' (v1 single-currency guard) |

## Files created

- `supabase/migrations/20260520000001_schema_hygiene.sql` - forward migration (DRAFT, NOT applied)
- `supabase/migrations/20260520000001_schema_hygiene_ROLLBACK.sql` - reverse migration (`_ROLLBACK` suffix keeps it out of the `db push` set)
- `docs/SCHEMA-HYGIENE-MIGRATION-PLAN.md` - rationale per P-ID, risk assessment, order of operations, rollout, post-apply MCP verification checklist
- `SUMMARY.md` - this file

No application code touched. No shared files touched. No DB writes (MCP used read-only for the schema conflict check only).

## Jaguar 9-criterion self-audit result

1. Idempotency - PASS (IF [NOT] EXISTS, DROP-then-ADD, info_schema-guarded type changes, column-existence-guarded backfill)
2. FK explicit ON DELETE - PASS (all in-scope FKs -> SET NULL)
3. Constraint validation - PASS (NOT VALID then VALIDATE on populated tables; plain ADD on empty tables)
4. Money fields BIGINT cents - PASS
5. Audit fields - PASS (updated_at added where missing)
6. RLS minimum privilege - PASS (P1-1/2/7/11)
7. Indexes - PASS (P1-9 + new FK columns indexed; redundant index removed)
8. Stripe alignment - N/A (no Stripe-facing schema in this migration)
9. Schema conflict check via MCP - PASS (live Sydney project introspected read-only; zero drift; row counts captured for risk basis)

## Founder review checklist (before any push or apply)

- [ ] Confirm P3-6/P3-7/P3-9 interpretations match the real audit finding text (the P3 finding text was not in the worktree; these are evidence-based, each itemised in the plan)
- [ ] Confirm P1-4b approach: whole-number CHECK guard instead of a destructive `pricing_rules.value` type change (percentage precision would be lost by a literal type change)
- [ ] Confirm P1-7 behavioural change: anonymous clients can no longer read squads directly; guest share-token reads must remain server-side via the service role (verify the squad share-link flow does not use the anon client for the squad row read)
- [ ] Confirm P1-1 behavioural change: per-org pricing overrides no longer world-readable; verify no anon/public path depends on reading org-override pricing rows directly (service-role fee calc is unaffected)
- [ ] Decide on out-of-scope sibling: `tier_progression_log` has the same unfiltered member policy as the P1-2 tables (left untouched to respect scope)
- [ ] Confirm P4-6 AUD-only guard is acceptable for the current v1 window (it will block any non-AUD order until removed)
- [ ] Review rollback caveats (BIGINT->INT narrowing; NOT NULL re-imposition) in the rollback file header and plan section 2
- [ ] Apply path: `supabase db push --linked --include-all` from PowerShell in the migrations-owning worktree, then `npm run db:types` ([SHARED] - coordinate), then run the post-apply MCP verification checklist (plan section 5)

## Gates run

- `npx tsc --noEmit` - sanity only (migration is .sql, not .ts)
- `npm test`

See the commit for gate results. This draft must not be modified once committed; corrections are a follow-up migration.
