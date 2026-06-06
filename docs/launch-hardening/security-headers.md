# Security response headers

Added via `next.config.ts` `headers()`, applied to every route (`/:path*`).

## Before

Only one header was set globally:

- `X-Robots-Tag: index, follow`

Missing: HSTS, X-Content-Type-Options, X-Frame-Options / frame-ancestors,
Referrer-Policy, Permissions-Policy, CSP.

## After (verified on a production build, `next start`, 2026-06-06)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), browsing-topics=()
Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self';
  object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src ...;
  script-src ... https://js.stripe.com https://plausible.io ...; connect-src
  ... https://api.stripe.com https://*.supabase.co https://*.upstash.io ...;
  frame-src 'self' https://js.stripe.com https://hooks.stripe.com ...
```

(`X-Robots-Tag` is retained.)

## Choices and rationale

- **HSTS** two years, `includeSubDomains; preload`. Production is HTTPS-only on
  Vercel; this is preload-list ready.
- **X-Frame-Options SAMEORIGIN** plus CSP `frame-ancestors 'self'`: the site is
  never framed by third parties (Stripe frames into us, not the reverse).
- **Permissions-Policy** denies `camera`, `microphone`, and `browsing-topics`
  (none are used). `geolocation` (city detection) and `payment` (Stripe) are
  deliberately left at browser default so they keep working; tighten with an
  allow-list later if wanted.
- **CSP is REPORT-ONLY first** (per the brief). It does not block anything; it
  reports violations to the browser console so the allow-list can be tuned
  against real traffic. The source list covers the genuine third parties:
  Stripe (checkout iframe + API), Plausible (cookieless analytics), Supabase
  (data + storage images), Mapbox and Google Maps (city/venue maps), and the
  stock-image hosts. Sentry needs no external source because it tunnels through
  the same-origin `/api/monitoring` route. `script-src` keeps `'unsafe-inline'`
  and `'unsafe-eval'` for now (Next.js inline bootstrap + Mapbox GL).

## Next step (founder / follow-up)

1. Deploy the preview, open it, and watch the console for
   `Content-Security-Policy-Report-Only` violations across the key flows (home,
   browse, event detail, checkout with Stripe, a map page).
2. Fold any missing legitimate source into the policy.
3. Flip the header key from `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` to enforce. Consider replacing `'unsafe-inline'`
   in `script-src` with a nonce at that point.

Verify on any deployment with:

```
curl -sI https://<deployment>/ | grep -iE 'strict-transport|content-type-options|frame-options|referrer-policy|permissions-policy|content-security-policy'
```
