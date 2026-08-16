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

---

## 7. SESSION 3 ADDENDUM: the store-isolation and collision work

Four commits after the handover above: `eabfa3c`, `4287a29`, `bd13522`.

### Flag rulings, recorded

Both ON by founder ruling. In `FLAG_INTENT` with the ruling as the authority,
and in the approval block as items **5** and **6** with exact commands, each
stated as a behaviour change on a live platform. **Neither flag flipped by me.**
The check now reports `3 is RULED ON and awaiting the founder's flip`, and zero
needing a decision.

### The three cross-branch migration collisions, which are NOT mine to fix

| Version | This branch (applied on TEST) | The other branch (never ran) |
|---|---|---|
| `20260808000001` | `city_primary_backfill.sql` | `share_codes_never_released.sql` on `feat/launch-kit-artefacts` |
| `20260808000004` | `category_taxonomy_r1.sql` | `category_taxonomy_repair.sql` on `fix/production-sweep` |
| `20260531000001` | `refund_reconcile.sql` (73 branches) | `checkin_scanner.sql` on `feat/door-checkin-scanner` |

**Renaming MY files would be wrong**: they are already applied on TEST, so a
rename makes an applied migration look pending. The files that must move are on
the other branches, and this session must not touch them. **This is a
cross-session coordination item for the founder**, and it is now visible on
every run of `scripts/verify/migration-collision-guard.mjs`.

### What is red, and correctly so

| Guard | State | Whose move |
|---|---|---|
| `env-store-isolation` | 6 SHARED | Founder: `docs/roast/redis-isolation/REMEDIATION-RUNBOOK.md` |
| `migration-collision-guard` (cross-branch) | 3 collisions | Founder: coordinate the renames on the other branches |
| `flags-off-by-oversight` | 3 ruled ON, not flipped | Founder: approval block items 4, 5, 6 |
| `city-primary-coverage` (production only) | red | Queued behind the security fix, by ruling |

None of these may be suppressed. Each is the honest state.

### Also found, flagged, NOT actioned

- **`CRON_SECRET` is the same secret across two stores**
  (`node scripts/check-env-stores.mjs`), and `.env.test` holds a 4-character
  value that fails its declared 32-character shape. Pre-existing. The first is a
  production config change, held while production writes are frozen.
- **`paymentCritical` gates nothing.** Its only consumer is a display column.
  Ten variables carry it and no guard treats them differently. A classification
  that gates nothing gives the reassurance of a control without the control.
- **`reclaim-space.mjs` protects only the repo it is run FROM.** A parallel
  session running `npm run reclaim --deep` from another worktree deleted this
  one's `node_modules` mid-session. Restored with `npm ci`.

### Still not done, unchanged from section 4

Parts **A1, A3, C6, C7, D2, D4, E1, E3** remain untouched, roughly 95 to 138
hours. R5 and F6 remain blocked on an absent `ANTHROPIC_API_KEY`. No RLS work
and no new migrations, per the founder's freeze.

---

## 8. SESSION 3 ADDENDUM 2: tooling, disk, and the doctrine guard

Commits `c06690e`, `bc00582`.

### reclaim-space can no longer reach sideways

The sibling loop is gone; every deletion routes through one function that
refuses any path outside the invoking worktree. It also refuses to run when
another Claude session is active (a session dir under the temp root touched
within 45 min) or a dev server is listening.

`node scripts/verify/reclaim-confinement-proof.mjs` - **10 of 10**, using two
throwaway worktrees so this repo is never a target. The caller loses its own
`node_modules` (the script works) and the sibling loses nothing (it is
confined). Both assertions pull in opposite directions.

### What is actually eating the disk

**Not build artefacts.** The tree is 16.60 GB:

| 10.69 GB | `docs/` replicated across nine worktrees | reclaim can NEVER touch it |
| 2.80 GB | `node_modules` across all worktrees | only its own, now |
| 1.66 GB | shared `.git` | no |

2790 images, single files to 26 MB. Ranked remedies in
`docs/roast/disk-and-reclaim/FINDINGS.md`, led by sparse-checkout of `docs/`.

**Free space fell 6.6 to 3.50 GB during the session** because multiple sessions
were reinstalling `node_modules` simultaneously and repopulating an npm cache a
previous reclaim run had emptied. One deletion costs about 0.9 GB per worktree,
downloaded again.

### paymentCritical now gates four things

`node scripts/verify/payment-critical-doctrine.mjs`. **Eight of ten fully
green.** Both Upstash entries failed, which is the promotion doing its job:

- (c) and (d) FIXED: both added to `CRITICAL_ENV_RULES` so an absent or
  malformed fee-cache store alerts instead of silently degrading to a database
  fall-through, and both given rotation rows with verification commands.
- (b) NOT FIXED and correctly red: `UPSTASH_REDIS_REST_URL` is not declared
  `mustBeSensitive` and is not a public variable, so the platform WOULD allow
  it. Flipping it makes `check-env-stores` demand the Vercel record be
  re-created as Sensitive: a production store change, held while writes are
  frozen. **Founder action.**

The guard cried wolf on its first run and was fixed rather than trusted:
`STRIPE_WEBHOOK_SECRETS` looked uncovered because the rule covering it is NAMED
`STRIPE_WEBHOOK_SECRET` and reads the plural via `resolve()`. Coverage is now
asked behaviourally.

### CRON_SECRET

`.env.test` held a **4-character** value against a declared 32-character shape.
Fixed to 43 characters. **No check was passing because of it**: verified by
running every CRON_SECRET-touching check before and after, and no verdict
changed. `check-public-env` had been reporting it as a non-blocking local-scope
warning all along, so it was visible and ignored rather than hidden.

**Production's own value is 28 characters and also violates the shape.** Not
fixed: it is single-valued, so correcting it is a simultaneous two-store
rotation, which is a production write. Recorded in the rotation runbook.

Per founder ruling, the runbook now records that `CRON_SECRET` is deliberately
ONE secret in two stores (the handshake authenticates rather than compares),
and is therefore a single point of failure with no add-then-revoke window.

---

## 9. CLEAN STOP. The state of this branch at handover.

**19 commits on `feat/launch-kit-moat`.** Nothing merged, nothing pushed,
nothing applied to production. Gates at HEAD: tsc clean, eslint **47 warnings 0
errors** (baseline 48), **1482 tests across 131 files**, copy-tell-gate clean.

### Every guard on this branch, and its honest state

| Guard | State | Whose move |
|---|---|---|
| `reach-integrity --code-only` | **10 pass, 0 FAIL** | done |
| `reach-integrity` (TEST) | 15 pass, 1 FAIL | the flag flips |
| `reach-integrity --production` | 12 pass, 2 FAIL | the flag flips + the migration |
| `payment-critical-doctrine` | **ALL GREEN**, 1 clause deferred with reason | done |
| `migration-collision-guard` (local) | **ALL GREEN** | done |
| `migration-collision-guard` (cross-branch) | 3 collisions | **founder: coordinate renames** |
| `env-store-isolation` | 6 SHARED | **founder: the remediation runbook** |
| `reclaim-confinement-proof` | **10 of 10** | done |
| `sparse-checkout-proof` | **9 of 9** | done |
| `url-filters-e2e` | 17 of 17 | done |
| `search-reach-e2e` | 29 of 29 | done |
| `share-beacon-e2e` | 13 of 13 | done |
| `share-conversion-e2e` | 9 of 9 | done |

Nothing is suppressed. Every red is a founder action, named.

### The founder queue, in the order I would run it

1. **The security session's RLS fix.** Everything below waits on it.
2. **Approval block items 5 and 6**, the two flag flips. `broadcast_follow`
   first: it is a privacy defect, not a missing feature.
3. **Approval block item 7**, the `CRON_SECRET` rotation. Two minutes, both
   stores before any redeploy, handshake proves it.
4. **`docs/roast/redis-isolation/REMEDIATION-RUNBOOK.md`**, the TEST Upstash
   instance. Closes 4 of the 6 shared stores.
5. **Sparse-checkout the seven linked worktrees**, 7.98 GB, one command each,
   when that worktree is idle.
6. **Rule on the image archive**, `IMAGE-RULING-RECOMMENDATION.md`.
7. **Coordinate the three migration version collisions** with the other
   sessions. Renaming MY files would be wrong: they are applied on TEST.

### What this branch never touched

Parts **A1, A3, C6, C7, D2, D4, E1, E3** (the artefact brief, owned by another
session) and **A2, A4, B1, B2, E2** (taken by `feat/launch-kit-artefacts`). No
RLS. No new migrations after the freeze. R5 and F6 remain blocked on an absent
`ANTHROPIC_API_KEY`.

### The three things worth carrying into any future session

1. **A wrong answer that looks like a right one is the worst defect class.** Six
   district pages were six copies of the city page; nothing was empty, nothing
   errored. There is a standing gate for it now, negative-tested.
2. **A guard that has never fired is not a guard.** Every guard added this
   session was proven by injecting the failure it exists to catch.
3. **Absence of failure is not evidence of success.** A ten-run flake
   measurement came back blank because `node_modules` had been deleted and every
   invocation failed at startup. Anything counting passes would have reported it
   green.

---

## 10. FINAL STOP. Additions after the clean stop.

Commits `254b4af` and the two before it. **21 commits total.** Gates: tsc clean,
eslint 47/0, 1482 tests across 131 files, copy-tell-gate clean.

### WebP q80 is the house capture format

81 percent smaller (3733 KB to 691 KB measured), worst mean pixel difference
1.92 of 255 on the hardest case. `scripts/lib/capture.mjs` is the one place a
harness writes a capture. **One harness switched and verified; seven need a
careful per-file edit** after a regex attempt broke all eight and was reverted.
Pattern documented in `docs/roast/webp-legibility/FINDINGS.md`.

### The 299 untracked files: 0.23 GB, not 1.23 GB

Correction to my own figure. **240 files / 189 MB are cited by six committed
reports** and exist only on this disk. `docs/roast/untracked-evidence/` holds a
sha256 manifest of all 299 and the recommendation: one copy off the laptop,
today. Nothing was copied (committing contradicts the image ruling, uploading
means writing production Supabase, another local path is the same disk).

**Check whether OneDrive already syncs `docs/` before buying a drive.** The tree
sits inside OneDrive; I could not determine sync inclusion without changing
OneDrive settings.

### Corrections I made to my own earlier claims

1. **"The Vercel CLI cannot set values non-interactively."** WRONG on CLI
   55.0.0, which documents `--value` for exactly that. Approval block item 7 now
   uses `vercel env rm` + `vercel env add --value --sensitive --yes`, with the
   note that `--force` overwrites the value but not the sensitivity flag.
2. **"1.23 GB untracked."** It is 0.23 GB. The larger figure was inferred from a
   restore measurement taken while git may still have been writing.
3. **Will the env locks flag the founder's own rotation as drift?** No. The
   cross-store lock performs a HANDSHAKE (200 proves byte-identical) rather than
   comparing against a stored historical value, so it flags a MISMATCH between
   stores, never a CHANGE over time. Only running it between the two writes
   gives a 401, and that is the lock working.

### Founder queue, final

1. The security session's RLS fix. Everything waits on it.
2. Approval block 5 and 6, the flag flips. `broadcast_follow` first.
3. Approval block 7, `CRON_SECRET` rotation. Not during Wednesday 22:00 UTC.
4. `docs/roast/redis-isolation/REMEDIATION-RUNBOOK.md`, the TEST Upstash.
5. **One copy of the untracked evidence off this laptop.**
6. The seven sparse-checkout commands, 7.98 GB.
7. The three cross-branch migration collisions, with the other sessions.
8. The seven remaining harnesses to WebP.
