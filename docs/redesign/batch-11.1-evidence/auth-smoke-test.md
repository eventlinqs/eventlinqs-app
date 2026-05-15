# Batch 11.1 D3.6 - Auth smoke (option b)

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.6)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`

## Scope (per founder Q1 answer)

Option (b): test that auth forms render and POST endpoints exist.
Full signup-with-email-verify E2E is flagged as carry-over until
Resend SMTP is wired (PRE-LAUNCH-HARDENING item 2 EXISTING).

## Coverage

For each of `/login`, `/signup`, `/forgot-password`:

1. Page returns HTTP 200
2. Page renders a `<form>` element
3. Page renders an `<input type="email">` or `<input name="email">`
4. Page renders a submit button (`<button type="submit">` or `<input type="submit">`)

## Result

**3 / 3 PASS.**

```
PASS [3.6-auth-form] /login           | HTTP 200 form=true email=true submit=true
PASS [3.6-auth-form] /signup          | HTTP 200 form=true email=true submit=true
PASS [3.6-auth-form] /forgot-password | HTTP 200 form=true email=true submit=true
```

## Carry-over to pre-launch hardening

Full signup → email verification → login → logout E2E flow needs:

1. Resend SMTP configured in Supabase Dashboard (PRE-LAUNCH-HARDENING item 2)
2. Test user credentials available (or signup-with-verify works through Resend)

Once both are in place, an authed Playwright E2E suite can be added
to CI. Tracked.

End.
