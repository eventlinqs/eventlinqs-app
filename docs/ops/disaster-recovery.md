# EventLinqs Disaster Recovery Procedure

**Owner:** Lawal Adams (lawaladams9@gmail.com)
**Last updated:** 2026-04-25
**Status:** Friends-launch readiness baseline. Re-test every 90 days.

This document tells whoever is on-call — usually Lawal — how to recover
EventLinqs from the five failure modes most likely to hit production
between now and a million users. Each section has a trigger, a decision
tree, and step-by-step commands. Follow them. Do not improvise.

---

## 0. Before You Do Anything

1. **Breathe.** Stripe, Supabase, and Vercel hold the money, the data,
   and the DNS. None of those are lost. Most incidents are recoverable
   in under 20 minutes.
2. **Declare the incident** in your own channel (even if you are alone):
   timestamp, what you saw, what you think is broken. This is your log.
3. **Freeze new deploys.** If the suspect change came from a recent
   deploy, roll it back first (Section 4), investigate second.
4. **Communicate.** Post on the status page / Instagram / site banner
   the moment you have > 5 minutes of confirmed downtime. Attendee
   trust > heroics.

---

## 1. Supabase Is Down (Database / Auth Unreachable)

**Symptoms:** API routes 5xx on any DB read; login fails; `getUser`
returns null for every request.

### Step 1 — Confirm it is Supabase, not us.

Visit <https://status.supabase.com>. If the region
(ap-southeast-2 / us-east-1) is red, proceed to Step 2.

If Supabase is green, the issue is our client. Check Vercel function
logs for `[supabase]` errors — expired service role key, exhausted
connection pool, or a migration that left a table locked.

### Step 2 — Enable maintenance banner.

```bash
# In Vercel dashboard, set env var:
# NEXT_PUBLIC_MAINTENANCE=true
# Redeploy. The site header reads this and renders a banner pointing to
# the status page.
```

### Step 3 — Monitor, do not thrash.

Supabase regional outages typically resolve in 15–60 minutes. Do not
migrate, do not re-point. Wait for green.

### Step 4 — Post-incident.

Write a one-paragraph summary in `docs/ops/incident-log.md`. Include
start time, end time, root cause per Supabase status page, and user
impact (login failures, checkout failures, data loss — hopefully none).

---

## 2. Stripe Is Down or Webhooks Are Failing

**Symptoms:** Checkout page loads but payment submission hangs; orders
stuck in `pending_payment`; webhook log shows > 5 retries on any event.

### Step 1 — Check Stripe status.

<https://status.stripe.com>. If red, wait. Do not accept payments
outside Stripe — that path leads to compliance hell.

### Step 2 — If webhooks alone are the issue.

1. In Stripe Dashboard → Developers → Webhooks, inspect the recent
   deliveries. Look for 307 (should be fixed after commit 046bbbf),
   401 (missing STRIPE_WEBHOOK_SECRET), or 5xx (code bug).
2. If the endpoint is returning 5xx, redeploy the last known-good
   commit (Section 4).
3. Use Stripe CLI to replay missed events:

   ```bash
   stripe events resend evt_XXX --webhook-endpoint we_XXX
   ```

### Step 3 — Stuck orders.

Orders in `pending_payment` that Stripe reports as `succeeded` but we
missed: run the reconciliation admin tool (to be built) or manually mark
via admin SQL:

```sql
-- Only after confirming in Stripe Dashboard that payment succeeded.
UPDATE orders
SET status = 'paid', stripe_payment_intent_id = $1
WHERE id = $2 AND status = 'pending_payment';
```

---

## 3. Accidental Data Loss (Wrong UPDATE / DELETE)

**Symptoms:** A migration or ad-hoc SQL wiped or mangled rows.

### Step 1 — Stop writes.

Put the site into maintenance (Section 1, Step 2) so further writes
don't overwrite the recovery window.

### Step 2 — Use Supabase Point-in-Time Recovery.

Supabase Pro and above retain PITR for 7 days by default. From the
dashboard:

1. Project → Database → Backups → Point-in-Time Recovery.
2. Pick the timestamp *1 minute before* the bad query.
3. Restore into a **new branch**. Never restore over production.
4. Spot-check the affected table in the restored branch.
5. Export the affected rows (pg_dump or dashboard CSV export) and
   re-import into production.

**Do not** revert the whole database unless you have lost all data and
the damage window is < 1 hour. Full reverts lose every legitimate
write that happened after the bad query.

### Step 3 — Post-mortem.

Write up what query ran, who ran it, what guardrails would have caught
it (RLS policy, migration review, staging dry-run). Add the guardrail.

---

## 4. Bad Deploy (Regression Just Went Live)

**Symptoms:** A page that worked 10 minutes ago now 500s or looks
broken.

### Step 1 — Instant rollback in Vercel.

1. Vercel Dashboard → Deployments.
2. Find the last deployment with a green "Current" badge before the
   bad one.
3. Click the three-dot menu → "Promote to Production".
4. Verify the rollback in incognito.

This takes < 60 seconds. It is the fastest possible recovery. Always
do this before debugging.

### Step 2 — Fix forward.

Once rolled back, debug locally:

```bash
git checkout <bad-sha>
npm run build
# reproduce the issue locally
```

Fix the root cause, push a new commit, let CI pass, redeploy.

### Step 3 — Document.

Add a regression test if one was missing. Update this runbook if the
symptoms caught you by surprise.

---

## 5. Migration Rollback (Tested Procedure)

**Symptoms:** A Supabase migration introduced a breaking schema change.

### Principle

We don't mutate history. Every migration is additive; a "rollback" is a
new migration that undoes the last one.

### Tested rollback — index migration

On 2026-04-25 we added `20260425000001_hot_path_indexes.sql`. The
rollback script:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_rollback_hot_path_indexes.sql
DROP INDEX IF EXISTS idx_events_status_visibility_start;
DROP INDEX IF EXISTS idx_events_country_start;
DROP INDEX IF EXISTS idx_events_category_start;
DROP INDEX IF EXISTS idx_events_is_free_start;
```

### General procedure

1. Open the offending migration file.
2. Identify every `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`,
   `ADD COLUMN`, `ADD CONSTRAINT` it introduced.
3. Write the inverse (`DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, etc.)
   in a new migration file with the current timestamp prefix.
4. Dry-run against a Supabase branch first. Verify no data loss.
5. Merge. Supabase applies it to production.

**Never** delete or rename a merged migration file. It breaks the
migration history of every teammate and every environment.

---

## 6. Backups

| Asset            | Where                   | Cadence        | Retention |
| ---------------- | ----------------------- | -------------- | --------- |
| Supabase DB      | Managed backup + PITR   | Continuous     | 7 days    |
| Migrations       | Git (`supabase/migrations/`) | Per commit | Forever   |
| Env vars         | Vercel dashboard        | Set manually   | N/A       |
| Event images     | Supabase Storage        | Continuous     | Forever   |

Before every risky migration: verify PITR is enabled on the Supabase
project. Without it, Step 3.2 above is impossible.

---

## 7. Contact Tree

| Role                     | Contact                                    |
| ------------------------ | ------------------------------------------ |
| On-call (always)         | Lawal Adams — lawaladams9@gmail.com        |
| Stripe support           | <https://support.stripe.com>               |
| Supabase support         | <https://supabase.com/dashboard/support>   |
| Vercel support           | <https://vercel.com/help>                  |
| Domain / DNS (Squarespace)| Squarespace Help → Domains                |

---

## 8. Review Schedule

- Re-test Section 4 (rollback) after every 5 deploys or every 2 weeks,
  whichever comes first.
- Re-read this doc end-to-end the first week of every quarter.
- Update after every real incident — add the symptoms you actually saw,
  not just what you think you would see.
