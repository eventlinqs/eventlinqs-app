# Launch Audit Playbook (re-runnable)

How to regenerate the launch defect register
(`docs/benchmark/system-pass/LAUNCH-DEFECT-REGISTER.md`) from scratch. The bar is
launch-ready, with Ticketmaster and Eventbrite as the minimum standard. The rule
is verify-first: every register entry must carry a file:line, command output, or
JSON key as proof, never an assumption. Items that can only be settled in a
third-party dashboard are recorded as NEEDS-DASHBOARD-CHECK with the exact thing
to confirm.

## 0. Pre-flight

1. Confirm the branch and tip: `git branch --show-current`, `git rev-parse --short HEAD`.
2. Disk guard (constitution): `df -h .` - if under 1.5 GB free, stop and report
   before any build/Lighthouse step.
3. Tooling check: `node -v`, `supabase --version`. On this machine `npx` is broken
   for the Supabase CLI; call `supabase` directly.

## 1. Fan out the static code audit (parallel agents)

Dispatch one general-purpose agent per independent area, in a single message so
they run concurrently. Each agent is told: evidence-only, do not fix, do not
assume, every claim needs a file:line, return raw findings (id, area, suggested
severity + justification, reproduction/detection steps, evidence, suspected
location). The seven areas:

1. Auth + sessions. Grep every `getSession()` and `getUser()`. Flag any
   server-side `getSession()` used for a trust/authorization decision (must be
   `getUser()`, which revalidates the JWT). Check `middleware.ts` exists and is
   wired. Check admin gate for 2FA/AAL and inactivity-timeout enforcement. Check
   null/expired handling.
2. Reservations + inventory. Find the Upstash/Redis client and the region (the
   REST URL prefix reveals it; `prepared-stork-...` with no prefix is not
   region-tagged). Audit the hold/TTL/expiry/release path and whether the
   decrement is atomic (FOR UPDATE / Lua / CAS) - oversell risk. Check Redis-down
   degradation.
3. Stripe payouts + revenue rounding. Find the revenue/earnings card and check
   money math (double-rounding, float cents, dollars/cents confusion, inclusion of
   refunded orders). Trace `createDestinationCharge` / `application_fee_amount` and
   the connected-account payout schedule (manual vs daily). Confirm charge ==
   display through `getPricingRule`. Check webhook signature + idempotency + refund.
4. Purchase funnel. Trace browse -> event detail -> reservation -> checkout ->
   payment -> ticket issuance -> confirmation email (Resend). Key checks: does the
   displayed total equal the charged total (dynamic pricing / discount divergence);
   is issuance webhook-driven (reliable) not browser-driven; is the Resend FROM
   `noreply@eventlinqs.com` (no `onboarding@resend.dev`); are insert failures
   swallowed.
5. Event/organiser/venue pages + Schema.org. Check each page emits valid JSON-LD;
   for the event, that Event has name, startDate, endDate, eventStatus,
   eventAttendanceMode, location+address, image, description, offers (price,
   priceCurrency=AUD, availability, validFrom), performer/organizer. Check
   BreadcrumbList, canonical, OG/Twitter, og:image.
6. Hardening checklist (static portions): Supabase Auth Site URL references and
   redirect-base helpers; Resend FROM address; Mapbox token (public?) and
   restriction evidence; `/events` cache headers (revalidate / s-maxage /
   force-dynamic); missing `/public/cities/*.svg` (list dir, grep references,
   cross-check); list local `supabase/migrations` for the drift comparison.
7. Mobile + images. Read `docs/benchmark/system-pass/mobile-audit/mobile-audit.json`
   for overflow/broken/console/axe. Check media components for chop (cover +
   forced mismatched aspect) / distort (fill, or width+height without object-fit).
   Flag raw `<img>` / `background-image` content / `next/image` in feature code.
   Check hero-scale law (one `.hero-marketing`, max 480px; no full-vh, no
   text-6xl/7xl, no white eyebrow). Note the overflow gotcha: measure
   `documentElement.scrollWidth` + a real scroll test, never `body.scrollWidth`.

## 2. Live checks (run yourself, do not delegate)

1. Migration drift (read-only): `supabase migration list --linked`. Any row with a
   populated Local column and an empty Remote column is unapplied drift. Record the
   exact filename. Fix is `supabase db push --linked` from a tree on the branch
   carrying the file (Lawal runs it); verify via a direct query against
   `supabase_migrations.schema_migrations`, not the PostgREST cache (it lags).
2. Filesystem proofs: `ls public/cities` and any asset the agents flag.
3. Vercel snapshot via the Vercel MCP: `list_teams` -> `list_projects` ->
   `get_project` + `list_deployments`. Record team/project ids, domains (watch for
   apex vs www and `.com` vs `.com.au`), production target, and the latest READY
   preview URL (the warmed Lighthouse target). Note: the MCP exposes no
   billing/usage endpoint - the quantified usage breakdown (bandwidth, function
   compute, image-optimisation units) must be read from the Vercel dashboard Usage
   tab; say so explicitly rather than guessing numbers.

## 3. Lighthouse (production build, warmed target, not localhost, not dev)

The law is 95+ on desktop AND mobile, as the median of repeated runs against the
warmed Vercel preview or warmed prod. Never a single localhost/dev run.

```
# Target the latest READY preview from step 2 (warm it first with a few requests).
URL="https://<latest-ready-preview>.vercel.app/"
for i in 1 2 3; do
  npx lighthouse "$URL" --preset=desktop --output=json \
    --output-path="lh-desktop-$i.json" --chrome-flags="--headless=new" --quiet
  npx lighthouse "$URL" --form-factor=mobile --output=json \
    --output-path="lh-mobile-$i.json" --chrome-flags="--headless=new" --quiet
done
# Take the median of performance/accessibility/best-practices/seo across the 3 runs.
```

Run it for the hero pages specifically (`/`, `/culture/<slug>`, an `/events/<slug>`)
since those carry the next/image LCP risk (Issue #42). Record the median per
category. If `npx` is unavailable on the machine, install lighthouse globally or
run it from a machine that can reach the preview. Disk guard before any local
production build.

## 4. Mobile + visual confirmation (screenshots for the RISK items)

Re-run the existing sweep and capture the open visual risks:

```
node scripts/mobile-audit.mjs        # 390px overflow / broken / console / axe sweep
node scripts/link-integrity-crawl.mjs   # Law 5: zero dead links (vs preview/local)
node scripts/affordance-scan.mjs        # no dead-end tiles
```

Then Playwright-screenshot, at 390 and 1440, each RISK the static pass could not
settle: a zero-event intersection page (CategoryHeroEmpty scale), an event-detail
hero and a city-tile rail (cover-crop on faces/text), a `/city/sydney` map-pin
popup (forced 16/10 crop), the homepage header (mobile-hidden search trigger), any
PageHero-driven page (text-6xl vs the text-5xl ceiling).

## 5. Assemble the register

Merge every finding into `docs/benchmark/system-pass/LAUNCH-DEFECT-REGISTER.md`:

- One stable id per defect, prefixed by area (AUTH, INFRA, RES, PAY, FUN, SEO,
  DATA, HARD, MOB, PERF).
- Fields: area, severity (P0/P1/P2/P3), reproduction/detection steps, evidence
  (file:line or command output or JSON key), suspected location.
- A severity summary table at the top, and a "What PASSED" section so the clean
  surfaces are not re-litigated next time.
- Severity rubric: P0 = breaks the buyer funnel or loses money at launch; P1 =
  must fix before launch; P2 = fix soon; P3 = informational. Elevate a P1 to P0
  when its trigger condition is actually live (for example, display-vs-charge
  divergence becomes P0 if a launch event uses dynamic pricing).

## 6. Fix policy

Do not fix anything except P0 blockers you can actually verify fixed. Payments and
fees are founder-controlled (constitution Fee system law): do not change them
without sign-off, and never apply a payments fix you cannot verify with a
Stripe test round-trip. When a P0 cannot be verify-fixed (external dependency,
founder decision, downstream coupling), document it as the top blocker with the
remediation and the reason it was not auto-applied, rather than blind-fixing.

## 7. Hand back

Commit the register + this playbook. Report: the severity counts, the P0 list, the
NEEDS-DASHBOARD-CHECK list (Supabase Site URL, Resend domain, Mapbox restriction,
Upstash region, Vercel env + usage), and the warmed preview URL used for
Lighthouse. Never merge without approval.
