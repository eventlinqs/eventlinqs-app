# Security audit 2026-08-08, sections 2 to 8

Companion to `AUDIT-2026-08-08.md`, which covers section 1 and the RLS findings.
Read the `UNFULFILLED` block at the top of that file first.

All findings here are **CODE-VERIFIED**: read in source that runs, or executed.
None is MIGRATION-DERIVED.

## MEDIUM-1: Session Replay shipped unmasked personal data to a third party

**ASVS 14.2.3** (sensitive data must not be sent to untrusted parties, for example
user trackers) and **16.2.5** (logging enforced by the data's protection level).

`src/lib/observability/sentry-client-boot.ts` configured
`replayIntegration({ maskAllText: false, blockAllMedia: false })`. Both default to
`true`; this switched both off.

The part that made it a real exposure rather than a preference:
**`beforeSend` does not apply to Session Replay.** Sentry documents a separate
hook, `beforeAddRecordingEvent`, and there was none. So the `scrubValue`
discipline that covers every error event covered **no replay at all**, while
`replaysOnErrorSampleRate` sat at `1.0`, meaning every error uploaded a recording
of the preceding roughly 60 seconds of DOM.

What that DOM holds on this platform: buyer names and email addresses on the
organiser orders and attendee screens, a ticket code on the ticket page, and a
name and email at checkout. Sentry's own guidance for disabling `maskAllText` is
to do so "only if your site has no sensitive data". This site is almost entirely
other people's data. Verified against Sentry's published privacy documentation,
not recalled.

**Fixed** by restoring both defaults, with the cost stated in the code: replays
now localise a fault to an element rather than showing the value. Recovering
fidelity means `unmask`/`unblock` selectors for regions proven to hold no personal
data, which is opt-in per element. Disabling masking wholesale is opt-out for the
entire product.

**Guard:** `tests/unit/security/pii-egress.test.ts`, 9 tests, including one that
fails if the reasoning comment is removed, so the value cannot be flipped back for
debugging convenience without confronting why it is set.

**Verified sound, not a finding.** The error-event path was already correct.
`scrubValue` (`src/lib/observability/pii-scrub.ts`) removes emails, phones, Stripe
ids, JWTs, bearer tokens and card-shaped digits, and drops `authorization` and
`cookie` headers outright. My first grep looked in `instrumentation-client.ts`,
found no `beforeSend`, and was wrong: the SDK is deferred and the scrubber is
wired in `sentry-client-boot.ts`. Recorded so the near-miss is visible.

## MEDIUM-2: two server pages handed whole database rows to client components

**ASVS 8.2.3** (field-level authorisation).

A prop passed from a server component into a client component is serialised into
the RSC payload and readable with view-source.

| Page | Was | Rendered | Now |
|---|---|---|---|
| `dashboard/events/[id]/orders/page.tsx` | `select('*')`, 25 columns including `user_id`, `metadata`, `reservation_id`, `discount_code_id`, the full fee breakdown | 8 fields | explicit 9-column list |
| `dashboard/events/page.tsx` | `select('*')`, 64 columns | 9 fields | explicit 7-column list |

These are the organiser's own events and orders, so **not a cross-tenant leak**.
It is unnecessary width at a trust boundary, and width there is what an XSS on the
page, or a Session Replay recording of it, carries away.

**Guard:** a sweep in `pii-egress.test.ts` pairs each known client table component
with the pages that render it and fails on `select('*')`. That sweep is how the
`events` instance was found; I had only spotted `orders` by hand.

## MEDIUM-3: the Content-Security-Policy blocked nothing

**ASVS 3.4.3**, and **3.4.6**, which states X-Frame-Options is obsolete and must
not be relied upon.

The CSP shipped only as `Content-Security-Policy-Report-Only`. A report-only CSP is
a measurement instrument, not a control, and the header list described it alongside
the real controls as though it were enforcing.

**Fixed narrowly rather than bravely.** Flipping the full policy would enforce
`script-src` and `style-src` allowlists whose report run is not confirmed clean,
and a CSP that breaks the Stripe iframe breaks checkout. So four directives that
are already satisfied, carry no allowlist and need no nonce work are now enforced
beside the report-only policy:

```
Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'
```

Verified on a live response, not only in config. `form-action 'self'` is directly
relevant to this pass: it is the last line of defence if a form's destination is
ever tampered with.

The enforced policy declares **no `default-src`**, so it cannot break what works
today, and a test fails if anyone adds one.

**The gap, recorded rather than tolerated:** the report-only policy still carries
`'unsafe-inline'` and `'unsafe-eval'`, so **the enforced policy does not mitigate
XSS**. Full enforcement needs per-response nonces. A test asserts the codebase
admits this.

**Headers already correct:** HSTS (2 years, includeSubDomains, preload),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions-Policy. All
pinned by `tests/unit/security/security-headers.test.ts` (13 tests).

## LOW-1: the Supabase auth cookie is readable by client-side JavaScript

**ASVS 3.3.4**, and this control is **NOT ACHIEVABLE** here. Stated plainly, as the
brief requires, rather than reported as a fixable defect.

Measured, not assumed:

```
node_modules/@supabase/ssr/dist/main/utils/constants.js:6-7
    sameSite: "lax",
    httpOnly: false,
```

The application sets no auth cookie of its own. `@supabase/ssr` owns them and sets
`httpOnly: false` by design, because the browser SDK must read the session.
Forcing `httpOnly` would break the browser client.

**Why it is not severe, and where it does bite.** Any XSS able to read the cookie
could already act as the user through the page. What the JS-readable cookie adds is
that an XSS also captures the **refresh** token, which outlives the session it
could otherwise ride. The mitigation is therefore XSS prevention, which is the
nonce work named in MEDIUM-3, not a cookie flag.

`SameSite=Lax` is appropriate. The one cookie the app sets itself
(`/api/location/set`) is a location preference with `sameSite: 'lax'` and no
`secure` flag; it carries nothing sensitive, so it is noted, not ranked.

## Account enumeration: a deliberate L3 deviation, not a defect at the target level

**ASVS 6.3.8** (L3): valid users must not be deducible from registration or
forgot-password functionality.

Three of the four endpoints that accept an email are enumeration-safe and return a
fixed generic response whether or not the account exists: `/api/auth/recover`,
`/api/auth/magic-link`, `/api/auth/resend-verification`.

`/api/auth/signup` is not. `src/app/api/auth/signup/route.ts:100-110` returns HTTP
**409** with "An account with that email already exists", which confirms existence.
It is rate-limited at 5 per IP per 10 minutes (`auth-signup`), so bulk enumeration
is slow but possible.

**Adjudication: not a finding at the stated target.** The threat model sets ASVS
**L2** platform-wide, with L3 on payments, admin and the funds path. Signup is not
in the L3 set and 6.3.8 is an L3 requirement. The current behaviour is also a real
UX gain over a silent no-op. Recorded as a conscious deviation so the decision is
visible, and it is the founder's to reverse.

## Dependency triage: every advisory, with reachability

The brief required each advisory triaged rather than dismissed. My first attempt
wrote "every remaining advisory is transitive", which is a dismissal wearing the
clothes of a triage: `direct=false` is not a reachability argument. Redone.

**Progress: total 35 to 28. High 11 to 7. Moderate 22 to 19.**

### Fixed, because reachable

| Package | Advisory | Why it was reachable | Fix |
|---|---|---|---|
| `next` 16.2.7 | GHSA-6gpp-xcg3-4w24 proxy bypass, plus 8 more | `src/proxy.ts` holds four security decisions and the build is Turbopack | 16.3.0 |
| `sharp` 0.34.5 | GHSA-f88m-g3jw-g9cj, libvips CVEs | `src/lib/upload.ts` hands user `File` bytes to a native decoder | 0.35.3 |
| `sharp` nested under `next` | same | next/image optimises organiser-uploaded covers from Supabase storage | lifted by next 16.3.0, which declares `^0.35.3` |
| `postcss` | source-map path traversal | bundled by Next | lifted by next 16.3.0 |
| `@sentry/nextjs`, `resend`, `svix` | transitive, including `uuid` | runtime packages | 10.69.0 and 6.18.1 |

### Dev and build only, conclusively not runtime-reachable

Established with `npm audit --omit=dev`, which is evidence rather than an assumption
about where a package runs. Absent from the production tree entirely:

`ip-address` (high), `js-yaml` (high), `undici` (high), `vite` (high), `esbuild`,
`lighthouse`, and 11 `@opentelemetry/instrumentation-*` packages for frameworks
this platform does not use (amqplib, connect, express, hapi, koa, mongoose, mysql2,
pg, fs, undici).

**Four of the seven remaining highs are in this group.**

### In the production tree but not reachable, with the reason

| Package | Advisory | Why not reachable |
|---|---|---|
| `ws` (high) | memory-exhaustion DoS from tiny frames | Required only by `@supabase/realtime-js`. The app never opens a realtime channel: no `.channel(` call exists anywhere in `src`. The socket code is bundled and never entered. |
| `brace-expansion` (high) | exponential-time expansion DoS | Required by `minimatch`, pulled by `@sentry/node` for its own config path matching and by `readdir-glob`. The DoS needs an attacker-controlled glob pattern; no surface accepts one. |
| `fast-uri` (high) | host confusion via backslash authority | Required by `ajv` via `ajv-formats` and `schema-utils`, both build-time schema tooling. No user-supplied URI is validated through ajv. |
| `uuid` (moderate) | missing buffer bounds check in v3/v5/v6 **when `buf` is provided** | Reached only via `exceljs` and `svix`, neither of which passes a `buf`. No direct use in `src`. The offered fix downgrades `exceljs` to 3.4.0, a semver-major step backwards, which is worse than the risk. |
| `@babel/core` (low) | arbitrary file read via `sourceMappingURL` | Executes at build time only. |

### Reachable, moderate, and NOT FIXABLE today

`@opentelemetry/core` GHSA-8988-4f7v-96qf, unbounded memory allocation in W3C
Baggage propagation, with `@opentelemetry/instrumentation-http`, `resources`,
`sdk-trace-base` and `@sentry/node` as carriers.

**Reachable**, and not softened: Sentry's Node SDK installs HTTP instrumentation
that parses the `baggage` header on inbound requests, so a crafted header reaches
the vulnerable parser on any request.

**No fix exists.** The advisory is fixed in `@opentelemetry/core` 2.8.0, and
`@sentry/node` pins `^1.30.1`:

```
node_modules/@sentry/node requires @opentelemetry/core ^1.30.1   (installed 1.30.1)
```

Bumping `@sentry/nextjs` to the current 10.69.0 does not lift it. An npm override
forcing 2.x would cross a major OTel API boundary inside Sentry and break it.

**Bounding it:** memory-allocation DoS, no data exposure, and Vercel caps request
header size in front of the function. **What would resolve it:** Sentry migrating
its Node SDK to OTel 2.x. A watch item, not an action.

## Section 8: the shared store, and the direct answer

**How does a local process obtain production credentials when the doctrine says
development holds no secrets?**

**No code path falls back to production.** `getRedisClient()`
(`src/lib/redis/client.ts`) reads `UPSTASH_REDIS_REST_URL` and `_TOKEN` straight
from `process.env`, with no default and no fallback. The credentials arrive only if
a developer's `.env.local` contains production values, which is the known footgun
in this repo. This checkout has no `.env.local`, so it holds no secrets.

**The real defect is not a fallback. It is two absences:**

1. **No environment binding.** Supabase has a real mechanism: the `*_PREVIEW`
   overrides in `src/lib/supabase/env.ts`, proven by an existing test I should have
   read sooner, `tests/unit/security/supabase-env-isolation.test.ts`. Upstash has
   no equivalent, and no assertion that the instance reached matches the runtime it
   is running in.
2. **No environment namespace on any shared key**, so a credential mix-up is silent
   by construction. All three key spaces share the shape: `ff:v1:<flag>`
   (`src/lib/flags/broadcast.ts:65`), `rl:<policy>:<ip>:<window>`
   (`src/lib/redis/rate-limit.ts`), and the inventory cache. Namespacing one key
   fixed one symptom and left the shape intact.

**Not fixed, deliberately.** The brief forbids touching a Redis key without
reporting first, and this is that report. Recommended fix: mirror the Supabase
pattern with an environment-derived prefix on every key, plus an
`upstash-env-isolation` test in the shape of the Supabase one. It needs founder
approval because changing key prefixes invalidates every cached flag and every
in-flight rate-limit window at deploy time.

## IDOR sweep, CODE-VERIFIED sound

Not a complete enumeration; see `UNFULFILLED` item 1. What was read, and holds:

- `me/ref`, `notifications/prefs`, `push/subscribe`, `push/unsubscribe` all scope
  by `user.id` from `getUser()`, never by a client-supplied id.
  `push/unsubscribe` scopes its DELETE by endpoint **and** `user_id`.
- All three Stripe Connect routes (`onboard`, `refresh`, `return`) enforce
  `org.owner_id !== user.id` before acting.
- `getOrganiserEvent()` and `resolveOrganiserScope()` are real ownership gates:
  session client, owner filter, fail closed on every miss.
- `transferTicket` and `scanTicket` delegate authorisation to `SECURITY DEFINER`
  RPCs rather than trusting the caller.
- The admin console is gated once at the route-group layout, covering the roughly
  17 `src/lib/admin/*` service-role modules.
- No secret reaches client code: every `process.env` read in a `'use client'` file
  is `NEXT_PUBLIC_` or `NODE_ENV`, pinned by a test.

**Prior work I should have read first.** `tests/unit/security/` already contained
eight security proofs, including `update-event-idor.test.ts` (IDOR-01),
`no-server-side-getsession.test.ts` (getSession must never back an authorisation
decision) and `middleware-protected-route.test.ts`. I audited without reading them,
which is a process failure recorded in the roast ledger.

## Founder action block, consolidated

1. **Apply the migration.** `supabase db push --linked` for
   `20260808000010_rls_column_privilege_lockdown.sql`. Run
   `scripts/security/rls-live-audit.sql` before and after.
2. **Run the live catalogue audit** and paste Block 2 back. It is the only way to
   complete the all-tables enumeration, and it also settles whether `event_artists`
   and `venues` are genuinely exposed.
3. **Decide on the Redis namespace fix** (section 8). It invalidates cached flags
   and in-flight rate-limit windows on deploy, so it is your call, not mine.
4. **Decide on `/api/auth/signup` enumeration** (ASVS 6.3.8). Compliant at the L2
   target, deviates at L3, and the current behaviour is better UX.
5. **Optional:** `agentRules: false` in `next.config.ts` if you would rather Next
   16.3 stopped writing a block into CLAUDE.md on every `next dev`.
