# Founder dashboard steps: Resend, Supabase, Google

Three dashboards, in this order. Do not skip the order: Google OAuth cannot be
finished until you know the Supabase project ref, and the Supabase Site URL fix
changes where auth links land.

Every value below is read out of this codebase, not from memory. Anything I
could not verify is marked **UNVERIFIED** with the reason.

Total time: about 25 minutes.

---

## PART 1: Resend domain verification (about 2 minutes, likely already done)

**Site:** https://resend.com/domains

### The situation

`eventlinqs.com` is **already verified**. Checked live on 2026-08-03:

```
$ curl -s -H "authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
   eventlinqs.com -> verified region ap-northeast-1
```

DNS confirms SPF, DKIM and the return path are all live.

### What to do

1. Open https://resend.com/domains.
2. Confirm `eventlinqs.com` shows a green **Verified** badge.
3. Confirm the three record rows (`send` MX, `send` TXT/SPF, `resend._domainkey`
   TXT/DKIM) all show **Verified**.

**Do NOT add `eventlinqs.com.au`.** Founder ruling 2026-08-03: the platform
sends from `eventlinqs.com`. See `docs/hardening/auth/DOMAIN-DECISION.md`.

### Success criterion

`eventlinqs.com` is Verified and no record row shows Pending or Failed.

### Confirm it afterwards with the Phase 4 check

The auth sentinel check **"sender domain verified in Resend"** reads
`GET https://api.resend.com/domains` and asserts the active sending domain is
`verified`. It goes red the moment a DNS record is removed.

---

## PART 2: Supabase (about 8 minutes), TWO separate jobs

**Site:** https://supabase.com/dashboard
**Project:** `gndnldyfudbytbboxesk` (this is production; verified by scanning the
16 JS chunks served by the live `/login` page on 2026-08-03)

### 2A. Fix the Site URL. DO THIS ONE FIRST, IT IS WRONG TODAY

**Page:** Authentication -> URL Configuration

**Field:** `Site URL`

| | |
|---|---|
| Currently | `https://www.eventlinqs.com` |
| Change to | `https://www.eventlinqs.com.au` |

**Why:** `www.eventlinqs.com` is not the live site, it is a redirect to
`www.eventlinqs.com.au`. Every auth link generated without an explicit redirect
currently points at a host that only exists to bounce. Read back from production
on 2026-08-03 by sending a non-allowlisted `redirect_to` and observing the
fallback:

```
redirect_to=https://attacker.example.com/steal -> 303 https://www.eventlinqs.com/#error=...
                                                        ^^^^^^^^^^^^^^^^^^^^^^^^ the Site URL
```

**Field:** `Redirect URLs` (same page, below Site URL)

Confirm all of these are present. Add any that are missing, one per line:

```
https://www.eventlinqs.com.au/auth/callback
https://www.eventlinqs.com.au/auth/reset-password
https://www.eventlinqs.com.au/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset-password
http://localhost:3000/auth/confirm
```

I verified on 2026-08-03 that `/auth/callback` and `/auth/reset-password` on
`www.eventlinqs.com.au` are **already allowlisted**. `/auth/confirm` is used by
every emailed link this branch introduces, so add it if it is not there.

Click **Save**.

**Success criterion:** Site URL reads `https://www.eventlinqs.com.au` and all six
redirect URLs are listed.

### 2B. Custom SMTP

**Page:** Authentication -> Emails -> SMTP Settings

**Why it still matters even though this branch removed the dependency:** all four
EventLinqs auth emails (signup confirmation, password reset, magic link, resend
verification) now go through our own Resend transport and never touch Supabase's
mailer. But Supabase Auth still sends for flows we do not drive, such as an
email-change confirmation, and its built-in mailer is capped at **2 emails per
hour project-wide**. That cap is what produced "Error sending recovery email".

1. Toggle **Enable Custom SMTP** on.
2. Fill the fields:

| Field | Value |
|---|---|
| Sender email | `hello@eventlinqs.com` |
| Sender name | `EventLinqs` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (the `re_...` value already in the Vercel env as `RESEND_API_KEY`) |

**UNVERIFIED:** the SMTP host, port and username are Resend's documented SMTP
credentials, not values I could read out of this codebase, because the codebase
uses the Resend HTTP API and never its SMTP interface. Confirm them against
https://resend.com/docs/send-with-smtp before saving. Everything else on this
page is verified from the code.

3. Click **Save**.

**Success criterion:** the page shows Custom SMTP enabled with host
`smtp.resend.com`, and Authentication -> Rate Limits no longer shows the
2-per-hour email ceiling.

### Confirm both afterwards with the Phase 4 check

- **"redirect allowlist and Site URL"** sends a deliberately invalid token to
  `/auth/v1/verify` for each redirect URL the code builds and reads back which
  ones GoTrue echoes. It goes red if any required URL is missing or if the Site
  URL does not match the deployment's own origin. Nothing is sent and nothing is
  written; the token is invalid on purpose.
- **"Supabase Auth custom SMTP"** currently reports `unverified`, because reading
  it needs a Supabase Management API token that is not in the runtime
  environment. **This is a named gap, see the closure report.** After you save,
  verify by hand: Authentication -> Emails should show your SMTP host.

---

## PART 3: Google OAuth (about 12 minutes)

Two dashboards. Google first, then paste into Supabase.

### 3A. Google Cloud Console

**Site:** https://console.cloud.google.com/

1. Pick or create a project named `EventLinqs`.
2. **APIs & Services -> OAuth consent screen**
   - User type: **External**
   - App name: `EventLinqs`
   - User support email: your Gmail
   - Application home page: `https://www.eventlinqs.com.au`
   - Privacy policy: `https://www.eventlinqs.com.au/legal/privacy`
   - Terms of service: `https://www.eventlinqs.com.au/legal/terms`

   Those two legal paths are verified from the code: `src/app/legal/privacy/page.tsx`
   and `src/app/legal/terms/page.tsx`, linked from the signup form at
   `src/components/auth/signup-form.tsx`. The older setup doc named
   `/privacy` and `/terms`, which do not exist and would 404 on Google's review.

   - Authorised domains: add `eventlinqs.com.au` and `supabase.co`
   - Developer contact: your Gmail
   - Scopes: leave the defaults (`email`, `profile`). Both are non-sensitive.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**
   - Application type: **Web application**
   - Name: `EventLinqs Web`

   **Authorised JavaScript origins** (add all three):
   ```
   https://www.eventlinqs.com.au
   https://eventlinqs.com.au
   http://localhost:3000
   ```

   **Authorised redirect URIs** (exactly one, exactly this):
   ```
   https://gndnldyfudbytbboxesk.supabase.co/auth/v1/callback
   ```

   Google requires an exact match on scheme, case and trailing slash. This is
   Supabase's callback, not ours: the browser goes to Google, Google returns to
   Supabase, and Supabase then returns to our `/auth/callback`.

4. **Create.** Copy the Client ID and Client secret.

### 3B. Supabase

**Page:** Authentication -> Providers -> Google

1. Toggle **Enable sign in with Google** on.
2. **Client ID (for OAuth):** paste the Client ID.
3. **Client Secret (for OAuth):** paste the Client secret.
4. **Authorized Client IDs:** leave blank.
5. **Skip nonce check:** leave off.
6. **Save.**

### 3C. Publish the consent screen

While the app is in Testing, only listed test users can sign in. Google Cloud ->
OAuth consent screen -> **Publish app**. With only `email` and `profile` scopes
this is instant, no review.

### Success criterion

Open `https://www.eventlinqs.com.au/login`. The **Continue with Google** button
is now visible (it is deliberately hidden while the provider is off, which is why
it is absent today). Click it, pick your account, and land on `/dashboard` signed
in.

**Until you complete this, the button does not render at all.** That is the fix,
not a bug: rendering it while the provider is disabled is what showed you
`{"code":400,"msg":"Unsupported provider: provider is not enabled"}` as a raw
JSON page. The gate is fail-safe, so a disabled or unreachable provider always
hides the button and leaves email sign-in working.

Allow up to 5 minutes for the button to appear: the enabled-provider check is
cached per serverless instance for 5 minutes.

### Confirm it afterwards with the Phase 4 check

The **"provider parity (rendered vs enabled)"** check reads
`GET {SUPABASE_URL}/auth/v1/settings` and asserts every provider the app can
render is genuinely enabled. It is red right now and will go green the moment
you save in 3B.

---

## Running the Phase 4 check yourself, any time

The auth sentinel runs automatically every 10 minutes on the production cron
(`vercel.json`). To run it on demand:

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" \
  https://www.eventlinqs.com.au/api/cron/auth-sentinel | jq
```

`200` means every check passed. `503` means at least one failed and an alert
email has already been sent. Each failed check carries a `probableCause` and a
`fix`.

To prove the alert path itself still works, without breaking anything:

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" \
  "https://www.eventlinqs.com.au/api/cron/auth-sentinel?simulate=alert"
```

That deliberately fails one synthetic check and sends the alert. Verified
working on 2026-08-03: `{"ok":false,...,"alerted":true}` with the email
confirmed `delivered` in the Resend dashboard.

---

## The 60-second manual check I could not automate

Chrome's save and fill prompts are browser UI outside the page, and Chrome
suppresses the save bubble under automation, so no script can assert them. The
live DOM contract IS automated and passes 18/18 in real Chrome. This is the
remaining human half:

1. Open `https://www.eventlinqs.com.au/login` in ordinary Chrome.
2. Sign in with a real account.
3. Chrome should show **"Save password?"** in the address bar. Save it.
4. Sign out, return to `/login`, click the email field.
5. Chrome should offer the saved account and fill both fields.

If step 3 does not appear, check that Chrome's password manager is on at
`chrome://settings/passwords` ("Offer to save passwords").
