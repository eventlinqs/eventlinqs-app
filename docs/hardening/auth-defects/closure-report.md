# Auth defects fix - closure report

**Branch:** `feat/auth-defects-fix`
**Date:** 2026-05-03
**Owner:** Session 2 (hardening)

## Defects fixed

### Defect 1: signup confirmation email not delivering reliably

**Symptom:** New signups in production sometimes never received the
confirmation email. No client error, no server log entry, just a silent
drop.

**Root cause:** The signup form called `supabase.auth.signUp()` directly
from the browser. The confirmation email was therefore dispatched by
Supabase Auth's outbound SMTP, which enforces a 4-emails-per-hour
project-wide cap on the default mailer. Once concurrent signup volume
crossed that ceiling, Supabase silently rate-limited subsequent sends
with no surface in our application logs. The Resend SMTP handover
documented in `docs/hardening/phase1/resend-smtp-setup.md` was still
awaiting founder action in the Supabase Dashboard, so all production
signups remained on the throttled default mailer.

**Fix:** Replace the client-side `signUp` with a server-side endpoint at
`POST /api/auth/signup` that:

1. Validates input via Zod (fullName, email, password, role).
2. Pins the redirect host to `NEXT_PUBLIC_SITE_URL` so a forged Origin
   header cannot smuggle the action_link to an attacker domain.
3. Creates the user with `email_confirmed=false` via
   `admin.auth.admin.generateLink({ type: 'signup', ... })`, which
   returns the verification action_link without triggering Supabase's
   outbound mailer at all.
4. Dispatches the confirmation email directly via the Resend SDK using
   the brand-compliant template that previously lived only as a
   Supabase Dashboard paste-target.
5. Maps `already registered` errors to a 409 with a friendly message.
6. Rolls back the user record (`admin.auth.admin.deleteUser`) on
   downstream send failure so retries are clean and no half-created
   accounts accumulate.
7. Sits behind a new `auth-signup` rate-limit policy (5 attempts per
   IP per 10 minutes) applied via the existing `applyRateLimit`
   middleware.

The signup form now POSTs to `/api/auth/signup` instead of calling
Supabase from the browser. The resend-verification button (used on
`/verify-email-sent`) still calls `supabase.auth.resend({ type:
'signup' })` and remains unchanged in this PR; it is governed by the
same Supabase SMTP cap and is queued as a follow-up.

### Defect 2: `/auth/reset-password` hang on "Updating password"

**Symptom:** After entering a new password and clicking submit, the
button stayed stuck on "Updating password" forever. No error toast, no
redirect, no log line. Only a hard refresh recovered.

**Root cause:** The form's success path called
`supabase.auth.signOut()` then `router.push('/login?reset=success')`
without ever toggling `loading=false`. Two failure modes converged:

1. `signOut()` could deadlock on Supabase JS's NavigatorLock when the
   recovery-session token was being concurrently re-read by another
   tab, by the auth state subscriber on the same page, or by React's
   double-mount in dev. The promise stayed pending.
2. The unhandledrejection handler in `src/lib/supabase/client.ts`
   swallows `NavigatorLockAcquireTimeoutError` precisely because it is
   normally a no-op transient. Here it ate the only signal that the
   flow had stalled.

Either path left the button frozen with no error surface.

**Fix:** Rewrite the submit handler with a try/finally that always
resets `loading`, race `updateUser` against a 15-second timeout so a
deadlocked auth-token read cannot freeze the UI, demote `signOut` to a
3-second best-effort cleanup (middleware redirects authenticated users
away from `/login` on the next request anyway), and hard-navigate via
`window.location.assign` so the SPA router cannot intercept the
post-recovery redirect.

## Verification

### Gates

- `npm run lint`: pass, zero warnings
- `npx tsc --noEmit`: pass
- `npm run build`: pass; `/api/auth/signup` emitted as dynamic function
- `npm test`: 109/109 pass (4 new tests on the HTML attribute escape
  used by the email template)

### Server-side smoke (production build, port 3030)

`POST /api/auth/signup` exercised against `npm start` with real
production Supabase + Resend env:

| input | expected | observed |
| --- | --- | --- |
| empty body `{}` | 400 friendly | 400 `{ ok: false, error: "Please check your details and try again." }` |
| password length 3 | 400 friendly | 400, same shape (Zod rejects below 8) |
| valid input, fake-domain email | 200 with Resend queue id | 200 `{ ok: true }` |

The valid-input test created two real users in production Supabase
under the synthetic domain `invalid-domain-eventlinqs-smoke.com`. Both
were deleted via the admin API immediately after; production user
table is clean.

### Outstanding manual verification

The two flows below cannot be exercised in CI; they require a real
inbox the founder owns and a click-through on the Vercel preview that
auto-deploys from this PR.

1. **Signup email arrival.** Hit `/signup` on the preview URL with a
   real address, confirm the email arrives within 60 seconds with the
   EventLinqs wordmark, working "Confirm email" button, and copyable
   action_link. Click the button, confirm landing on `/auth/callback`
   and onward redirect to `/dashboard`.
2. **Password reset full cycle.** Hit `/forgot-password` with the same
   real address, confirm reset email arrives, click link, set a new
   password, observe the button transitions cleanly from "Updating
   password" to a hard navigation to `/login?reset=success` (success
   banner showing), then sign in with the new password and verify
   landing on `/dashboard`.

If either step fails, file follow-up under `docs/hardening/auth-defects/`.

## Founder action items (for production cutover)

- **A1:** Set `EMAIL_FROM` in Vercel production env to a verified
  Resend domain identity (e.g. `EventLinqs <hello@eventlinqs.com>`).
  The local dev default falls back to that string, but production must
  be explicit so a sender change is a single-PR, env-only operation.
- **A2:** Verify the `eventlinqs.com` (or chosen sender domain) in the
  Resend dashboard if not already done. Without it, Resend rejects
  sends with `Domain is not verified`.
- **A3:** Deferred-and-acceptable: the Supabase Dashboard SMTP-handover
  to Resend documented in `docs/hardening/phase1/resend-smtp-setup.md`
  is no longer on the critical path for signup confirmation since the
  new endpoint bypasses Supabase SMTP entirely. The handover is still
  worth completing for the `auth.resend` resend-verification path and
  for password reset (Supabase still drives the recovery email when
  `auth.resetPasswordForEmail` is called from the browser). Tracked
  separately.

## Files touched

- `src/components/auth/reset-password-form.tsx`: try/finally + timeout race + hard nav
- `src/components/auth/signup-form.tsx`: POST to `/api/auth/signup`
- `src/app/api/auth/signup/route.ts` (new): server-side signup with Resend
- `src/lib/email/send.ts` (new): lazy Resend SDK wrapper
- `src/lib/email/auth-emails.ts` (new): branded confirmation email + escape util
- `src/lib/rate-limit/policies.ts`: new `auth-signup` policy
- `.env.example`: documents `EMAIL_FROM`, updates Resend rationale
- `tests/unit/email/auth-emails.test.ts` (new): HTML attribute escape coverage
