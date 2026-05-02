# Phase A1 - Admin Foundation - Scope

**Track:** A (Admin Panel)
**Phase:** A1
**Owner:** Session 3 - admin-marketing
**Branch:** feat/m7-admin-panel
**Status:** Active
**Date opened:** 2026-05-02
**Predecessor:** None (first admin phase)
**Successor (gated):** Phase A2 - Organiser Management

---

## 1. Why this phase, why now

EventLinqs is on a 4-6 week path to nationwide-Australia launch supporting thousands of organisers and tens of thousands of concurrent ticket buyers. Every operational lever the founder will need on launch day must exist before launch day. Phase A1 lays the load-bearing foundation: an authenticated, role-aware, audit-logged admin surface with a real shell, a real dashboard, and the schema all later phases bolt onto.

We do this once. We do it right. No prototype scaffolding, no "minimal viable" placeholders. The admin panel is operational infrastructure, not a demo.

## 2. Out of scope (explicit)

These belong to later phases or other sessions and MUST NOT be touched in A1:

- Organiser moderation queues and KYC review (Phase A2)
- Event content moderation (Phase A3)
- Per-region fee config, refund authorisation, dispute oversight (Phase A4)
- Support ticket tooling (Phase A5)
- Stripe Connect code, payments, webhooks (Session 1 Backend ownership)
- Observability backends, rate limiting infra, email transport (Session 2 Hardening ownership)
- Marketing surface polish (Track B)

If a deliverable below seems to require any of the above, it stops at the integration-point boundary and surfaces a `[COORDINATION]` line in `docs/sessions/admin-marketing/progress.log`.

## 3. Deliverables

### 3.1 Schema migrations (admin-only)

A new forward-only migration `supabase/migrations/20260502_admin_foundation.sql` introduces:

| Table | Purpose | Key columns |
|---|---|---|
| `admin_users` | Source of truth for admin access | `id` (uuid pk = `auth.users.id`), `role` (enum: super_admin, admin, support, moderator), `display_name`, `totp_secret_encrypted` (nullable), `totp_enrolled_at`, `totp_recovery_codes_hashed` (jsonb), `last_login_at`, `last_login_ip`, `disabled_at`, `created_at`, `updated_at`, `created_by` (fk admin_users.id, nullable) |
| `admin_invites` | Pre-account invitation tokens for new admins | `id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`, `accepted_by`, `created_by`, `revoked_at`, `created_at` |
| `audit_log` | Append-only record of every admin action | `id` (bigint pk), `actor_id` (uuid, fk auth.users.id, nullable for system actors), `actor_email_snapshot` (text - frozen at write time), `actor_role_snapshot` (text), `action` (text - dotted namespace e.g. `admin.org.tier.update`), `target_type` (text, nullable), `target_id` (text, nullable), `metadata` (jsonb default `{}`), `ip` (inet, nullable), `user_agent` (text, nullable), `created_at` (timestamptz default now()) |

RLS:

- `admin_users`: enabled. SELECT - allowed for any authenticated admin (lookup by `auth.uid() in (select id from admin_users where disabled_at is null)`). INSERT/UPDATE/DELETE - service role only (server actions go through admin client).
- `admin_invites`: enabled. SELECT/INSERT/UPDATE/DELETE - service role only.
- `audit_log`: enabled. SELECT - any active admin with role in (super_admin, admin, support). INSERT - service role only. UPDATE/DELETE - denied to all (append-only).

Indexes:

- `admin_users(role) where disabled_at is null`
- `admin_invites(email) where accepted_at is null and revoked_at is null`
- `audit_log(actor_id, created_at desc)`
- `audit_log(target_type, target_id, created_at desc)`
- `audit_log(action, created_at desc)`
- `audit_log(created_at desc)` for global feed

Migration is forward-only and idempotent at the DDL level. It does NOT seed any admin user; the founder bootstraps via a one-off SQL script run from PowerShell with `supabase db push --linked`. **The actual `supabase db push --linked` call is a founder action; this session prepares the migration file and surfaces it as a `[COORDINATION]` entry.**

### 3.2 Admin auth + RBAC + 2FA scaffolding

New module: `src/lib/admin/`.

| File | Responsibility |
|---|---|
| `auth.ts` | `getAdminSession()` server-side: looks up the current `auth.users` session, joins to `admin_users`, returns `{ user, admin, role }` or null. Throws on disabled accounts. |
| `rbac.ts` | Role hierarchy + `canActOn(role, capability)` predicate. Capabilities are typed (`'audit.read'`, `'orgs.suspend'`, `'finance.refund'`, etc). Single source of truth that all UI and API will reference. Phase A1 only ships `'audit.read'`, `'admin.dashboard.view'`, `'admin.invites.manage'`. Later phases extend. |
| `audit.ts` | `recordAuditEvent(action, target, metadata)` - server-only helper that resolves actor from session and writes through the admin Supabase client. Captures IP and user-agent from Next request headers. Never throws to caller (audit failures are logged separately via Sentry hook stub - actual Sentry wired in Session 2). |
| `totp.ts` | Wraps `otpauth` for TOTP secret generation, QR provisioning URI, code verification, and recovery-code generation/verify. Uses `AES-256-GCM` with key from `ADMIN_TOTP_ENC_KEY` env var to encrypt secrets at rest. |
| `session-timeout.ts` | Constant export `ADMIN_SESSION_INACTIVITY_MS = 4 * 60 * 60 * 1000` and middleware-callable check. |

Route protection:

- New file `src/middleware.ts` (or extension of existing if present): all `/admin/*` routes require an active admin session. Unauthenticated → redirect to `/admin/login`. Authenticated but not in `admin_users` → 403. 2FA not enrolled → forced enrolment page. Idle > 4 hours → soft-logout with re-auth prompt.

API-side guards:

- New helper `withAdminAuth(capability)` wrapping route handlers in `src/app/api/admin/**`. Auto-records audit on success and on 403.

### 3.3 Admin shell layout

New layout tree under `src/app/admin/`:

```
src/app/admin/
  layout.tsx          - root admin layout, mounts shell, enforces auth
  page.tsx            - /admin (dashboard)
  audit/
    page.tsx          - /admin/audit (read-only viewer)
  login/
    page.tsx          - /admin/login (separate from /auth/login)
  enrol-2fa/
    page.tsx          - first-login 2FA enrolment
```

New components in `src/components/admin/`:

| Component | Purpose |
|---|---|
| `admin-shell.tsx` | The frame: sidebar + topbar + main slot + breadcrumbs. Dark mode default. |
| `admin-sidebar.tsx` | Persistent left sidebar. Sections: Dashboard, Organisers, Events, Financials, Support, Audit, Settings. Active-route highlighting. Collapsible to icon-only on narrow desktops. |
| `admin-topbar.tsx` | Global search input (placeholder for A2+; shows disabled-with-tooltip in A1), notifications bell (count badge, opens panel), profile menu (sign out, switch account, settings). |
| `admin-breadcrumbs.tsx` | Renders from page metadata. |
| `admin-stat-tile.tsx` | The numeric tile primitive used by the dashboard. Shows label, large number, optional delta vs previous period, optional click-through. |
| `admin-empty-state.tsx` | Used in audit/orgs/etc when no data. |
| `admin-table.tsx` | Headless table primitive used by audit log viewer. Sortable columns, sticky header, responsive collapse to row-cards on tablet view. |

Visual standard:

- Dark mode default, `--admin-bg: #0A0F1A` (deeper than ink-900 to set admin apart from public canvas)
- Surface cards on `--admin-surface: #131A2A`
- Borders `--admin-border: rgba(255,255,255,0.08)`
- Brand accents reuse public gold/coral tokens
- Touch targets 44px+ even on desktop (operations team may use tablets in the field)
- All interactive elements have `:focus-visible` ring in `--gold-400`
- WCAG 2.2 AA contrast verified at all contrast pairs

A1 is desktop-first. Sidebar collapses to a slide-over on viewports < 1024px. The shell is responsive but the dashboard tiles assume desktop work patterns.

Reference designs (study, never copy): Stripe Dashboard, Linear admin pages, Vercel project dashboard, Supabase Studio.

### 3.4 Admin dashboard (`/admin`)

Real-time numeric tiles only. Charts arrive in Phase A4.

| Tile | Source | Update cadence |
|---|---|---|
| GMV today | `select sum(gross_total) from orders where status='confirmed' and created_at::date = current_date` (in payment currency, AUD canonical) | 60s revalidate |
| GMV this week | rolling 7-day window | 60s |
| GMV this month | rolling 30-day window | 60s |
| New organisers today | `count(*) from organisations where created_at::date = current_date` | 60s |
| KYC queue depth | `count(*) from organisations where kyc_status in ('pending','submitted') and stripe_account_id is not null` (column names verified against M6 schema before query writes) | 30s |
| Pending refund requests | `count(*) from refund_requests where status = 'requested'` (table presence verified; if absent in current schema, tile shows "Not yet wired - Session 1") | 60s |
| Active disputes | `count(*) from stripe_disputes where status in ('warning_needs_response','needs_response')` (same caveat) | 60s |
| Failed payouts | `count(*) from payouts where status = 'failed'` (same caveat) | 60s |
| System health row | Three sub-tiles: Stripe API latency (read from observability table when Session 2 lands; in A1 shows "Pending Session 2"), Supabase response time (measured by a probe RPC), Redis health (same caveat as Stripe) | 30s |

Each tile is a server-rendered React Server Component fetching only its own data. Suspense-streamed so a slow tile cannot block the others. No charts, no graphs, no fancy animation - this is a glanceable ops console.

Where a data source is not yet provisioned, the tile renders a clearly-labelled placeholder with the Session that owns it (`Session 1` or `Session 2`). This avoids fake numbers and signals the integration boundary cleanly.

### 3.5 Audit log viewer (`/admin/audit`)

Read-only. Filterable by:

- Date range (default: last 7 days)
- Actor (text search by email)
- Action namespace (multi-select - populated from distinct values)
- Target type (multi-select)

Pagination: cursor-based, 50 rows per page. Sticky header. Sortable by `created_at` only (audit log ordering is sacred).

Empty state copy follows brand voice:

> No actions match these filters. Try widening the date range or clearing one of the active filters.

Each row exposes a JSON-detail drawer with the full `metadata` jsonb formatted, `ip`, `user_agent`, and a permanent link to the row by id.

### 3.6 First-run bootstrap

A one-time SQL script `supabase/scripts/admin/bootstrap-super-admin.sql` (NOT a migration; lives outside `migrations/` and is not auto-applied):

```sql
-- Run once from PowerShell with the founder's auth.users.id as $1
insert into public.admin_users (id, role, display_name)
values ($1, 'super_admin', 'Lawal Adams')
on conflict (id) do update set role = excluded.role;
```

Founder action required to run this against Sydney. Surfaced in coordination notes.

### 3.7 Audit-log call sites

A1 records audit events for:

- `admin.session.login.success`
- `admin.session.login.failure`
- `admin.session.logout`
- `admin.totp.enrolled`
- `admin.totp.recovery_used`
- `admin.invite.created`
- `admin.invite.accepted`
- `admin.invite.revoked`
- `admin.audit.viewed` (lightweight: fires on filter changes that materially alter result set)

All other action namespaces are reserved for A2-A5.

### 3.8 Quality gates (pre-commit)

The following must pass on every commit in this phase:

- `npm run lint` - zero new errors, zero new warnings introduced by phase code
- `npx tsc --noEmit` - zero errors
- `npm run build` - success, no new warnings
- `npm test` - all tests green; M6 Phase 2 tests must remain green

For UI: Lighthouse and axe runs on `/admin/login` (the only public-reachable admin route). Other admin routes are noindex'd and exempt from public Lighthouse - this mirrors the M6 dashboard caveat documented in `docs/m6/audit/phase2/closure-report.md`.

### 3.9 Visual regression

- Screenshots at 7 viewports (320, 375, 414, 768, 1024, 1280, 1920) of: `/admin/login`, `/admin/enrol-2fa`, `/admin` dashboard, `/admin/audit`
- Stored under `docs/admin-marketing/phase-a1/audit/screenshots/`
- Capture requires a running dev or preview server. If the PowerShell-only dev server is not running at gate time, this becomes a `[COORDINATION]` item rather than blocking the phase.

### 3.10 Documentation

Closure deliverable `docs/admin-marketing/phase-a1/closure-report.md` must contain:

- What shipped (commit list)
- Schema diff applied vs proposed
- Audit-log call sites verified
- Quality gate results (with dates)
- Visual regression results (or `[COORDINATION]` flag)
- Known follow-ups for A2 onward
- Founder action items still open

Progress log appended at every meaningful commit to `docs/sessions/admin-marketing/progress.log` with one-line summaries.

## 4. File ownership confirmation

This session owns every file written in A1:

- `src/app/admin/**` ✓
- `src/app/api/admin/**` ✓ (none created in A1; reserved for A2)
- `src/components/admin/**` ✓
- `src/lib/admin/**` ✓
- `supabase/migrations/20260502_admin_foundation.sql` ✓ (admin-only migration)
- `supabase/scripts/admin/bootstrap-super-admin.sql` ✓
- `docs/admin-marketing/phase-a1/**` ✓
- `docs/sessions/admin-marketing/progress.log` ✓

No files outside this list are touched. If any cross-session file (e.g. `src/types/database.ts`, `next.config.ts`) needs an edit, it lands in a separate `[SHARED]` commit and the session pauses for project manager confirmation.

## 5. Performance posture

`/admin/*` routes are private and noindex'd; they are not on the Lighthouse public-route gate. They are still expected to feel fast: dashboard initial paint < 1s on staging, audit-log filter response < 250ms median.

## 6. Brand voice

Even on private surfaces, voice rules apply: no em-dashes, no en-dashes, no exclamation marks, no `diaspora`, Australian English. Empty states use plain, helpful copy. Tile labels use sentence case.

## 7. Coordination items expected at gate

These are anticipated `[COORDINATION]` entries that the project manager will route:

- C-A1-01: Founder runs `supabase db push --linked` against Sydney to apply the admin migration
- C-A1-02: Founder runs `bootstrap-super-admin.sql` to seed their own super_admin row
- C-A1-03: Founder provisions `ADMIN_TOTP_ENC_KEY` (32-byte base64) in Vercel env vars across preview and production
- C-A1-04: Session 2 (hardening) wires Sentry hook used by `audit.ts` failure path
- C-A1-05: Session 1 (backend) confirms `refund_requests`, `stripe_disputes`, `payouts` table names so dashboard tile queries can be unstubbed (or A1 documents the stubs and unblocks A2)
- C-A1-06: Visual regression screenshots when dev/preview server is reachable

## 8. Definition of done for A1

- All deliverables in section 3 shipped on `feat/m7-admin-panel`
- Quality gates green
- Closure report complete
- `[GATE]` posted to progress log
- Session STOPS and awaits project manager review before A2
