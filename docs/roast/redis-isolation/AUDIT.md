# Redis and store isolation: the audit, and the direct answer

Written 8 August 2026, branch `feat/launch-kit-moat`. Founder direction: "the
namespace fixes this instance. It does not fix the cause."

Correct. Here is the cause.

---

## 1. Every Redis key, audited

Six key families. **Only one carried an environment, and it was the one I had
just fixed.**

| Key | Written by | Environment in key? | What a cross-environment write does |
|---|---|---|---|
| `pr:v2:<type>:<country>:<currency>:<org>` | `payments/pricing-rules.ts` | **NO** | **THE FEE.** See below |
| `ai:spend:<YYYY-MM>` | `ai/cost-guard.ts` | **NO** | **THE AI BUDGET.** See below |
| `ff:v1:<flag>` | `flags/broadcast.ts` | **NO** (fixed first) | serves a stage nobody enabled, 30s |
| `rl:<key>:<window>` | `redis/rate-limit.ts` | **NO** | shared rate-limit buckets |
| `queue:join:<ip>` | `actions/queue.ts` | **NO** | shared queue admission buckets |
| `tier:<id>:inventory`, `event:<id>:inventory` | `redis/inventory-cache.ts` | **NO** | safe only by accident: the ids are UUIDs and differ per database |

### The two that are worse than the flag

**`pr:v2:*` caches the resolved FEE, and `getPricingRule` returns the cached
entry BEFORE it consults the database.** The region key
`pr:v2:platform_fee:AU:AUD:null` carries no UUID, so TEST and production collide
exactly. A TEST-derived fee written there is served by production as the
authoritative fee, on the charge path (`PaymentCalculator`) and the display
path, for up to `PRICING_RULES_CACHE_TTL_SECONDS = 60`.

The constitution's fee law is that the displayed fee always equals the charged
fee, guaranteed by one resolver. A shared cache breaks that from **outside the
fee system entirely**, which is why no fee gate could ever have seen it.

**`ai:spend:<YYYY-MM>` is one global monthly counter.** A local session's spend
counts against production's budget, and the guard fails CLOSED, so a developer
experimenting locally could disable the AI features on the live platform.

`tier:` and `event:` inventory keys are safe today only because Supabase UUIDs
differ per project. Accidental safety is not safety.

### The fix: namespace at the client, not at six call sites

`src/lib/redis/client.ts` now wraps the Upstash client so **every** key-taking
call is prefixed with the Supabase project ref. One place, and a new call site
inherits it by default.

The load-bearing part is that **an unclassified method throws**. A silent
pass-through would let the next Upstash method somebody reaches for reintroduce
this defect invisibly:

```
[redis] "scriptLoad" is not classified in src/lib/redis/client.ts.
Add it to KEY_FIRST_METHODS or KEYLESS_METHODS. Until then it is refused,
because an unclassified method writes an unnamespaced key and a shared key is
how a TEST process last reached production's store.
```

Nine tests in `tests/unit/redis-namespace.test.ts`, including the one that
matters: TEST and production must never produce the same key for
`pr:v2:platform_fee:AU:AUD:null`.

---

## 2. The direct answer: how did a local process get production Upstash credentials?

**`.env.test` is an incomplete overlay, and an absent variable resolves TOWARDS
production.**

Precisely:

1. `.env.local` holds **production** values. Next.js loads it automatically and
   only skips a variable already present in `process.env`.
2. `.env.test` defines **11** variables. `.env.local` defines **22**.
3. Exporting `.env.test` redirects Supabase, Stripe and the cron secret to TEST.
   **Every variable it does not mention falls through to `.env.local`.**

So "run it against TEST" redirected three things and silently left **fifteen**
pointing at production:

```
SUPABASE_DB_PASSWORD_SYDNEY   ANON_PUBLIC        SERVICE_ROLE
RESEND_API_KEY                NEXT_PUBLIC_APP_URL NEXT_PUBLIC_APP_NAME
PEXELS_API_KEY                NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY PAGESPEED_API_KEY ADMIN_TOTP_ENC_KEY
UPSTASH_REDIS_REST_URL        UPSTASH_REDIS_REST_TOKEN
SENTRY_DSN                    NEXT_PUBLIC_SENTRY_DSN
```

**That is the real defect, and you named its class correctly.** It is not that
development "holds secrets" in the abstract. It is that the isolation mechanism
is subtractive and incomplete, and the fallback direction is towards production.
Every other guard in this repo assumes the opposite.

The blast radius beyond Upstash:

- **`RESEND_API_KEY`**: a local run sends real email from the real domain to
  real people.
- **`ADMIN_TOTP_ENC_KEY`**: production's admin second-factor encryption key sits
  in the environment of every local process.
- **`SUPABASE_DB_PASSWORD_SYDNEY`**: direct Postgres access to production.
- **`SENTRY_DSN`**: local errors land in production's Sentry, polluting the
  signal the health work depends on.

### One thing I got wrong and corrected

I first recorded that `SERVICE_ROLE` was live, read by
`scripts/batch-4-seed-real-covers.mjs`. **It is not.** That script reads
`process.env.SUPABASE_SERVICE_ROLE_KEY` into a local const that merely shares
the name. Nothing anywhere reads `process.env.SERVICE_ROLE` or
`process.env.ANON_PUBLIC`; they are dead aliases.

The exposure is still real (a production service-role key loaded into every
local process) but it is one `process.env.SERVICE_ROLE` away from being a live
path, not a live path today. The guard says exactly that now.

### The manifest was also wrong about Upstash. RULED AND FIXED.

It declared:

```js
describe: 'Upstash Redis REST URL: rate limits and the AI monthly budget guard',
paymentCritical: false,
```

Founder ruling 2026-08-08: **paymentCritical TRUE. "It caches the resolved fee.
A fee is money."** Applied to both Upstash entries, and both `describe` strings
corrected to name the fee cache and the feature flags.

**But the flag's own contract did not cover why**, and that mattered more than
the value. It read:

> true when production cannot take a real payment, or cannot complete one,
> without it

By that wording Upstash genuinely did not qualify: when Redis is absent
`readCache` returns null and `getPricingRule` falls through to the database, so
a payment still completes. The contract only modelled **absence**, never
**corruption**. So the wording is now:

> true when production cannot take a real payment, cannot complete one, **or
> would take it FOR THE WRONG AMOUNT**, without it or with the wrong value

Otherwise the next reader would find `paymentCritical: true` on a store whose
absence breaks nothing, conclude it was a mistake, and set it back.

### Which gates this newly applies: almost none, and that is the real finding

Asked to say which gates the re-classification brings into force, the honest
answer is **one, and it is a display column**:

```
scripts/generate-env-state.mjs:98:  payment: e.paymentCritical ? 'YES' : 'no',
```

`paymentCritical` has **no other consumer anywhere** in `src/`, `scripts/` or
`.github/`. It is a label on a generated document. Ten variables now carry it and
not one gate treats them differently from any other required variable.

That is worth more attention than the Upstash entry itself: a classification
that gates nothing gives the reassurance of a control without the control. It is
the same shape as an UNDECLARED feature flag, and I am flagging it rather than
inventing enforcement, because deciding what a payment-critical variable must
additionally satisfy (stricter shape? cross-store parity? a rotation interval?)
is a doctrine decision, not a code change.

**No gate broke.** `env-locks-verify` and `generate-env-state` exit 0.
`check-public-env` exits 0 with the TEST overlay exported, and its failure on a
bare shell is the pre-existing production-Supabase-reach block, correctly
firing, which is the same defect class this audit is about.

---

## 3. The guard

`node scripts/verify/env-store-isolation.mjs`

It compares the two overlays and never prints a secret: only whether a value is
present, and whether two values are equal. It fails when a store-reaching
variable is **inherited** from the production overlay, or is **defined
identically** in both.

Current state, and it is correctly RED:

```
  [ok  ] NEXT_PUBLIC_SUPABASE_URL     Supabase: isolated
  [ok  ] SUPABASE_SERVICE_ROLE_KEY    Supabase: isolated
  [FAIL] SERVICE_ROLE                 Supabase: INHERITED FROM PRODUCTION
  [FAIL] SUPABASE_DB_PASSWORD_SYDNEY  Supabase: INHERITED FROM PRODUCTION
  [FAIL] UPSTASH_REDIS_REST_URL       Upstash: INHERITED FROM PRODUCTION
  [FAIL] UPSTASH_REDIS_REST_TOKEN     Upstash: INHERITED FROM PRODUCTION
  [ok  ] STRIPE_SECRET_KEY            Stripe: isolated
  [ok  ] STRIPE_WEBHOOK_SECRET        Stripe: isolated
  [FAIL] RESEND_API_KEY               Resend: INHERITED FROM PRODUCTION
  [FAIL] ADMIN_TOTP_ENC_KEY           Admin 2FA: INHERITED FROM PRODUCTION
  [ok  ] CRON_SECRET                  Cron: isolated

===== 6 SHARED =====
Stores a TEST-pointed process can reach in production: Supabase, Upstash, Resend, Admin 2FA
```

### Remediation, which is yours because it needs values I cannot invent

Append to `.env.test`. **Empty is a legitimate and correct value** for three of
these: the Redis client already degrades to disabled when the credentials are
absent, and an absent Resend key means a local run cannot send.

```
# Isolation: these MUST be present, even empty, or they fall through to
# .env.local, which is production.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
SUPABASE_DB_PASSWORD_SYDNEY=
SERVICE_ROLE=
ADMIN_TOTP_ENC_KEY=<a distinct TEST key, not production's>
```

I did not write these myself: `.env.test` is your secret file, `ADMIN_TOTP_ENC_KEY`
needs a real generated value if admin login is wanted on TEST, and a provisioned
TEST Upstash instance would be better than an empty one. The guard stays red
until it is done, which is the correct behaviour for a guard.

**Note the trade-off on an empty Upstash:** the login rate-limit policy fails
CLOSED under `NODE_ENV=production`. With no Upstash, a local *production-mode*
server refuses sign-in. That is already the documented gotcha, and `next dev` is
the documented answer.

---

## 4. Migration collision guards

`node scripts/verify/migration-collision-guard.mjs [--remote]`

**Stated accurately: no collision occurred.** The failure in this session was my
own SQL (`UPDATE ... FROM LATERAL` referencing the update target). I never
observed two files sharing a prefix, and the guard confirms none exists across
all 82 migrations.

The guard exists because the **conditions** are now permanently present: two
sessions worked this repo in parallel on two branches, and versions are a date
plus a hand-chosen serial. Two people starting on the same day both count from
`000001`, and neither sees the other's file.

What would happen matters more than the odds. `db push` keys on the **version
prefix**, not the file name or its contents:

- **two files sharing a prefix**: one is applied, the version is recorded as
  done, and the other never runs and never appears pending again. Not skipped
  loudly. Skipped permanently and silently.
- **a prefix already in the remote history**: the file is treated as applied the
  moment it lands on the branch. This is the shape a **merge** produces, and it
  is the likely one here.

Both end with a migration everybody believes ran, that never did, and a schema
wrong in a way no other gate can see, because every gate reads the code and the
code is correct.

Three checks: duplicate version prefixes, byte-identical files under different
versions (a note, not a failure: idempotent repairs are safe to run twice), and
locally-uncommitted files carrying a version the remote already applied.

**Negative-tested**, because a guard that has never fired is not a guard:

```
=== injected a colliding file ===
  [FAIL] version 20260808000005 is claimed by 2 files:
         20260808000005_cultural_tag_to_community.sql
         20260808000005_parallel_session_clash.sql
--- removing ---
===== ALL GREEN =====
```

### Cross-branch: asked directly, and the answer was NO

**As first built, the guard could NOT detect a collision across branches.** It
read the working tree, and the working tree only ever shows one branch. That
limitation was not theoretical:

```
--- d. no version is claimed by different files on different branches ---
  scanning 113 ref(s)
  [FAIL] version 20260531000001 is claimed by 2 DIFFERENT files:
         20260531000001_refund_reconcile.sql        on: 73 branches incl. main
         20260531000001_checkin_scanner.sql         on: feat/door-checkin-scanner
  [FAIL] version 20260808000001 is claimed by 2 DIFFERENT files:
         20260808000001_share_codes_never_released.sql  on: feat/launch-kit-artefacts
         20260808000001_city_primary_backfill.sql       on: feat/launch-kit-moat
  [FAIL] version 20260808000004 is claimed by 2 DIFFERENT files:
         20260808000004_category_taxonomy_r1.sql        on: feat/launch-kit-moat
         20260808000004_category_taxonomy_repair.sql    on: fix/production-sweep
```

**Three live collisions, two of them created today by the parallel sessions**,
and one dating to 31 May. The guard now reads every ref through
`git ls-tree` rather than the filesystem. A version claimed by the SAME filename
on many branches is normal (shared ancestor); a version claimed by DIFFERENT
filenames is the collision.

**All three are the severe shape**, because my versions are already applied on
TEST. Renaming fixes the future and does not undo the record: the other
branches' migrations are marked done on a database they never touched, so each
must be re-issued under a fresh version and whatever it was going to alter has
to be checked by hand first. `20260808000001_share_codes_never_released.sql` and
`20260808000004_category_taxonomy_repair.sql` have **never run on TEST** and
never will under those versions.

Local checks pass (82 versions, one file each); the cross-branch check is
correctly RED on the three above.

---

## 5. The flaky security tests, measured rather than asserted

Founder: "Three consecutive clean runs is not proof against flakiness, it is
absence of evidence." Correct. Here is evidence.

**Ten full-suite runs under full parallel load: 10 of 10 passed, 1482 tests
each, zero timeouts.** But the number that actually settles it is the duration
of the two scan tests, measured with the verbose reporter across three further
runs:

| Run | `no-localhost-app-url-fallback` | `no-server-side-getsession` |
|---|---|---|
| 1 | 2997 ms | 3117 ms |
| 2 | 3309 ms | 2505 ms |
| 3 | 4083 ms | **5308 ms** |

**The old budget was the vitest default of 5000 ms, and the worst observed run
is 5308 ms.** So the previous configuration was not unlucky, it was
mathematically guaranteed to flake: the tests genuinely take 2.5 to 5.3 seconds
and were sitting on the boundary. They walk and read every file under `src/`, so
their cost grows with the codebase while a default timeout does not.

The new budget is 30 s, which is **5.7x headroom over the worst observed run**
and roughly 10x over the median. That is the honest characterisation: not "it
passes now" but "the slowest measurement is 18 percent of the old budget and
6 percent of the new one".

### A note on how this was measured, because the first attempt produced nothing

The initial ten-run loop returned empty output. It had not measured anything:
`node_modules` was **completely empty** by then, so every `vitest` invocation
failed at startup and the greps matched nothing. Reporting "10 clean runs" from
that would have been a fabricated pass.

The cause was not this session. `scripts/reclaim-space.mjs` protects only the
repo it is **run from** (`if (dir === REPO) continue`), so a parallel session
running `npm run reclaim --deep` from another worktree deletes this one's
`node_modules`. Restored with `npm ci` (1027 packages, deterministic from
`package-lock.json`); the git tree was untouched throughout and no committed
work was at risk. Worth knowing while five sessions share one machine.
