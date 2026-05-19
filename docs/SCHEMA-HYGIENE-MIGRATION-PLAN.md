# Schema Hygiene Migration Plan

Status: DRAFT FOR FOUNDER REVIEW. Not applied. Authored autonomously
(Tab B, branch `autonomous/schema-hygiene-draft`).

- Forward: `supabase/migrations/20260520000001_schema_hygiene.sql`
- Rollback: `supabase/migrations/20260520000001_schema_hygiene_ROLLBACK.sql`
- Closes: P1-1 through P1-11, P3-6, P3-7, P3-9, P4-6

This migration must not be edited once committed; it is the artefact the
founder reviews. Any required change is a follow-up migration.

---

## 0. Live schema verification (Jaguar criterion 9)

Before authoring, the live Sydney project (`gndnldyfudbytbboxesk`) was
introspected read-only via the Supabase MCP (no writes, no
`apply_migration`). Verified and matched against the migration history:

- Money columns are `integer`; `currency` defaults `'AUD'`.
- `squads_leader_user_id_fkey` = `ON DELETE CASCADE`, `leader_user_id`
  is `NOT NULL`.
- `pricing_rules_created_by_fkey` = NO ACTION (no `ON DELETE`).
- `orders.reservation_id` and `squads.reservation_id` have **no FK**.
- `idx_orders_order_number` is a plain duplicate of the UNIQUE index
  `orders_order_number_key`.
- `idx_payments_idempotency` is non-unique.
- `pricing_rules` SELECT policy qual is `true`; `squads` SELECT policy
  qual is `true`; `payouts` / `payout_holds` /
  `organiser_balance_ledger` member policies have no role filter;
  `waitlist` org policy is owner-only.

Row counts (data-conversion risk basis):

| Table | Rows | Integrity pre-checks |
|---|---:|---|
| orders | 0 | neg cents 0, non-AUD 0, reservation orphans 0 |
| order_items | 0 | neg cents 0 |
| payments | 0 | duplicate idempotency keys 0 |
| discount_codes | 0 | non-positive values 0 |
| squads | 0 | reservation orphans 0 |
| squad_members | 0 | - |
| reservations | 8 | - |
| waitlist | 0 | - |
| payout_holds | 0 | - |
| pricing_rules | 59 | non-whole fixed/integer values 0 |

Every transactional table is empty, so at the current snapshot the
data-conversion risk is effectively nil. The migration is still written
defensively (NOT VALID/VALIDATE, idempotent guards) because it may be
applied later when these tables hold production data.

---

## 1. Every change, with rationale

### P1-1 - pricing_rules RLS (security)
Replaces the blanket `USING (true)` SELECT policy with two policies:
region-default rows (`organisation_id IS NULL`) stay world-readable
(public fee transparency); per-org override rows are visible only to the
owning organisation's owner or a member with `owner/admin/manager`.
Server-side fee calculation uses the service role (its FOR ALL policy is
untouched), so pricing math is unaffected.

### P1-2 - financial ledger member policies (security)
`payouts`, `payout_holds`, `organiser_balance_ledger` member SELECT
policies previously matched ANY membership row, so a low-privilege
`member` could read the organisation's money. Adds
`role IN ('owner','admin','manager')`. Owner policies unchanged.
Observed but out of stated scope: `tier_progression_log` has the same
unfiltered member policy. Left untouched to respect scope; flagged here
for a founder decision on a follow-up.

### P1-3 - money columns INT4 -> BIGINT (correctness)
`orders` (7 cents columns), `order_items` (2), `payments.amount_cents`
widened to BIGINT. INT4 caps at ~21.4M dollars per field; festival-scale
gross would overflow. Widening is non-destructive; defaults / NOT NULL
preserved.

### P1-4 - discount_codes.discount_value split (correctness)
The single `NUMERIC(10,2)` column overloaded "percentage 1..100" and
"fixed cents", disambiguated only by `discount_type`. Split into
`discount_amount_cents BIGINT` and `discount_percentage NUMERIC(5,2)`,
data migrated by `discount_type`, the old value CHECK replaced by a
split-aware CHECK, and the legacy column dropped.
`discount_codes_currency_check` is independent and left intact.

### P1-4b - pricing_rules.value whole-number guard (correctness)
The audit line "ALTER pricing_rules.value to integer cents where
appropriate" is intentionally NOT executed as a column type change.
`pricing_rules.value` is polymorphic: it stores percentages (2.5000),
fixed cents (30) and integer enum codes (1, 3), keyed by `value_type`.
Casting to integer would corrupt every percentage rule. The honest
hygiene intent - no stray fractional digits on money/integer rows - is
enforced with `CHECK (value_type = 'percentage' OR value = trunc(value))`.
Percentage rows keep full NUMERIC precision. **Founder decision point:**
accept the guard, or specify a different intent for this line.

### P1-5 - non-negative cents CHECK (correctness)
Whole-row `>= 0` CHECK on every `orders` / `order_items` cents column.
`discount_cents` stores the positive reduction amount, so `>= 0` is
correct for all of them. NOT VALID then VALIDATE.

### P1-6 - squads.leader_user_id FK CASCADE -> SET NULL (data safety)
Deleting a leader's auth user currently cascade-deletes the squad and
its booking history. Changed to SET NULL. Because the column is
`NOT NULL`, the NOT NULL constraint is also dropped (a nulled leader is
the SET NULL target).

### P1-7 - squads RLS USING(true) -> leader+member (security)
Any anonymous client could read every squad. Replaced with leader OR
member scope. Guest share-token reads are server-side via the service
role (unchanged), so the share-link join flow is preserved.

### P1-8 - pricing_rules.created_by FK -> SET NULL (data safety)
Was NO ACTION: an admin auth user could not be deleted while historical
pricing rows referenced them. `created_by` is nullable; SET NULL keeps
the pricing history.

### P1-9 - indexes (performance)
Adds partial indexes on `orders.discount_code_id`,
`tickets.ticket_tier_id`, `squad_members.order_id` (unindexed FKs / hot
lookups).

### P1-10 - updated_at audit column (auditability)
Adds `updated_at` + the canonical `set_updated_at` trigger
(`public.update_updated_at()`) to `order_items`, `reservations`,
`squads`, `squad_members`, `waitlist`, `payout_holds`. Added nullable,
backfilled to `created_at` (truthful history) before the trigger exists,
then promoted to `NOT NULL DEFAULT NOW()`.

### P1-11 - waitlist org-view parity (security/consistency)
Owner-only org policy brought to parity with `orders`: owner OR member
with `owner/admin/manager`.

### P3-6 - drop redundant idx_orders_order_number (hygiene)
`order_number` is UNIQUE (`orders_order_number_key` already indexes it).
The plain duplicate index is removed; this *is* the DB-level
order_number uniqueness enforcement (it was always present via the
UNIQUE constraint - the finding is the redundant second index).

### P3-7 - payments.idempotency_key UNIQUE (correctness)
`idempotency_key` is NOT NULL but was not unique, so a retried gateway
call could create a duplicate payment row. Promoted the plain index to a
UNIQUE index: idempotency is now enforced at the DB level.

### P3-9 - reservation_id FKs (referential integrity)
`orders.reservation_id` and `squads.reservation_id` had no FK at all.
Added FK -> `reservations(id) ON DELETE SET NULL`, each column indexed.
Zero orphans confirmed, so VALIDATE is safe.

> Note on P3-6/7/9: the exact P3 finding text was not present in the
> worktree. These three are the evidence-based interpretations of "P3
> fixes that need schema (e.g. order_number uniqueness)" - each is
> low-risk, individually reversible, and itemised here for explicit
> per-item founder confirmation before apply.

### P4-6 - orders.currency = 'AUD' guard (correctness, v1)
v1 is AU-only. CHECK rejects any non-AUD order. Removable when
multi-currency lands (rollback drops it).

---

## 2. Risk assessment

| Change | Class | Risk on a populated table |
|---|---|---|
| P1-3 INT4->BIGINT | type widening | Low. Non-destructive; brief table rewrite/lock proportional to size. |
| P1-4 discount_value split | data conversion | Medium. Backfill is by `discount_type`; the legacy column is dropped (irreversible without the rollback). Validate the split CHECK before apply. |
| P1-4b pricing_rules guard | additive CHECK | Low. 0 offending rows now; NOT VALID/VALIDATE. |
| P1-5 non-negative CHECK | additive CHECK | Low. NOT VALID/VALIDATE; 0 offenders. |
| P4-6 currency CHECK | additive CHECK | Low now (0 non-AUD); blocks future non-AUD writes by design. |
| P1-1/2/7/11 RLS | policy swap | Low schema risk; behavioural - tightens read access. Verify org dashboards still read what they should post-apply. |
| P1-6 squads FK + DROP NOT NULL | FK + nullability | Low (empty). DROP NOT NULL is hard to reverse if NULLs are written post-apply. |
| P1-8 created_by FK | FK delete-rule | Low. SET NULL on a nullable column. |
| P3-9 reservation_id FKs | new FK | Low. 0 orphans; NOT VALID/VALIDATE. |
| P1-9 / P3-9 indexes | additive index | Low. `IF NOT EXISTS`. |
| P3-6 drop dup index | drop index | Low. UNIQUE index still enforces uniqueness. |
| P3-7 idempotency UNIQUE | uniqueness | Medium on a populated table: apply FAILS if duplicate keys exist (0 now). A failure here is desirable - it surfaces a real bug rather than hiding it. |
| P1-10 updated_at | additive column | Low. Nullable->backfill->NOT NULL; backfill precedes trigger. |

Pure-additive (no data-conversion risk): P1-9, P3-9 indexes, P1-10
columns, P1-4b/P1-5/P4-6 CHECKs, all RLS policy swaps.
Data-conversion / destructive: P1-3 (rewrite), P1-4 (legacy column
drop), P1-6 (DROP NOT NULL), P3-6 (drop index), P3-7 (uniqueness can
reject).

Rollback caveats: BIGINT->INTEGER narrowing is unsafe if a value
exceeding INT4 max was written post-apply; re-imposing NOT NULL on
`squads.leader_user_id` / `discount_codes.discount_value` fails if a
NULL was written post-apply. Both are non-issues at the empty-table
draft snapshot and are documented in the rollback header.

---

## 3. Order of operations (within the forward migration)

Single `BEGIN; ... COMMIT;` transaction:

1. P1-3 money widening (foundation; CHECKs added next sit on BIGINT).
2. P1-5 non-negative cents CHECKs.
3. P4-6 currency guard.
4. P1-4 discount_codes split (add cols -> backfill -> swap CHECK ->
   drop legacy col), then P1-4b pricing_rules guard.
5. P1-1 pricing_rules RLS, P1-8 created_by FK.
6. P1-2 ledger/payout policies, P1-11 waitlist policy.
7. P1-6 squads FK + nullability, P1-7 squads RLS.
8. P3-9 reservation_id FKs.
9. P1-9 + P3-9 indexes; P3-6 drop dup index; P3-7 idempotency UNIQUE.
10. P1-10 updated_at columns + triggers.

Backfills always precede the trigger/constraint that would otherwise
interfere (e.g. updated_at backfill runs before the BEFORE UPDATE
trigger is created).

---

## 4. Recommended rollout

1. Founder reviews this plan and the SUMMARY checklist; per-item sign
   off, especially P1-4b, P1-7 (behavioural), P3-6/7/9 (interpreted).
2. From the worktree that owns `supabase/migrations/**`, on PowerShell:
   ```powershell
   supabase db push --linked --include-all
   ```
   `--include-all` is required: per the migration runbook, `db push`
   only applies migrations present in the working tree and silently
   no-ops otherwise. Confirm the CLI lists `20260520000001` as applied.
3. `npm run db:types` to regenerate `src/types/database.ts` ([SHARED] /
   Session 2 owned - coordinate before merge).
4. Run the post-apply MCP verification checklist (section 5).
5. If apply fails: run
   `20260520000001_schema_hygiene_ROLLBACK.sql` manually (it is
   suffixed so `db push` ignores it), then investigate.

Do NOT apply via Dashboard SQL editor or MCP `apply_migration` (MCP is
read-only permanently, per CLAUDE.md).

---

## 5. Post-apply MCP verification checklist

Read-only MCP `execute_sql` against `gndnldyfudbytbboxesk` (same pattern
as the pricing_rules / refunds verification). Expected results in
brackets.

1. Money columns are BIGINT:
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema='public'
     AND ((table_name='orders' AND column_name LIKE '%_cents')
       OR (table_name='order_items' AND column_name IN ('unit_price_cents','total_cents'))
       OR (table_name='payments' AND column_name='amount_cents'))
   ORDER BY 1,2;
   ```
   [every `data_type` = `bigint`]

2. discount_codes split landed, legacy column gone:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='discount_codes'
     AND column_name IN ('discount_value','discount_amount_cents','discount_percentage');
   ```
   [`discount_amount_cents`, `discount_percentage` only - no
   `discount_value`]

3. Constraints present and validated (`convalidated = true`):
   ```sql
   SELECT conname, convalidated FROM pg_constraint
   WHERE conname IN ('orders_cents_non_negative','order_items_cents_non_negative',
     'orders_currency_aud_only','discount_codes_value_split_check',
     'pricing_rules_whole_fixed_value_check','orders_reservation_id_fkey',
     'squads_reservation_id_fkey','pricing_rules_created_by_fkey');
   ```
   [8 rows, all `convalidated = t`]

4. FK delete rules:
   ```sql
   SELECT conname, confdeltype FROM pg_constraint
   WHERE conname IN ('squads_leader_user_id_fkey','pricing_rules_created_by_fkey',
     'orders_reservation_id_fkey','squads_reservation_id_fkey');
   ```
   [`squads_leader_user_id_fkey` confdeltype = `n` (SET NULL);
   `pricing_rules_created_by_fkey` = `n`; both reservation FKs = `n`]

5. RLS posture:
   ```sql
   SELECT tablename, policyname, cmd, qual FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('pricing_rules','squads','payouts','payout_holds',
       'organiser_balance_ledger','waitlist')
   ORDER BY 1,2;
   ```
   [no `qual = true` SELECT policy on `pricing_rules` or `squads`;
   ledger/payout member policies contain
   `role = ANY ('{owner,admin,manager}')`; waitlist org policy contains
   an `organisation_members` branch]

6. Indexes:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE schemaname='public' AND indexname IN
     ('idx_orders_discount_code','idx_tickets_ticket_tier','idx_squad_members_order',
      'idx_orders_reservation','idx_squads_reservation','idx_orders_order_number',
      'idx_payments_idempotency','idx_payments_idempotency_key_uniq');
   ```
   [present: the five new indexes + `idx_payments_idempotency_key_uniq`;
   absent: `idx_orders_order_number`, `idx_payments_idempotency`]

7. updated_at + triggers on the six tables:
   ```sql
   SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgname='set_updated_at'
     AND c.relname IN ('order_items','reservations','squads','squad_members','waitlist','payout_holds')
   ORDER BY 1;
   ```
   [all six rows present; cross-check each table now has an `updated_at`
   column via information_schema]

8. squads.leader_user_id is now nullable:
   ```sql
   SELECT is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='squads' AND column_name='leader_user_id';
   ```
   [`YES`]

Any deviation from the bracketed expectation = stop, do not proceed to
merge, run the rollback and re-assess.
