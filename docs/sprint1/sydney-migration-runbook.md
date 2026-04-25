# Sydney Migration — Operational Runbook

**Owner:** Lawal
**Status as of 2026-04-26:** Migration not yet executed. Blocked on factors that require operator action (see Blockers section).
**Sprint:** Sprint 1, Section 2.

---

## Project IDs

| Region | Project Ref | URL |
|---|---|---|
| Mumbai (current production source) | `cqwdlimwlnyaaowwcyzp` | `https://cqwdlimwlnyaaowwcyzp.supabase.co` |
| Sydney (target) | `gndnldyfudbytbboxesk` | `https://gndnldyfudbytbboxesk.supabase.co` |

Sydney is the destination because:
- ap-southeast-2 is closer to Australian users (~30ms vs Mumbai's ~140ms RTT from Melbourne).
- Mumbai stays alive as a 7-day safety net before being decommissioned.

---

## Confirmed state (probed 2026-04-26)

- **Sydney REST API:** alive (HTTP 200 on auth, 401 on REST root with apikey acceptable). `public.events` table **does not exist** — schema has not been applied. Sydney is empty.
- **Mumbai REST API:** auth subdomain alive (HTTP 401 on `/auth/v1/health` is expected without apikey), but PostgREST queries against `public.events` return HTTP 522 (Cloudflare connection timeout) on every retry. **Mumbai is likely paused** (Supabase free-tier projects pause after ~7 days of inactivity).
- **`.env.local`:** already overrides Mumbai vars with Sydney vars (lines 6-9 redefine the same keys after Mumbai's at lines 2-4) — last-write-wins in dotenv. **The local app is already pointed at Sydney**, but Sydney has no schema, so the app will be broken locally until the migration completes.
- **Local tooling:** `psql` and `pg_dump` are not installed on this machine. Migration via direct PostgreSQL client tools is not possible from this Git Bash environment without first installing them.
- **Mumbai DB password:** not in `.env.local`. Only `SUPABASE_DB_PASSWORD_SYDNEY` is present.

---

## Blockers

1. **Mumbai project may be paused.** Without unpausing, neither REST nor direct DB connections will succeed. **Action: log into Supabase Studio → cqwdlimwlnyaaowwcyzp → click Resume.**
2. **Mumbai DB password is unknown to this environment.** Supabase only shows the DB password at project creation; retrieving it requires resetting it from Studio (Settings → Database → Reset DB Password). **Action: reset Mumbai DB password and capture it.**
3. **No PostgreSQL client tools locally.** `pg_dump` / `psql` not installed. **Action (only if going Path C): install via `winget install PostgreSQL.PostgreSQL` or use a Linux container.**

---

## Recommended Path — Supabase Studio Backup + Restore (no local tooling required)

This is the lowest-risk path and avoids password-reset cycles.

### Step 1 — Wake Mumbai
1. Open https://supabase.com/dashboard/project/cqwdlimwlnyaaowwcyzp.
2. If prompted, click **Resume** to wake the project.
3. Wait ~60 seconds for PostgREST to come fully online. Verify by running:
   ```bash
   curl -H "apikey: <mumbai-anon-key>" \
     "https://cqwdlimwlnyaaowwcyzp.supabase.co/rest/v1/events?select=id&limit=1"
   ```
   Should return `200` with a JSON array (possibly empty).

### Step 2 — Take a Mumbai backup
1. In Mumbai's Studio, navigate to **Database → Backups** (`/project/cqwdlimwlnyaaowwcyzp/database/backups`).
2. Click **Create new backup** (or use the latest scheduled backup if available — they're free-tier daily).
3. Click the backup → **Download** as a `.sql` file. This contains schema + data.

> If "Backups" is grayed out (free-tier limitation), use Path B (Section "Fallback Paths") below.

### Step 3 — Restore to Sydney
1. Open https://supabase.com/dashboard/project/gndnldyfudbytbboxesk.
2. Navigate to **SQL Editor**.
3. Open the downloaded `.sql` file in a text editor; copy all contents.
4. Paste into the SQL Editor and click **Run**. This applies the full schema and data.
5. Watch for errors. The most common ones:
   - **Extensions:** if `CREATE EXTENSION` fails, enable them via Database → Extensions before re-running.
   - **`auth` schema rows:** Supabase's `auth.users` table is managed; if the dump tries to insert into `auth.users`, you may need to comment those rows out and re-create test users via the Auth UI. Public-schema FK constraints to `auth.users.id` will then resolve as long as you preserve user IDs.
   - **`storage` schema:** storage objects (bucket files) are NOT included in SQL dumps. Use Storage → Migrate (or re-upload) for any production assets.

### Step 4 — Verify row counts
Run these queries against Sydney's SQL Editor and compare to Mumbai's:

```sql
SELECT 'events' AS tbl, count(*) FROM public.events
UNION ALL SELECT 'organisations', count(*) FROM public.organisations
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'tickets', count(*) FROM public.tickets
UNION ALL SELECT 'saved_events', count(*) FROM public.saved_events
UNION ALL SELECT 'ticket_tiers', count(*) FROM public.ticket_tiers
UNION ALL SELECT 'pricing_rules', count(*) FROM public.pricing_rules;
```

Both sides should match. Record the counts in this runbook before proceeding.

| Table | Mumbai count | Sydney count | Match |
|---|---|---|---|
| events | _ | _ | ☐ |
| organisations | _ | _ | ☐ |
| profiles | _ | _ | ☐ |
| tickets | _ | _ | ☐ |
| saved_events | _ | _ | ☐ |
| ticket_tiers | _ | _ | ☐ |
| pricing_rules | _ | _ | ☐ |

### Step 5 — Apply incremental migrations (if any drift)
The `supabase/migrations/` folder contains 5 incremental SQL files:
- `20260412000001_fix_expire_stale_squads_return_type.sql`
- `20260414000001_seed_culturally_relevant_sample_events.sql`
- `20260418000001_add_geo_and_pricing_columns.sql`
- `20260421000001_m5_phase1_personalisation.sql`
- `20260425000001_hot_path_indexes.sql`

If Mumbai's backup was taken before any of these were applied, run the missing ones in Sydney's SQL Editor in timestamp order. If Mumbai is current, no action needed.

---

## Fallback Path — Direct `pg_dump` + `psql` (requires local tooling)

Use this if Supabase backups are unavailable on the free tier.

### Prerequisites
- Install PostgreSQL client tools:
  - **Windows:** `winget install PostgreSQL.PostgreSQL` (puts `psql.exe` and `pg_dump.exe` on PATH).
  - **WSL/Linux:** `sudo apt install postgresql-client-16`.
- Reset both DB passwords in Studio if needed:
  - Mumbai: Settings → Database → Reset DB Password → save value.
  - Sydney: already known — `dQ3U4NKL88bBL9VV`.

### Commands

```bash
# 1. Dump Mumbai (schema + data)
pg_dump \
  --host db.cqwdlimwlnyaaowwcyzp.supabase.co \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --schema public \
  --no-owner \
  --no-acl \
  --file mumbai-dump.sql

# (paste Mumbai DB password when prompted)

# 2. Restore to Sydney
psql \
  --host db.gndnldyfudbytbboxesk.supabase.co \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --file mumbai-dump.sql

# (paste Sydney DB password: dQ3U4NKL88bBL9VV)
```

> Do not commit `mumbai-dump.sql` to git — it contains user data. Add to `.gitignore` if you create it.

---

## Post-Migration: `.env.local` cleanup

Current `.env.local` (lines 1-9) has both Mumbai and Sydney vars; Sydney wins by precedence. Once Sydney is verified live:

```diff
 # Supabase
-NEXT_PUBLIC_SUPABASE_URL=https://cqwdlimwlnyaaowwcyzp.supabase.co
-NEXT_PUBLIC_SUPABASE_ANON_KEY=<mumbai-anon>
-SUPABASE_SERVICE_ROLE_KEY=<mumbai-service-role>
+# Mumbai (decommissioned 2026-05-XX after Sydney verified)
+# NEXT_PUBLIC_SUPABASE_URL=https://cqwdlimwlnyaaowwcyzp.supabase.co
+# NEXT_PUBLIC_SUPABASE_ANON_KEY=<mumbai-anon>
+# SUPABASE_SERVICE_ROLE_KEY=<mumbai-service-role>

 NEXT_PUBLIC_SUPABASE_URL=https://gndnldyfudbytbboxesk.supabase.co
 NEXT_PUBLIC_SUPABASE_ANON_KEY=<sydney-anon>
 SUPABASE_SERVICE_ROLE_KEY=<sydney-service-role>
 SUPABASE_DB_PASSWORD_SYDNEY=dQ3U4NKL88bBL9VV
```

Keep Mumbai vars commented for 7 days as a safety net. After Sydney is confirmed stable in production, remove them entirely.

---

## Vercel Environment Variable Swap

After Sydney is confirmed live with verified row counts:

### Via Vercel Dashboard
1. Go to https://vercel.com/eventlinqs/eventlinqs-app/settings/environment-variables.
2. Edit `NEXT_PUBLIC_SUPABASE_URL`:
   - Production / Preview / Development: replace `https://cqwdlimwlnyaaowwcyzp.supabase.co` → `https://gndnldyfudbytbboxesk.supabase.co`.
3. Edit `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
   - Replace Mumbai anon key with Sydney anon key (full value in `.env.local` line 7).
4. Edit `SUPABASE_SERVICE_ROLE_KEY`:
   - Replace Mumbai service-role with Sydney service-role (full value in `.env.local` line 8).
5. Click **Save** for each.

### Via Vercel CLI (if installed — `npm i -g vercel` if not)
```bash
# Pull current values to compare
vercel env pull .env.vercel.production --environment=production

# Remove old Mumbai entries
vercel env rm NEXT_PUBLIC_SUPABASE_URL production
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env rm SUPABASE_SERVICE_ROLE_KEY production

# Add Sydney entries (paste each value when prompted)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production

# Repeat for preview and development environments

# Trigger a fresh deploy to pick up the new env
vercel --prod
```

### Smoke test after deploy
- Hit the production URL.
- Open homepage — check `ThisWeekStrip` renders with events.
- Open DevTools Network tab — confirm requests go to `gndnldyfudbytbboxesk.supabase.co`.
- Open `/cities/melbourne` (once that route exists) — events render.
- Sign in as a test user — confirm session persists.
- Sentry should be quiet on the deploy (no Supabase connection errors).

---

## Decommission Mumbai (after 7-day safety window)

Earliest date: 2026-05-03 (today + 7 days).

1. Confirm Sydney has been live in production for 7+ days with no Supabase-related Sentry alerts.
2. Confirm Vercel logs show zero traffic to `cqwdlimwlnyaaowwcyzp.supabase.co`.
3. Take one final Mumbai backup → save off-Vercel (e.g., to local archive `archive/mumbai-final-backup-2026-05-XX.sql`).
4. In Supabase Studio for Mumbai → Settings → General → Pause project. Wait one more week to be safe.
5. After total confidence: Settings → General → Delete project.

---

## Why this runbook exists in this form

The original Sprint 1 plan called for in-session migration via Supabase MCP. The available MCP is read-only and locked to Mumbai, and the Mumbai project is currently paused, so neither in-session schema dump nor in-session row migration can be executed safely from the assistant's environment. The operator-led runbook above is the responsible alternative — it preserves the Mumbai safety net, requires no destructive credentials in chat, and lets Lawal verify each step against Studio's UI.
