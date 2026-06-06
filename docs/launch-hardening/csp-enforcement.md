# CSP: report-only to enforcing (follow-up, do NOT flip yet)

The Content-Security-Policy ships in report-only mode (see
`docs/launch-hardening/security-headers.md`). It reports violations to the
browser console without blocking anything. Flip it to enforcing only after a
clean preview-watch run.

## The exact one-line flip

In `next.config.ts`, the `SECURITY_HEADERS` array, change the CSP header key
from report-only to enforcing:

```diff
-  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
+  { key: 'Content-Security-Policy', value: CSP_REPORT_ONLY },
```

That is the whole change. The policy string (`CSP_REPORT_ONLY`) stays the same;
only the header name changes from `...-Report-Only` to enforcing. Consider
renaming the constant to `CSP` at the same time for clarity (cosmetic).

## Preview-watch checklist (run BEFORE flipping)

Deploy the preview, open DevTools, Console, and walk each flow watching for
`Content-Security-Policy-Report-Only` violation lines. Every legitimate source
that is reported must be folded into the policy first.

- [ ] Home `/` - hero image, fonts, Plausible (production only), any inline script.
- [ ] Browse `/events` and `/events?category=...` - card images, filters.
- [ ] Event detail `/events/[slug]` - cover image, map, JSON-LD, OG.
- [ ] A page with a map (`/city/[slug]`, `/venues/[handle]`) - Mapbox or Google
      Maps tiles, scripts, and `connect-src` (tile/style/events endpoints).
- [ ] Checkout `/checkout/[reservation_id]` - the Stripe Payment Element iframe
      (`frame-src js.stripe.com`), `script-src js.stripe.com`, `connect-src
      api.stripe.com`. This is the highest-risk flow; a CSP miss here blocks
      payment.
- [ ] Auth `/login`, `/signup`, `/auth/reset-password`.
- [ ] Dashboard `/dashboard` and an organiser export (XLSX/CSV download).
- [ ] Sentry: errors still ingest via the same-origin `/api/monitoring` tunnel
      (no external `connect-src` needed); confirm no Sentry CSP report.

For each reported violation: identify the source host and directive, add it to
the matching directive in `CSP_REPORT_ONLY` in `next.config.ts`, redeploy, and
re-watch until the console is clean.

## Hardening to consider at flip time (optional)

- Replace `'unsafe-inline'` in `script-src` with a per-request nonce (Next.js
  supports nonces via middleware). This is the biggest XSS-resistance win and is
  the main reason to do a careful flip rather than enforce immediately.
- Drop `'unsafe-eval'` if the preview-watch shows nothing needs it (it is there
  for Mapbox GL; verify on the map pages).

## Rollback

If enforcing breaks a flow in production, revert the one-line change (key back
to `Content-Security-Policy-Report-Only`) and redeploy. Because the policy
string is unchanged, rollback is a single-character edit.

## Status

NOT flipped. Shipped report-only. Flip after the checklist above is clean on the
preview.
