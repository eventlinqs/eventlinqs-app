# Map token restrictions audit and founder action

Status: AWAITING FOUNDER ACTION (Google Maps key)
Owner: Lawal Adams
Estimated time: 10 minutes
Cost: zero (restrictions are free)
Blocks: launch readiness checklist Section 1 (no exposed secrets)

## Why this matters

Public client-rendered map APIs require a key that ships in the browser bundle. That key is technically not secret. The security posture comes from binding the key to the domains and APIs it is allowed to serve. Without restrictions, anyone who scrapes the bundle can use the key on their own site and burn through your billing quota or trigger your monthly cap.

EventLinqs renders maps on `/events/[slug]` (venue location) and `/events?view=map` (clustered grid). Both consume `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` via `src/lib/maps/google-maps-loader.ts`. The key currently has no restrictions documented. We harden it now.

## Audit findings - 2026-05-02

### Mapbox

`grep -rni "mapbox" src/` returned zero hits. `.env.example` does not declare a Mapbox token. `package.json` does not depend on any Mapbox SDK.

Verdict: **N/A**. Mapbox is not used in the EventLinqs codebase. The original task brief named Mapbox; in this codebase the equivalent surface is Google Maps. Audit pivots accordingly.

### Google Maps JavaScript API

Active. Two surfaces:

1. `src/components/features/events/m5-events-map.tsx` - clustered events grid (lazy-loaded via `import()` of `@googlemaps/markerclusterer`).
2. `src/lib/maps/google-maps-loader.ts` - the loader that calls `setOptions({ key, v: 'weekly', libraries: ['maps', 'marker'] })` from the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var.

Restrictions to apply: HTTP referrer restrictions (production + preview domains) plus API restrictions (Maps JavaScript API + Places API only, no Geocoding billing surprise).

### Pexels API key

`PEXELS_API_KEY` is server-side only per `.env.example` and is consumed by `next/image`-style transforms. Not browser-exposed, no client-side restriction needed. Rotation policy belongs to Phase 4 secret rotation.

### Stripe publishable key

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is bundled to clients. Stripe publishable keys are scoped at issuance to the Stripe account; they cannot be used to charge a different account. No additional restrictions needed.

### Supabase anon key

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is bundled to clients by design. Security comes from Row-Level Security policies on the database, not from token-level domain restriction. RLS policy audit is a Phase 4 deliverable.

## Founder action: restrict Google Maps API key

### 1. Open the key

1. Go to https://console.cloud.google.com/google/maps-apis/credentials
2. Sign in with the EventLinqs Google account
3. Click the API key currently in use (the one matching `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel)

### 2. Apply HTTP referrer restrictions

In the "Application restrictions" section:

1. Select "Websites"
2. Add the following referrers (one per line):
   ```
   https://eventlinqs.com/*
   https://www.eventlinqs.com/*
   https://*.vercel.app/*
   http://localhost:*/*
   ```
3. The `localhost` entry is for local dev. The `vercel.app` wildcard covers preview deployments.

### 3. Apply API restrictions

In the "API restrictions" section:

1. Select "Restrict key"
2. Pick only the APIs the codebase actually uses:
   - Maps JavaScript API
   - Places API (if used; check `m5-events-map.tsx` for any Place lookups before enabling)

If any other Maps API is enabled (Geocoding, Distance Matrix, Routes), un-tick them. Reduces blast radius if the key leaks.

### 4. Apply quota cap

In the "API quotas" panel for each restricted API:

1. Set a daily request quota that comfortably covers expected launch traffic (~50k requests per day at 10k visitors who hit a map page is a starting upper bound).
2. Set a per-user quota (optional) of 100 requests per minute.

This prevents a runaway loop or scraper from generating a $5000 invoice.

### 5. Save

Click "Save" at the bottom. Restrictions take effect within 5 minutes.

### 6. Tell me you are done

Reply: "Google Maps key restricted." I will:
1. Verify the production map renders normally on `/events?view=map` and `/events/[slug]`.
2. Verify a curl from a non-allowed referrer (e.g. `curl -H "Referer: https://attacker.example/" "https://maps.googleapis.com/maps/api/js?key={KEY}"`) is rejected.
3. Log closure to `docs/sessions/hardening/progress.log`.

## Token-scoping summary

| Token | Surface | Browser-exposed | Restrictions applied | Owner |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps client | Yes | HTTP referrer + API + quota | Phase 1 deliverable C |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client | Yes | RLS at DB layer | Phase 4 (RLS audit) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Elements | Yes | Stripe-account-scoped | Phase 4 (audit only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | No | Vercel env, never logged | Phase 4 (rotation policy) |
| `STRIPE_SECRET_KEY` | Server only | No | Vercel env, never logged | Phase 4 (rotation policy) |
| `STRIPE_WEBHOOK_SECRET` | Server only | No | Vercel env | Phase 4 |
| `RESEND_API_KEY` | Server only | No | Vercel env | Phase 4 |
| `UPSTASH_REDIS_REST_TOKEN` | Server only | No | Vercel env | Phase 4 |
| `PEXELS_API_KEY` | Server only | No | Vercel env | Phase 4 |
| `SENTRY_AUTH_TOKEN` | Build-time only | No | Vercel env (build secret scope) | Phase 4 |

All `NEXT_PUBLIC_*` keys are intentionally browser-exposed. All others MUST stay server-side only. Phase 4 will add a CI grep that fails the build if a non-`NEXT_PUBLIC_` env var name appears in a client component bundle.

## Reference

- Google Maps API key restrictions: https://developers.google.com/maps/api-security-best-practices
- Stripe publishable vs secret keys: https://docs.stripe.com/keys
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
