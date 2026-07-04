# EventLinqs Admin - Operator Guide

For Lawal. How to log in, what you can do, and exactly how to change the platform
fee. Written so you can operate the admin panel alone.

Preview access URL: **https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app/admin/login**

---

## 1. Logging in

Your account (lawaladams9@gmail.com) is ALREADY granted the `super_admin` role on
the live database - you do not need to run anything to get access.

1. Go to `/admin/login` (URL above).
2. Enter your email + password (the same EventLinqs account).
3. **6-digit code:**
   - First time ever: leave it blank and sign in - you'll be sent to "Enrol 2FA".
     Scan the QR / secret into an authenticator app (Google Authenticator, 1Password,
     Authy), enter the 6-digit code to confirm, and **save the recovery codes
     somewhere safe** (each works once if you lose your phone).
   - After that: enter the current 6-digit code from your authenticator app.
4. You land on the admin dashboard.

If you ever lose your authenticator: on the login screen use "Use recovery code"
and enter one of your saved recovery codes.

> If for any reason your account is not recognised as an admin, the safety-net
> grant is `supabase/scripts/admin/grant-founder-super-admin.sql` (re-runnable,
> by email). Apply from PowerShell in the repo root (never the Dashboard SQL
> editor, never the Supabase MCP):
> `Get-Content supabase/scripts/admin/grant-founder-super-admin.sql | supabase db query --linked`
> then `select role from public.admin_users;` to confirm.

---

## 2. What you can do today (all working, all audit-logged)

Every admin action is gated server-side (verified login + role + capability) and
written to an append-only audit log. The left sidebar gives you:

| Section | What it does |
|---|---|
| **Dashboard** | Overview stats. |
| **Pricing and fees** | View and edit the platform fee %, fixed fee per ticket, and processing-fee treatment, per region (GLOBAL, AU, GB, US, IE). Changes take effect for new transactions immediately; past orders keep their fees. (See section 3.) |
| **Users** | Find users, suspend / reactivate, change roles. |
| **Organisers** | Approve / reject / suspend / reinstate organisers. |
| **Orders** | View orders; process refunds (Stripe). |
| **Payouts** | Disburse or void organiser payouts. |
| **Events** | Pause / resume / cancel events (content moderation). |
| **Audit log** | Every admin action: who, when, what, old -> new value. Filter by date, actor, action, target. |
| **Analytics** | Platform analytics. |

Roles: `super_admin` (you) can do everything. `admin`, `support`, `moderator`
have narrower capability sets.

---

## 3. Changing the platform fee (step by step)

This is the immediate task: set the AU platform fee to **2%** (the fixed fee stays
AUD 0.50). The fee shown on /pricing and charged at checkout come from the SAME
source (the `pricing_rules` table), so changing it here moves both together.

1. Log in (section 1) and click **Pricing and fees** in the sidebar.
2. You'll see a table, one row per region. Find the **AU AUD** row.
3. In **Platform fee percent**, change the value to `2` (for 2%). Leave **Fixed
   fee per ticket (cents)** at `50` (= AUD 0.50). Leave **Processing fee** as is.
4. Click **Save** on that row. A confirmation box appears naming the region and
   warning that new transactions will use the new fee. Click **OK**.
5. A green banner confirms "Saved AU. N fields updated." The change is now live:
   - new checkouts charge 2% + AUD 0.50,
   - the public **/pricing** page shows "2% + AUD 0.50",
   - the **/organisers** page shows "2% + AUD 0.50".
6. (Optional) Do the same for the **GLOBAL** row so non-AU markets match.
7. Verify in **Audit log**: you'll see `admin.pricing.updated` with the old value
   (2.5) and new value (2.0), timestamped, under your name.

Notes:
- Every save writes a new VERSION. History is preserved; nothing is overwritten.
- Past orders are never re-priced.
- Per-event organiser overrides (where set) still win over the regional default.

---

## 4. Security model (how access is protected)

- Login is verified server-side with `supabase.auth.getUser()` (not the
  spoofable client session), then checked against the `admin_users` table.
- 2FA (TOTP) is mandatory for every admin.
- Every admin page AND every admin action re-checks your login + role +
  capability on the server - there is no "trust the page" shortcut.
- The database itself (RLS) only lets the service role write pricing, admin, and
  audit tables; a normal logged-in user (or anonymous visitor) can change nothing.
- Proven: an anonymous request and a non-admin both get bounced to /admin/login
  on every admin route, and a direct anonymous attempt to change pricing is
  blocked (see docs/benchmark/system-pass/ADMIN-HANDOVER.md).

---

## 5. Not yet built (honest roadmap)

These are NOT in the admin panel today; they are future work, not hidden gaps:

- **Per-event / per-organiser pricing overrides UI.** The database supports
  per-org overrides, but the admin UI edits regional defaults only. Overrides
  would need their own screen.
- **Pricing "reason" field.** Changes are audit-logged (who/when/old/new) but you
  cannot attach a free-text reason to a fee change yet.
- **Admin invite flow UI.** New admins are added via the database
  (bootstrap/grant scripts), not a self-serve "invite admin" screen yet.
- **KYC review queue, status page, and support-tooling** described in the M7
  scope are partially present (organiser moderation exists) and partially future.
- **Public /pricing on-page fee is LIVE** (reads pricing_rules at request time),
  so it always matches what checkout charges. The SEO `<meta>` description was
  made number-free so it can never contradict the live fee. (A future nicety:
  make the meta description itself read the live number via generateMetadata.)
