# HANDOVER: feat/launch-kit-moat, session 3

Written 8 August 2026. Branch `feat/launch-kit-moat`, 8 commits on top of
session 2's 9. **Nothing merged. Nothing pushed. Nothing applied to production.**

Gates at HEAD: tsc clean, eslint **47 warnings 0 errors** (baseline 48),
**1478 tests across 131 files** (session 2: 1366 across 125), copy-tell-gate
clean.

---

## 1. THE BOARD

`node scripts/verify/reach-integrity.mjs [--production|--code-only]`

**TEST: 15 pass, 1 FAIL, 2 empty.**
**PRODUCTION: 12 pass, 2 FAIL, 4 empty.**

All five failing checks from session 2 are resolved. What remains:

| Check | Where | Why it is still red |
|---|---|---|
| `flags-off-by-oversight` | both | **Founder decision.** Investigated, not decided. See `docs/roast/flags/INVESTIGATION.md` |
| `city-primary-coverage` | production only | The backfill migration is applied to TEST (361 of 361) and **not to production**, by design |

---

## 2. WHAT SHIPPED, and the proof for each

| Commit | What | Proof |
|---|---|---|
| `5da162d` | Share conversions settled with a real paid purchase | 9 of 9 legs, order EL-86C9MXW3, `docs/roast/share-conversion/` |
| `8f0a05c` | Every filter in a clickable link parsed and applied | 45 unit + 16 of 16 e2e, `docs/roast/url-filters/` |
| `4ef0f98` | Search reaches past the title; the three tabs answer | 29 of 29 e2e, `docs/roast/search-reach/` |
| `9d72c40` | Districts are assigned, not asserted | 15 unit + 17 of 17 e2e, `docs/roast/suburb-districts/` |
| `3681683` | Three migrations applied to TEST + the exclusivity gate | Both verifiers ALL GREEN, `docs/roast/migrations-applied/` |
| `6f69ad8` | Flag cache namespaced; a duplicate Follow control removed | `docs/roast/flags/INVESTIGATION.md` |
| `fccaafc` | R1, the two tiles that could never match an event | BEFORE/AFTER + 9 of 9 tiles clicked, `docs/roast/category-taxonomy/` |
| `8c72eeb` | A link-preview crawler is not a click | 26 unit + 13 of 13 e2e, `docs/roast/share-beacon/` |
| `e2300d9` | The output review harness, organiser-copy half | 1478 tests, `docs/roast/organiser-copy/` |

---

## 3. THE THREE FINDINGS A FRESH SESSION MUST NOT RE-DERIVE

**A. The worst defect of the session had no symptom at all.**
Six Melbourne district pages were six copies of the city page. 43 of the 55
Melbourne events carry the CBD centroid as their venue coordinate, every
Melbourne district sits within 12 km of the CBD, and the membership test was
INCLUSIVE. Nothing was empty, nothing errored, every page looked full, and every
one of them gave a wrong answer that looked exactly like a right one.

Assignment must be EXCLUSIVE (the one nearest district). There is a standing
gate, `district-assignment-is-exclusive`, which was negative-tested by injecting
the regression and watching it fire. **The audit for the same mistake elsewhere
came back clean**: the `distance_km` filter is legitimately inclusive (the user
asked for everything in a radius), `nearestPickerCity` is already exclusive, and
`radiusDeg` is a dead prop.

**B. The feature-flag cache was shared across environments.**
The key was `ff:v1:<flag>` with no environment in it, while the Upstash
credentials live in `.env.local` and the database credentials do not. Any
process pointed at another database wrote ITS flag values into the Redis
production reads. Measured live: `ff:v1:broadcast_artists = "true"` in the shared
cache while the production row is `false`. Bounded by the 30 second TTL, no
production behaviour change observed. Now `ff:v2:<project-ref>:<flag>`.
**`.env.test` still has no Upstash credentials**, which is why a local run
borrows production's; the namespacing makes it safe, a separate instance would
make it obviously safe.

**C. Production's 57 "clicks" were never clicks.**
All 57 on `facebook` and `x` links, across 55 distinct visitor hashes, with 1 of
those 55 ever running the view beacon. A crawler fleet. The beacon was never
broken (3 views prove it fires). The defect was counting crawler hits as clicks
and showing an organiser "57 clicks, 0 sales", which reads as "they clicked and
did not buy" when nobody clicked. Crawlers now record nothing. **The 57
historical rows on production are untouched** and cleaning them needs founder
sign-off.

---

## 4. WHAT IS NOT DONE, stated plainly

**The predecessor's Parts A to E are UNTOUCHED by this session.** Excluding the
items the other session took (A2, A4, B1, B2, E2), what remains is:

| # | Item | Est. |
|---|---|---|
| A1 | Public composer | 24 to 34 h |
| A3 | Spread mechanic in the kit | 6 to 10 h |
| C6 | Venue address resolution | 5 to 8 h |
| C7 + E1 | Voice, with cross-browser testing | 8 to 12 h |
| D2 | Full seven-step walkthrough | 10 to 16 h |
| D4 | Founder walkthrough script | 2 to 3 h |
| E3 | Composer desk | 40 to 55 h |

Roughly **95 to 138 hours**. None of it was started, and none of it is claimed.

**R5 and F6 remain BLOCKED** on `ANTHROPIC_API_KEY`, which is absent from every
local env file. The output review covers the deterministic floor only, and says
so in its own output rather than implying it exercised the model.

---

## 5. THE FOUNDER DECISIONS OUTSTANDING

1. **`broadcast_artists`: recommend ON.** Built, wired across 14 read sites all
   failing closed, and proven by a gate that left nine screenshots and a
   `gate.json` showing attribution splitting correctly across two artists, two
   tracked links, both dashboards and the share card. The behaviour change to
   weigh: it publishes a public page per tagged performer.
2. **`broadcast_follow`: recommend ON, now that the duplicate control is gone.**
   The incoherence it resolves: with the flag off, a visitor CAN follow, the row
   IS written and the alert cron DOES read it, but the Following section is
   gated, so people cannot see or withdraw the follow graph the platform is
   collecting.
3. **The 57 historical crawler rows on production.** Delete, reclassify, or
   leave.
4. **`nearestPickerCity` has no upper bound**, so a visitor far outside Australia
   is assigned the nearest Australian city as their detected location. Defensible
   for a control they can change; worth a ruling if it is ever shown as fact.
5. **Production migrations.** `20260808000001` to `000005` are applied to TEST
   only. The production approval block holds every one of them.

---

## 6. GOTCHAS THAT COST ME TIME

- **`UPDATE ... FROM LATERAL` cannot reference the update target** in PostgreSQL
  (SQLSTATE 42P10). Use a correlated scalar subquery in `SET`. The push failed
  loudly and cleanly: 000001 and 000002 committed, 000003 did not.
- **The Supabase CLI's direct connection times out from this machine.** Use
  `--db-url` with the pooler string from `.env.test`, percent-encoded (the
  password contains `?` and `$`, so `new URL()` throws on it).
- **`.env.test` has no Upstash**, so a local dev server silently inherits
  production's from `.env.local`. Export blank `UPSTASH_*` for any run that
  touches feature flags, or the flag you just changed will be read from cache.
- **Playwright's default user agent contains `HeadlessChrome`**, which the new
  crawler filter drops deliberately. Any harness simulating a human must set a
  real browser agent explicitly.
- **A refactor can turn a failing check green without touching the defect.**
  Moving the search predicate out of a literal `ilike('title', ...)` call made
  `search-matches-more-than-title` pass while search was untouched. Checks that
  match on syntax rather than on the decision are fragile; that one now reads the
  predicate function itself.
- **`npx tsc --noEmit` fails on partially written `.next/dev/types`** while a dev
  server is running. Stop it and `rm -rf .next/dev` first.
- Python is not available on this machine; use node for text patching.
