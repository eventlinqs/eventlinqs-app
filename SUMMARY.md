# SUMMARY - Schema Hygiene Migration Draft

Branch: `autonomous/schema-hygiene-draft` (base: `feat/ticketing-v1-steps-5-6` @ `08a3688`)
Mode: AUTONOMOUS BATCH (Tab B). DRAFT ONLY - not applied, not pushed.

Revision 2: the three previously-flagged items are now RESOLVED BY
RESEARCH (industry/Stripe/Postgres/Supabase/OWASP best practice), not
left as founder decisions, per the founder rule update.

## P-IDs closed by this migration

| ID | Fix |
|---|---|
| P1-1 | pricing_rules RLS: region-default rows public, per-org override rows scoped to owning org owner OR member with owner/admin/manager |
| P1-2 | organiser_balance_ledger / payouts / payout_holds / **tier_progression_log** member SELECT policies gain `role IN ('owner','admin','manager')` filter |
| P1-3 | orders (7 cents cols), order_items (2), payments.amount_cents: INT4 -> BIGINT |
| P1-4 | discount_codes.discount_value split into discount_amount_cents BIGINT + discount_percentage NUMERIC(5,2); migrated by discount_type; legacy column dropped |
| P1-4b | pricing_rules.value split into value_percentage NUMERIC(7,4) + value_cents BIGINT + value_integer INTEGER (industry-standard tagged-union split); 59 rows migrated by value_type; strict CHECK; legacy column dropped |
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

## Files created / modified

- `supabase/migrations/20260520000001_schema_hygiene.sql` - forward migration (DRAFT, NOT applied)
- `supabase/migrations/20260520000001_schema_hygiene_ROLLBACK.sql` - reverse migration (`_ROLLBACK` suffix keeps it out of the `db push` set)
- `docs/SCHEMA-HYGIENE-MIGRATION-PLAN.md` - rationale per P-ID, section 0b "Research resolutions" (cited URLs), risk assessment, order of operations, rollout (incl. Pricing Service coordination prerequisite), post-apply MCP verification checklist
- `SUMMARY.md` - this file

No application code touched. No shared files touched. MCP used read-only only (schema conflict check + data-distribution checks).

## Resolved items (formerly flagged)

### Item 1 - pricing_rules.value polymorphic column -> RESOLVED: typed split
Industry standard is a typed split, not a polymorphic column:
- Stripe Coupon stores `amount_off` (integer minor units) and `percent_off` (float) as separate mutually-exclusive fields - https://docs.stripe.com/api/coupons/object
- Postgres tagged-union standard = one typed column per variant + type tag + CHECK - https://www.cybertec-postgresql.com/en/conditional-foreign-keys-polymorphism-in-sql/
- Money as bigint minor units or NUMERIC, never float - https://www.crunchydata.com/blog/working-with-money-in-postgres
- PCI DSS governs cardholder data, not amount representation; integer-minor-units is the applicable amount standard.
Action taken: replaced the CHECK-only draft with a three-column split
(`value_percentage NUMERIC(7,4)`, `value_cents BIGINT`, `value_integer
INTEGER`). `value` is genuinely three-way (verified live: 26 pct rows
max 20.0000 scale 4; 16 fixed 20..10000; 17 integer 1..3); the audit's
literal `NUMERIC(5,4)` would overflow 20.0000, so `NUMERIC(7,4)` is the
data-correct precision. Recommendation: ship the split; it is the
documented industry pattern and removes the last polymorphic column.

### Item 2 - P3-6/7/9 interpretations -> RESOLVED: all confirmed correct
- P3-6 redundant index: PostgreSQL auto-creates a unique index for a UNIQUE constraint; a second manual index is redundant - https://www.postgresql.org/docs/current/indexes-unique.html. Implementation correct, unchanged.
- P3-7 idempotency uniqueness: Stripe requires idempotency keys be sufficiently unique to identify one operation; UNIQUE enforces it, a plain index does not - https://docs.stripe.com/api/idempotent_requests. Implementation correct, unchanged.
- P3-9 FK referential integrity: a foreign key is the standard Postgres referential-integrity mechanism; an untyped UUID with no FK is a gap - https://www.postgresql.org/docs/current/ddl-constraints.html. Implementation correct, unchanged.

### Item 3 - RLS least-privilege + tier_progression_log -> RESOLVED: confirmed + extended
- Supabase: grant only the permissions each role needs; restrict to what is necessary - https://supabase.com/docs/guides/database/postgres/row-level-security
- OWASP Top 10 2021 A01 Broken Access Control = #1 web vuln class (94% of apps) - https://owasp.org/Top10/A01_2021-Broken_Access_Control/
Action taken: P1-1 / P1-7 tightening confirmed correct (no founder
decision). The same `role IN ('owner','admin','manager')` filter is now
also applied to `tier_progression_log` (folded into P1-2), since it
shared the identical pattern smell. Informational, not actioned: a
repo-wide `TO <role>` clause hardening pass is recommended separately to
the project manager (the existing schema uses none).

## Jaguar 9-criterion self-audit result

1. Idempotency - PASS (IF [NOT] EXISTS, DROP-then-ADD, info_schema-guarded type changes, column-existence-guarded backfills for both discount_value and pricing_rules.value)
2. FK explicit ON DELETE - PASS (all in-scope FKs -> SET NULL)
3. Constraint validation - PASS (NOT VALID then VALIDATE on populated tables incl. the 59-row pricing_rules split CHECK; plain ADD on empty tables)
4. Money fields BIGINT cents - PASS (all *_cents + discount_amount_cents + pricing_rules.value_cents BIGINT; percentages NUMERIC, never float)
5. Audit fields - PASS (updated_at added where missing)
6. RLS minimum privilege - PASS (P1-1/2/7/11 + tier_progression_log; Supabase + OWASP cited)
7. Indexes - PASS (P1-9 + new FK columns indexed; redundant index removed)
8. Stripe alignment - N/A (no Stripe-facing schema; money columns are internal ledger fields)
9. Schema conflict check via MCP - PASS (live Sydney project introspected read-only; zero drift; row counts + value distribution captured for risk basis)

## Founder review checklist (before any push or apply)

- [ ] Confirm (not decide) the research resolutions in plan section 0b - all three were settled by cited best practice
- [ ] COORDINATION PREREQUISITE: P1-4 + P1-4b drop `discount_codes.discount_value` and `pricing_rules.value`. The Pricing Service (`src/lib/services/pricing.ts` + pricing-rules read path) and any discount_codes consumer must be updated to read the new typed columns, landed in the same coordinated change-set as this migration + `npm run db:types`. Notify the project manager (cross-session [SHARED]).
- [ ] Confirm P1-7 / P1-1 behavioural tightening: anon clients can no longer read squads / per-org pricing overrides directly; guest squad-share and fee calc use the service role server-side (verify those paths do not use the anon client for those reads)
- [ ] Confirm P4-6 AUD-only guard acceptable for the current v1 window
- [ ] Review rollback caveats (BIGINT->INT narrowing; NOT NULL re-imposition incl. pricing_rules.value) in the rollback header and plan section 2
- [ ] Apply path: `supabase db push --linked --include-all` from PowerShell in the migrations-owning worktree, then `npm run db:types` ([SHARED]), then run the post-apply MCP verification checklist (plan section 5)

## Gates run (revision 2)

- `npx tsc --noEmit` - sanity only (migration is .sql, not .ts)
- `npm run lint`
- `npm test` (vitest)

See the commit for gate results. This draft must not be modified once
the resolution is committed; further corrections are a follow-up
migration.
