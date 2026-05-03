# Resend SMTP for Supabase Auth - founder action

Status: AWAITING FOUNDER ACTION
Owner: Lawal Adams
Estimated time: 35 minutes (mostly DNS verification wait)
Cost: free tier covers up to 3,000 emails per month, USD $20/month thereafter for Pro
Blocks: nothing critical, but gates the "auth emails feel branded" portion of the launch readiness checklist

## Why this matters

Right now Supabase Auth sends every confirm-signup, magic-link, and password-reset email from the default Supabase domain (`*.supabase.co`). At launch, every fan and organiser sees an email from a domain they have never heard of, with whatever default copy Supabase ships. Three problems with that:

1. Deliverability. The default Supabase sender has soft sender reputation; anything beyond a trickle goes to spam.
2. Brand. Customers expect a `noreply@eventlinqs.com` From line, not `noreply@mail.supabase.co`.
3. Compliance. We need DMARC alignment for institutional mail providers (.edu domains, gov.au) to accept our mail at all.

Routing Supabase Auth via Resend SMTP fixes all three.

## What you need to do

### 1. Create or sign in to Resend

Go to https://resend.com/. Sign in with the EventLinqs Google account. Note the workspace name.

### 2. Verify the eventlinqs.com domain

In the Resend dashboard:

1. Click "Domains" > "Add Domain".
2. Enter `eventlinqs.com`.
3. Resend shows you 3 DNS records to add: an SPF TXT record, a DKIM TXT record, and a DMARC TXT record.
4. Add those records to your DNS provider (Cloudflare, Vercel DNS, or wherever `eventlinqs.com` is hosted).
5. Wait 5-15 minutes for propagation.
6. Click "Verify" in Resend; the records should turn green.

If you have `eventlinqs.com` on Vercel DNS, add the records via:

```powershell
vercel dns add eventlinqs.com @ TXT "v=spf1 include:_spf.resend.com ~all"
# DKIM record - Resend will give you the exact selector and key value
vercel dns add eventlinqs.com {selector}._domainkey TXT "{key}"
# DMARC - relaxed enforcement to start
vercel dns add eventlinqs.com _dmarc TXT "v=DMARC1; p=none; rua=mailto:dmarc@eventlinqs.com"
```

If `eventlinqs.com` is on a different DNS host, add the records via that host's UI.

### 3. Generate an SMTP credential in Resend

In Resend:

1. Click "API Keys" or "SMTP".
2. Generate an SMTP credential. Capture:
   - SMTP host: `smtp.resend.com`
   - SMTP port: 587 (STARTTLS) or 465 (TLS)
   - SMTP username: `resend`
   - SMTP password: the API key Resend just generated. Save it - it does not display again.
3. Set scope to `transactional` only (no marketing scope needed yet).

Also generate a separate API key labelled `eventlinqs-runtime` for direct SDK calls (consumed by `RESEND_API_KEY` env var, used by `/api/contact` and any future direct-send code paths).

### 4. Configure Supabase Auth SMTP

1. Open the Supabase Dashboard: https://supabase.com/dashboard
2. Select project `gndnldyfudbytbboxesk` (the EventLinqs production project).
3. Navigate: Authentication > Settings (or "SMTP Settings" depending on dashboard version).
4. Toggle "Enable Custom SMTP".
5. Fill in:
   - Sender email: `noreply@eventlinqs.com`
   - Sender name: `EventLinqs`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key from step 3
   - Minimum interval between emails: leave default (60 seconds)
6. Click "Save".

Supabase will send a test email to verify the SMTP connection.

### 5. Update email template copy in Supabase

Still in the Supabase Dashboard, navigate: Authentication > Email Templates.

Five templates to update:
- Confirm signup
- Invite user
- Magic link
- Change email address
- Reset password

For each template, replace the body with the brand-compliant copy in `src/lib/email/templates/auth/`. The HTML files there are designed to copy-paste into the Supabase template editor as-is. The `{{ .ConfirmationURL }}` and other Supabase placeholder tokens are preserved in the templates.

### 6. Set RESEND_API_KEY in Vercel

```powershell
vercel env add RESEND_API_KEY production
# paste the eventlinqs-runtime API key

vercel env add RESEND_API_KEY preview
# paste the same key (or a separate dev-scoped key if Resend Pro is active)
```

This is consumed by direct Resend SDK calls outside of Supabase Auth (e.g. `/api/contact` once M11 ships).

### 7. Tell me you are done

Reply in chat: "Resend SMTP wired, templates updated, env set." I will:
1. Trigger a fresh password reset against the test account.
2. Verify the email arrives from `noreply@eventlinqs.com` via Resend (check the message headers for `X-Resend-` markers).
3. Verify the body matches the brand-compliant copy.
4. Smoke test signup confirmation email and magic link if the email-confirmation flow is enabled.
5. Log closure to `docs/sessions/hardening/progress.log`.

## Brand voice rules enforced in the templates

Per CLAUDE.md, every public-facing copy block must comply:

- No em-dashes (use hyphens, colons, pipes, commas).
- No en-dashes.
- No exclamation marks in user-facing copy.
- No "diaspora" anywhere.
- Australian English (`-ise`, `-our`, `-re`).
- Tagline if present: "Every culture. Every event. One platform."
- Sub-tagline if present: "The ticketing platform built for every culture."

## Cost expectation

Resend free tier: 3,000 emails per month, 100 per day, single domain.

EventLinqs auth volume at launch:
- ~1k organiser signups in week 1 (3 emails each = 3k confirm + magic-link cycles)
- ~10k attendee signups week 1 (1 confirm email each = 10k)

That overruns free tier on day one. Set Resend to Pro plan (USD $20/month) before week 1 launch.

For attendee signup, consider toggling Supabase to passwordless / magic link (single email per signup) to halve volume.

## Rollback plan

If Resend SMTP misbehaves (deliverability problems, auth header rejections):

1. In Supabase Dashboard > Auth > SMTP Settings, toggle "Enable Custom SMTP" off.
2. Supabase reverts to its default sender immediately.
3. Open a Resend support ticket if delivery is the issue.

No code rollback required. SMTP is dashboard-only state.

## Reference

- Resend SMTP docs: https://resend.com/docs/send-with-smtp
- Supabase Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- DMARC quickstart: https://dmarc.org/overview/
