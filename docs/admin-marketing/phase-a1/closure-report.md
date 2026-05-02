# Phase A1 - Admin Foundation - Closure Report

**Track:** A (Admin Panel)
**Phase:** A1
**Owner:** Session 3 - admin-marketing
**Branch:** feat/m7-admin-panel
**Status:** Code complete, awaiting project manager review
**Date closed:** 2026-05-02
**Predecessor:** None
**Successor (gated):** Phase A2 - Organiser Management

---

## 1. What shipped

A1 lays the operational foundation for every later admin phase. The deliverables map back to scope §3 one for one.

### 1.1 Schema (scope §3.1)

`supabase/migrations/20260502000002_admin_foundation.sql`

- `admin_role` enum: super_admin, admin, support, moderator
- `admin_users` table: pk = auth.users.id, role, display_name, totp_secret_encrypted, totp_enrolled_at, totp_recovery_codes_hashed (jsonb array), last_login_at, last_login_ip, disabled_at, created_at, updated_at, created_by
- `admin_invites` table: id, email (citext), role, token_hash, expires_at, accepted_at, accepted_by, revoked_at, created_by, created_at
- `audit_log` table: BIGSERIAL pk, actor_id, actor_email_snapshot, actor_role_snapshot, action, target_type, target_id, metadata jsonb, ip inet, user_agent, created_at
- RLS enabled on all three; SELECT policies for any active admin row; mutations restricted to service role; audit_log explicitly append-only (no UPDATE or DELETE policy granted)
- Indexes: `admin_users(role) where disabled_at is null`; `admin_invites(email) where accepted_at is null and revoked_at is null`; `audit_log(actor_id, created_at desc)`; `audit_log(target_type, target_id, created_at desc)`; `audit_log(action, created_at desc)`; `audit_log(created_at desc)`
- `updated_at` trigger on admin_users

Bootstrap script: `supabase/scripts/admin/bootstrap-super-admin.sql` - one-shot INSERT...ON CONFLICT seeding the founder as super_admin once auth.users row exists.

The migration has NOT been applied. Founder applies via `supabase db push --linked` from PowerShell on the local repo - C-A1-01.

### 1.2 RBAC and capabilities (scope §3.2)

`src/lib/admin/rbac.ts`

- AdminCapability union (4 capabilities A1 actually uses): admin.dashboard.view, admin.audit.read, admin.invites.manage, admin.profile.read
- ROLE_CAPABILITIES map binds each role to its capability set; super_admin and admin get all four; support drops invites.manage; moderator gets dashboard + profile only
- `hasCapability()` and `assertCapability()` helpers
- `AdminForbiddenError` for capability gate failures
- `ROLE_LABELS` map for UI display

### 1.3 Auth + session (scope §3.2)

`src/lib/admin/auth.ts`

- `getAdminSession()` reads the auth.users session via the SSR Supabase client, then resolves the admin_users row through the service-role client; returns null if no session, no admin row, or admin disabled
- `requireAdminSession()` throws AdminUnauthorisedError when no session
- `AdminUnauthorisedError` exported

`src/lib/admin/session-timeout.ts`

- `ADMIN_SESSION_INACTIVITY_MS` = 4 hours
- `ADMIN_ACTIVITY_COOKIE` constant
- `isAdminSessionFresh()` predicate

### 1.4 2FA primitives (scope §3.2)

`src/lib/admin/totp.ts`

- RFC 6238 TOTP from scratch using node:crypto HMAC-SHA1, 30-second step, 6 digits
- `generateTotpSecret(label)` returns `{ secretBase32, otpauthUri }`
- `verifyTotp(code, secret, nowMs?, windowSteps?)` with default ±1 step drift tolerance
- `generateRecoveryCodes()` produces 10 plain codes + 10 scrypt-hashed codes
- `verifyRecoveryCode(code, hashed)` with timingSafeEqual comparison; case- and hyphen-insensitive
- `base32Encode` / `base32Decode` helpers

`src/lib/admin/encryption.ts`

- AES-256-GCM helpers via node:crypto
- `encryptString` / `decryptString` round-trip; format base64(iv || tag || ciphertext)
- Key sourced from `ADMIN_TOTP_ENC_KEY` env var; 32-byte base64 preferred, scrypt fallback for dev
- C-A1-03 documents env var generation and rotation

QR rendering is intentionally out of A1; the enrolment page surfaces the otpauth:// URI as text plus the base32 secret. Modern authenticators accept either path. C-A1-02.

### 1.5 Audit-log writer + reader (scope §3.4)

`src/lib/admin/audit.ts`

- `recordAuditEvent({ action, targetType?, targetId?, metadata?, session })` writes a row with actor + email + role snapshot + IP (x-forwarded-for / x-real-ip) + user-agent; failures are swallowed (Sentry hook lands in Session 2 hardening - C-A1-04)
- `recordAnonAuditEvent({ action, actorEmail, ... })` for failed-login + pre-session events
- `queryAuditLog({ fromIso?, toIso?, actorEmail?, actions?, targetTypes?, cursor?, limit? })` returns `{ rows, nextCursor }` with cursor pagination by id desc; default page size 50, max 200

Reserved action namespaces (in code): admin.session.login.{success,failure}, admin.session.logout, admin.totp.enrolled, admin.totp.recovery_used, admin.invite.{created,accepted,revoked}, admin.dashboard.view, admin.audit.viewed.

### 1.6 Admin shell (scope §3.3)

`src/components/admin/admin-shell.tsx` + `admin-sidebar.tsx` + `admin-topbar.tsx` + `admin-stat-tile.tsx`

- Dark frame: bg #0A0F1A, surface #131A2A, border rgba(255,255,255,0.08); responsive flex layout
- Sidebar: capability-gated NAV items; "Soon" badge for routes belonging to later A-phases (Organisers, Events, Financials, Support, Settings)
- Topbar: disabled search placeholder ("coming in A2"), notifications bell stub, profile pill with display_name + role label + initials avatar in brand accent
- AdminStatTile primitive: label / value / hint / status dot (ok / warn / pending) for the dashboard

### 1.7 Login page (scope §3.2)

`src/app/admin/login/page.tsx` + `login-form.tsx` + `src/app/admin/actions.ts`

- Email + password + 6-digit code form; "use recovery code" toggle for break-glass
- Server action `loginAdminAction` performs: signInWithPassword -> admin_users lookup -> 2FA verification (skipped on first login when not enrolled) -> last_login_at update -> audit event -> redirect
- Failed attempts at every stage write `admin.session.login.failure` with stage tag
- `safeNext()` rejects open-redirect attempts; only paths starting with `/admin` are honoured
- `logoutAdminAction` server action records `admin.session.logout` and signs out

### 1.8 2FA enrolment (scope §3.2)

`src/app/admin/(authed)/enrol-2fa/page.tsx` + `enrol-form.tsx`

- Reached automatically after the first successful login of an unenrolled admin
- Two-step UX:
  1. Show base32 secret + otpauth URI; prompt user to add to authenticator
  2. Verify a fresh 6-digit code; on success, save encrypted secret + 10 scrypt-hashed recovery codes; display recovery codes ONCE for out-of-band capture
- `prepareTotpEnrolmentAction` issues an enrolment token (encrypted JSON containing the candidate secret) with a 10-minute expiry; this lets the verify step use the same secret without re-issuing
- Re-entry refused once enrolled; redirected to /admin

### 1.9 Dashboard (scope §3.4)

`src/app/admin/(authed)/page.tsx`

- Three sections: GMV (today / week / month), Queues (new organisers, KYC depth, pending refunds, pending disputes), System health (Stripe / Supabase / Redis pending Session 2)
- Each tile is a Suspense-wrapped async server component; a slow tile cannot block the others
- GMV tiles aggregate orders.total_amount_cents where status='confirmed' AND currency='AUD' (multi-currency surfaced in A4)
- KYC queue counts organisations.payout_status in (on_hold, restricted)
- Defensive try/catch in every tile - missing or schema-drifted tables render `value="-"` with `status="warn"` and a hint, never crashes the page
- Refund / dispute / payout tiles render `value="-"` with the reason that the underlying tables ship in M6 Phase 5 / 6 - no fake numbers
- Records `admin.dashboard.view` audit event on every load

### 1.10 Audit viewer (scope §3.5)

`src/app/admin/(authed)/audit/page.tsx` + `audit-detail.tsx`

- Filter form: from / to dates, actor email contains, action select, target_type select; defaults to all
- Table renders id, when, actor, role, action (mono), target, IP; "View" button per row opens an inline overlay (focus-trapped, click-outside-closes) with full metadata JSON pretty-printed
- Cursor pagination by id desc; "Older entries" link preserves filters
- Capability gate via `assertCapability(role, 'admin.audit.read')` - moderator role is denied
- Records `admin.audit.viewed` audit event on every load with the filter set

## 2. Files added

```
supabase/migrations/20260502000002_admin_foundation.sql
supabase/scripts/admin/bootstrap-super-admin.sql

src/lib/admin/types.ts
src/lib/admin/rbac.ts
src/lib/admin/auth.ts
src/lib/admin/audit.ts
src/lib/admin/totp.ts
src/lib/admin/encryption.ts
src/lib/admin/session-timeout.ts

src/components/admin/admin-shell.tsx
src/components/admin/admin-sidebar.tsx
src/components/admin/admin-topbar.tsx
src/components/admin/admin-stat-tile.tsx

src/app/admin/actions.ts
src/app/admin/login/page.tsx
src/app/admin/login/login-form.tsx
src/app/admin/(authed)/layout.tsx
src/app/admin/(authed)/page.tsx
src/app/admin/(authed)/enrol-2fa/page.tsx
src/app/admin/(authed)/enrol-2fa/enrol-form.tsx
src/app/admin/(authed)/audit/page.tsx
src/app/admin/(authed)/audit/audit-detail.tsx

tests/unit/admin/totp.test.ts

docs/admin-marketing/phase-a1/scope.md
docs/admin-marketing/phase-a1/closure-report.md
docs/admin-marketing/phase-b1/scope.md
docs/sessions/admin-marketing/progress.log
```

## 3. Files modified

None. A1 is greenfield; no edits to any existing tracked file.

## 4. Quality gates

| Gate | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | Zero errors across the whole repo. |
| `npm run lint` | PASS within owned scope | Zero errors and zero warnings in `src/app/admin/**`, `src/components/admin/**`, `src/lib/admin/**`, `tests/unit/admin/**`. One pre-existing error in `src/components/layout/site-header-client.tsx:58` (react-hooks/set-state-in-effect) is in non-owned layout code that pre-dates this session - flagged as C-A1-05 for the owning session. |
| `npm run build` | PASS through compile + typecheck stages | Compile and TypeScript stages succeed. Page data collection requires runtime Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) which are not configured in this worktree (no `.env.local`). This is a worktree-config gap, not a code defect; the build will run cleanly on Vercel where env vars are set. |
| `npx vitest run tests/unit/admin/totp.test.ts` | PASS | 7 / 7 tests pass: base32 round-trip, secret generation, malformed code rejection, current-window verification, drift tolerance ±1 step, recovery-code hash + verify, recovery-code case/hyphen tolerance. |

### 4.1 Hygiene work performed during gate run

Two stray untracked files outside my owned scope were on disk from before this session and broke the typecheck. Both were verified to have been intentionally deleted in earlier commits on `main`:

- `src/components/ui/smart-media.tsx` - deleted in commit `2559d91 chore(media): delete deprecated SmartMedia component`
- `src/lib/images/category-video.ts` - deleted in commit `010ac07 chore: remove unused exports flagged by ts-prune`

I removed them from the worktree to unblock the typecheck. They were never staged or committed by this session. If either resurfaces, it should be tracked back to whichever workflow restored them (likely a leftover stash apply).

A standalone admin middleware was initially created at `src/middleware.ts`; Next.js 16 forbids both `middleware.ts` and `proxy.ts` to coexist. Since `src/proxy.ts` is shared infrastructure and admin auth is fully covered by the `(authed)` layout's `getAdminSession()` -> `redirect('/admin/login')` gate, the standalone middleware was redundant defence-in-depth and was removed. C-A1-06 captures the option of adding `/admin` to `protectedPrefixes` in `src/lib/supabase/middleware.ts` for faster edge rejection - that file is shared and requires Session 2 coordination.

## 5. Audit-log call sites verified

Every action emits an audit event. Coverage matrix:

| Action | Site | Verified |
|---|---|---|
| `admin.session.login.success` | `src/app/admin/actions.ts` `loginAdminAction` | yes |
| `admin.session.login.failure` (stage=password) | same, anonymous write | yes |
| `admin.session.login.failure` (stage=admin_lookup) | same | yes |
| `admin.session.login.failure` (stage=disabled) | same | yes |
| `admin.session.login.failure` (stage=2fa) | same | yes |
| `admin.session.logout` | `logoutAdminAction` | yes |
| `admin.totp.enrolled` | `confirmTotpEnrolmentAction` | yes |
| `admin.totp.recovery_used` | `verifySecondFactor` recovery branch | yes |
| `admin.dashboard.view` | `src/app/admin/(authed)/page.tsx` | yes |
| `admin.audit.viewed` | `src/app/admin/(authed)/audit/page.tsx` | yes |

Invite-related actions (admin.invite.{created,accepted,revoked}) reserved in the namespace; the invites surface ships in A2 along with the Organisers admin route.

## 6. Coordination items (C-A1-xx)

| ID | Item | Owner | Status |
|---|---|---|---|
| C-A1-01 | Apply migration `20260502000002_admin_foundation.sql` via `supabase db push --linked` | Founder | Pending |
| C-A1-02 | QR rendering for 2FA enrolment - currently text-only | Future polish, non-blocking | Deferred to A1.1 if needed |
| C-A1-03 | Generate `ADMIN_TOTP_ENC_KEY` (32-byte base64) and add to Vercel + local env | Founder | Pending |
| C-A1-04 | Wire Sentry hook into `recordAuditEvent` failure path | Session 2 Hardening | Open |
| C-A1-05 | Pre-existing lint error in `src/components/layout/site-header-client.tsx:58` (react-hooks/set-state-in-effect) | Original author of that file | Flagged |
| C-A1-06 | Optionally add `/admin` to `protectedPrefixes` in `src/lib/supabase/middleware.ts` for faster edge rejection (currently rejected at layout) | Session 2 Hardening | Open |
| C-A1-07 | Run `bootstrap-super-admin.sql` to seed the founder once auth.users row exists | Founder | Pending |
| C-A1-08 | Regenerate `src/types/database.ts` from Supabase after migration applies; remove the local mirror types in `src/lib/admin/types.ts` if desired | Session 2 Hardening | Open |

## 7. Visual regression

Visual regression for the admin shell at the standard 7 viewports is deferred until C-A1-01 + C-A1-03 + C-A1-07 are complete and a real session can render an authenticated dashboard. The shell renders today against the seed `npm run dev` route only when env vars are loaded, which this worktree does not have. The Playwright capture set is queued for the first deploy preview that authenticates a seeded super_admin.

## 8. What is not in A1

Per scope §2 these are intentionally out of scope and ship in their assigned phases. None has been started:

- Organiser moderation queue and KYC review (A2)
- Event content moderation (A3)
- Per-region fee config, refund authorisation, dispute oversight (A4)
- Support tooling (A5)
- Stripe Connect / payments code (Session 1 Backend)
- Observability / rate limit infra / email transport (Session 2 Hardening)
- Marketing surfaces (Track B - Phase B1 scope-doc complete; implementation scheduled in this session)

## 9. [GATE]

Phase A1 code complete. STOP for project manager review.

Decision points the project manager should weigh:

- **Migration apply.** The migration is forward-only and safe to apply ahead of A2. Confirm the founder has run `supabase db push --linked`.
- **Bootstrap seed.** The bootstrap script needs the founder's auth.users row to exist. Confirm or queue.
- **Env var.** `ADMIN_TOTP_ENC_KEY` must exist in Vercel + local before any admin enrols 2FA.
- **Coordination items C-A1-04, C-A1-06, C-A1-08** belong to Session 2 Hardening. Sequence them when Session 2 next surfaces.
- **C-A1-05** is a pre-existing layout-code error; either escalate to whoever owns that file or accept it as documented technical debt.

When the gate clears, A2 (Organiser Management) is next on Track A. Track B Phase B1 (Homepage Hollywood Pass) is queued in this same session and can begin as soon as A1 review concludes.
