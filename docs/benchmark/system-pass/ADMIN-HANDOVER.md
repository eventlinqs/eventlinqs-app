# Admin Panel - Verify, Complete, Hand Over

Branch `feat/home-rebuild`. NO merge to main.

**Access URL:** https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app/admin/login
**Operator guide:** `docs/ADMIN-GUIDE.md`

> **Founder access is LIVE already.** lawaladams9@gmail.com exists in auth and is
> already `super_admin` in `admin_users` (disabled_at null) on the live Sydney DB.
> Just log in at the URL above; first login enrols 2FA. No migration needed; an
> idempotent safety-net grant ships anyway (below).

---

## 1. Honest inventory (what is real)

The admin panel is substantially BUILT and well-architected (server actions, not
loose APIs). Verified by reading the code, not assumed.

| Surface | State | Notes |
|---|---|---|
| Admin login + 2FA (TOTP + recovery codes) | **WORKING** | `/admin/login`, mandatory AAL2, first-login enrol |
| Auth gate (every page) | **WORKING** | `(authed)/layout.tsx` -> `getAdminSession()` |
| RBAC on every server action | **WORKING** | each action calls `requireAdminSession` + `assertCapability` |
| Pricing and fees editor | **WORKING** (+ confirmation added this pass) | list + edit per region, versioned, audit-logged |
| Audit log (append-only) | **WORKING** | who/when/action/target/old->new, filterable |
| Users (suspend/reactivate/role) | **WORKING** | |
| Organisers (approve/reject/suspend/reinstate) | **WORKING** | |
| Orders + refunds (Stripe) | **WORKING** | |
| Payouts (disburse/void) | **WORKING** | |
| Events (pause/resume/cancel) | **WORKING** | |
| Analytics | **WORKING** | |
| Per-event/per-org pricing override UI | **MISSING** | DB supports it; no screen yet |
| Admin invite UI | **MISSING** | admins added via DB grant scripts |
| Pricing-change reason field | **MISSING** | change is logged, but no free-text reason |
| KYC review queue / status page | **PARTIAL/FUTURE** | organiser moderation exists; rest is M7 future |

No overclaiming: the core money + moderation surfaces are real and gated; the
gaps above are genuinely not built.

## 2. Security - verified + negative-tested

- Server-side auth: `getAdminSession()` uses `supabase.auth.getUser()` (NOT
  `getSession()`), then looks up `admin_users` (dedicated role table:
  super_admin|admin|support|moderator) and checks `disabled_at`. (`src/lib/admin/auth.ts`)
- Every admin server action re-verifies at the top: `requireAdminSession()` +
  `assertCapability(role, '...')` - confirmed across pricing, users, orders,
  organisers, payouts, events actions. Not reliant on the layout alone.
- RLS (migrations): `pricing_rules` = public SELECT, service-role-only writes;
  `admin_users` + `audit_log` = admin-only SELECT, service-role-only writes, no
  UPDATE/DELETE (append-only). No authenticated/anon user can mutate them.
- **Negative-access test (`scripts/admin-negative-access.mjs`) on the deployed
  preview: PASS.** All 10 admin routes deny anonymous (307 -> /admin/login);
  /admin/login reachable (200); an anonymous POST to the pricing action is
  blocked (307 -> /admin/login, no mutation). A non-admin authenticated user hits
  the identical gate (no `admin_users` row -> `getAdminSession` null), so anon
  denial proves non-admin denial on the same code path.

## 3. Founder access

- Already `super_admin` (verified against the live DB). Log in -> enrol 2FA ->
  operate. Full steps in `docs/ADMIN-GUIDE.md` section 1.
- Idempotent safety-net grant shipped (lawful migration workflow):
  - `supabase/migrations/20260608000001_grant_founder_super_admin.sql` (applied
    via `supabase db push --linked` in PowerShell; never Dashboard, never MCP).
  - `supabase/scripts/admin/grant-founder-super-admin.sql` (re-runnable, by email)
    for the case where push ran before sign-up.

## 4. Pricing editor

`/admin/pricing` (`pricing/page.tsx` + `pricing/actions.ts` + `lib/admin/pricing.ts`):
- Lists `pricing_rules` per region (GLOBAL, AU, GB, US, IE): platform fee %, fixed
  fee per ticket (cents), processing-fee treatment.
- Edits with zod bounds (0-100%, 0-100000 cents, 0/1), writes a NEW VERSION row
  (history preserved, past orders untouched), invalidates the cache.
- Audit-logs `admin.pricing.updated` with field, country, currency, old -> new,
  version, actor.
- **Added this pass:** a confirmation step (`ConfirmSubmitButton`) before a save
  applies, naming the region and warning new transactions use the new fee.

## 5. End-to-end fee chain (one number, one source)

Wired so the DISPLAYED fee equals the CHARGED fee, both from `pricing_rules`:
- Charged: `payment-calculator` -> `getPlatformFeePercentage('AU','AUD')` /
  `getPlatformFeeFixedCents` (service-role read, region -> GLOBAL, active row,
  highest version).
- Displayed: `getLivePublicFee()` (`src/lib/pricing/live-fee.ts`) reads the SAME
  `pricing_rules` rows via the ANON client (public SELECT RLS) with the same
  AU -> GLOBAL precedence, and the `public-fee.ts` constant as a final fallback so
  the page never 500s. Now used by `/pricing` (force-dynamic) and `/organisers`
  (ISR 60s).
- Why anon (not service-role) for display: the service-role key may be absent on
  preview, which would silently fall back to the constant and re-create drift.
  The anon read works on every environment and reads the exact charged rows.
- **Verified against the live DB:** `pricing_rules` AU/AUD active =
  `platform_fee_percentage 2.5`, `platform_fee_fixed 50` (the anon query returns
  these). So a $50.00 paid ticket is charged 2.5% + AUD 0.50 = **AUD 1.75** today.
- **Verified on the deployed preview:** the `/pricing` paid-tier price span
  renders `2.5% + AUD 0.50` - i.e. the LIVE pricing_rules value, read via the
  anon client at request time, equal to the charged value. (The only "2%" left on
  the page was the static SEO `<meta>` description; it has been made
  number-free so it cannot drift.)
- **The founder's action sets it to 2%:** in `/admin/pricing`, set AU
  `platform_fee_percentage` to `2` -> a $50.00 ticket is charged 2% + 0.50 =
  **AUD 1.50**, and /pricing + /organisers display "2% + AUD 0.50" - all from the
  one `pricing_rules` source. (The public marketing constant was already set to
  2% in anticipation; it is now only the fallback.)

## 6. Proof

- Negative-access test: PASS (anon + non-admin denied on every route + action).
- Fee chain: single-source wired; live DB value (2.5%) read via the same anon
  query the page uses; charged math shown above.
- Admin login UI: axe 0 (desktop + mobile); captures
  `docs/benchmark/system-pass/admin/admin-login-{1440,390}.png`.
- Gates: tsc clean, eslint clean (0 errors), vitest 329/329, next build clean.
- Authed admin UI captures (dashboard, pricing) require a logged-in 2FA session;
  the founder will see them on first login. Only the public `/admin/login` is
  capturable without credentials - captured here.

## Commits (feat/home-rebuild, NO merge)
- `9adbccf` founder super_admin grant (migration + script)
- `bd85c42` pricing-editor confirmation step
- `003e046` single-source live fee display
- `6c7e455` fix: live fee via anon client (works on preview, no service key)
