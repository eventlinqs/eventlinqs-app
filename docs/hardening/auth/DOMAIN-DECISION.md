# Sender and canonical domain: the decision and its consequences

**Status:** sender domain RULED by the founder on 2026-08-03. Canonical host
question is REPORTED ONLY and awaits a separate ruling.
**Branch:** `feat/auth-hardening`

---

## 1. The founder ruling (executed on this branch)

> Standardise on `eventlinqs.com`. It is already Resend verified with live SPF,
> DKIM and return path, and `eventlinqs.com.au` has no Resend DNS at all.
> Rebuilding sender reputation on a new domain days before launch is the larger
> risk.

Executed. Every sender address in the codebase now derives from one definition,
`src/lib/email/sender.ts`, and a build guard fails on any literal.

### The evidence behind the ruling

Live from the Resend API on 2026-08-03:

```
$ curl -s -H "authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
RESEND DOMAINS:
   eventlinqs.com -> verified region ap-northeast-1
```

`eventlinqs.com` is the ONLY domain registered in Resend, and it is `verified`.

Live DNS, resolved over DNS-over-HTTPS:

```
TXT send.eventlinqs.com               v=spf1 include:dc-fd741b8612._spfm.send.eventlinqs.com ~all
TXT resend._domainkey.eventlinqs.com  p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDqNqSge6mj...
MX  send.eventlinqs.com               feedback-smtp.ap-northeast-1.amazonses.com

TXT eventlinqs.com.au                     (none)
TXT send.eventlinqs.com.au                NXDOMAIN
TXT resend._domainkey.eventlinqs.com.au   NXDOMAIN
```

`eventlinqs.com.au` has no SPF, no DKIM, no return path and no Resend
registration. A sender move would start from zero on all four.

---

## 2. What changed to make the sender single-source

Before, the sending identity was a string literal in FIVE files. A domain move
was a five-file archaeology exercise with no way to prove it was complete.

| File | Was | Now |
|---|---|---|
| `src/lib/email/send.ts` | `process.env.EMAIL_FROM ?? 'EventLinqs <hello@eventlinqs.com>'` | `getEmailFrom()` |
| `src/lib/email/order-confirmation.ts:199` | `'EventLinqs <noreply@eventlinqs.com>'` | `getNoReplyFrom()` |
| `src/lib/email/order-confirmation.ts:201` | `replyTo: 'hello@eventlinqs.com'` | `getReplyToAddress()` |
| `src/lib/waitlist/promote.ts:123` | `'EventLinqs <noreply@eventlinqs.com>'` | `getNoReplyFrom()` |
| `src/lib/payouts/email.ts:28` | `const FROM = 'EventLinqs <noreply@eventlinqs.com>'` | `getNoReplyFrom()` |
| `src/app/api/webhooks/stripe/route.ts:1194,1196` | `from:` and `replyTo:` literals | `getNoReplyFrom()`, `getReplyToAddress()` |

The Stripe webhook edit is **sender identity only**. Two literal strings became
two function calls. No payment logic, no funds-holding path and no order state
was touched. It is included because the founder's instruction was explicit that
every sender address must derive from one definition.

A future domain move is now genuinely one line: set `EMAIL_FROM` in the Vercel
environment. `getSenderDomain()` parses the host out of it and every other
address follows, which is asserted by
`tests/unit/email/sender.test.ts` ("setting EMAIL_FROM moves EVERY address").

Guard: `scripts/guards/sender-single-source.mjs`, wired into `prebuild`.

---

## 3. Complete inventory: every place a domain is assumed

### 3.1 Sender identity (RESOLVED, now single-source)

One definition: `src/lib/email/sender.ts`, `DEFAULT_SENDER_DOMAIN = 'eventlinqs.com'`.

### 3.2 Canonical host constants (NOT CHANGED, needs a ruling)

| Location | Value | Effect |
|---|---|---|
| `src/lib/site-url.ts:36` | `PRODUCTION_FALLBACK = 'https://www.eventlinqs.com'` | last-resort origin for metadata, sitemap, emails |
| `src/proxy.ts:89` | `APEX_HOST = 'eventlinqs.com'` | apex detection for the 308 |
| `src/proxy.ts:90` | `CANONICAL_HOST = 'www.eventlinqs.com'` | 308 redirect target |

**This is the live defect.** Probed on 2026-08-03:

```
eventlinqs.com/login          301 -> https://www.eventlinqs.com.au/login
www.eventlinqs.com.au/login   200
eventlinqs.com/login          308 -> https://www.eventlinqs.com/login   (our proxy)
www.eventlinqs.com/login      301 -> https://www.eventlinqs.com.au/login (Vercel domain redirect)
```

A visitor arriving on the bare `.com` apex takes TWO redirects to reach the live
site, because our proxy sends them to `www.eventlinqs.com` and Vercel then sends
them on to `www.eventlinqs.com.au`. It works, but it is a wasted hop on every
cold entry and it means the code's idea of "canonical" and the platform's differ.

### 3.3 Hardcoded site-URL fallbacks

**23 occurrences across 20 files** of `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'`
(and the `NEXT_PUBLIC_APP_URL` variant). Examples: `src/app/actions/auth.ts:22`,
`src/app/cities/page.tsx:15`, `src/app/events/[slug]/page.tsx:215`,
`src/app/community/[community]/page.tsx:137`, `src/app/api/webhooks/stripe/route.ts:487`.

These are inert on Vercel, where `NEXT_PUBLIC_SITE_URL` is always set. They
matter only if that variable is ever unset.

### 3.4 Contact addresses rendered in page copy

**34 occurrences** of `mailto:<local>@eventlinqs.com` across the legal, careers,
press, checkout and accessibility pages: `careers@`, `legal@`, `privacy@`,
`press@`, `support@`, `organisers@`, `hello@`.

Deliberately OUT of scope for the sender guard: these are user-facing copy under
the design lock, not transport configuration. They are listed here so the domain
decision covers them.

### 3.5 CI and workflows

| File | Line | Value |
|---|---|---|
| `.github/workflows/ci.yml` | 25, 112 | `NEXT_PUBLIC_SITE_URL: https://eventlinqs.com` (build placeholder) |
| `.github/workflows/post-deploy-smoke.yml` | 67 | `PROD_URL: https://www.eventlinqs.com` |
| `.github/workflows/post-deploy-smoke.yml` | 159 | sentinel curl against `https://www.eventlinqs.com` |
| `.github/workflows/post-deploy-smoke.yml` | 190, 193 | alert `from`/`to` on `@eventlinqs.com` |

**Note:** the post-deploy smoke is currently pointed at `www.eventlinqs.com`,
which 301s to `.com.au`. It passes, because curl follows the redirect, but it is
not smoking the host users actually land on.

### 3.6 Tests that would need changing

- `tests/unit/security/canonical-host-redirect.test.ts` asserts
  `eventlinqs.com` 308s to `www.eventlinqs.com` (4 assertions).
- `tests/unit/security/no-localhost-app-url-fallback.test.ts` asserts the
  `.com` production fallback.
- `tests/unit/email/sender.test.ts` asserts the `eventlinqs.com` default
  (this one encodes the founder ruling and should only change if the ruling does).
- `tests/e2e/certification.spec.ts`, `tests/e2e/site-header-cookie-snapshot.production.spec.ts`.

### 3.7 Supabase dashboard

Supabase Auth **Site URL is `https://www.eventlinqs.com/`**, read back
behaviourally on 2026-08-03 by sending a deliberately non-allowlisted
`redirect_to` and observing the fallback:

```
redirect_to=https://attacker.example.com/steal -> 303 https://www.eventlinqs.com/#error=...
```

Both `.com.au` auth redirect URLs ARE already allowlisted, so OAuth and reset
would work once Google is on. Only the Site URL is wrong.

---

## 4. Recommendation on the canonical host (DO NOT EXECUTE, founder rules)

The sender domain and the canonical WEB host are independent decisions, and the
right answer differs for each.

**Sender: stay on `eventlinqs.com`.** Ruled, executed, evidence above.

**Web: standardise on `www.eventlinqs.com.au`.** It is where users land, where
Google will index, and where the Australian market expects an Australian
ticketing platform to live. The current arrangement makes the code's canonical
host a waypoint rather than a destination.

There is no conflict in sending mail from a `.com` while the site lives on a
`.com.au`. It is common and costs nothing technically. The only consideration is
presentation: a recipient sees `hello@eventlinqs.com` on mail about
`eventlinqs.com.au`. Mitigated by the fact that we own both and `.com` redirects
to `.com.au`, so a curious recipient who types it in arrives in the right place.

### Exact consequences of standardising the web host on `.com.au`

| What | Change | Risk |
|---|---|---|
| `src/proxy.ts:89-90` | `APEX_HOST`/`CANONICAL_HOST` to the `.com.au` pair | Low. Removes one redirect hop. |
| `src/lib/site-url.ts:36` | `PRODUCTION_FALLBACK` to `https://www.eventlinqs.com.au` | Low. Inert while the env var is set. |
| Supabase Site URL | to `https://www.eventlinqs.com.au` | **Do this regardless.** See FOUNDER-STEPS. |
| `tests/unit/security/canonical-host-redirect.test.ts` | rewrite 4 assertions | Low, mechanical. |
| `tests/unit/security/no-localhost-app-url-fallback.test.ts` | update expected fallback | Low, mechanical. |
| `.github/workflows/post-deploy-smoke.yml:67,159` | `PROD_URL` to `.com.au` | Low. Smokes the real host. |
| `.github/workflows/ci.yml:25,112` | placeholder only | None. Cosmetic. |
| 23 hardcoded `?? 'https://eventlinqs.com'` fallbacks | ideally route through `getSiteUrl()` | Low, but 20 files. Separate tidy-up PR. |
| 34 `mailto:` contact addresses in page copy | leave on `.com` | None, if the sender stays on `.com`. |
| Google OAuth authorised origins | must list the `.com.au` host | Already required. See FOUNDER-STEPS. |
| SEO | 301 from `.com` already exists; add `.com.au` to Search Console and resubmit the sitemap | Medium if forgotten. Worth a checklist item. |

### The one change I recommend doing immediately, independent of the rest

**Set the Supabase Auth Site URL to `https://www.eventlinqs.com.au`.** It is
wrong today whichever way the canonical-host question is settled, because it
names a host that only exists as a redirect. It is in the Phase 6 founder block.

---

## 5. Not executed here, and why

Nothing in section 4 beyond the sender single-source has been changed. The brief
scoped Phase 5 to "Report only, do not change ... Recommend, do not execute. The
founder rules on it." The founder's 2026-08-03 correction ruled on the sender
domain specifically and reaffirmed that everything else proceeds as written.
