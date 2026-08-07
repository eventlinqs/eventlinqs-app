# Auth hardening: rebase onto main carrying #109 and #111

Running progress record. Written after each phase so a crash costs nothing.
Branch `feat/auth-hardening`, PR #110. Australian English, no dashes other than
hyphens.

---

## PHASE 0: read before touching. COMPLETE.

### 0.1 What merged, and what this branch has to live beside

`origin/main` is `1888ece`. The branch's merge base with it is `88c6683`, so
exactly one commit is new: PR #111. PR #109 is already in the branch's history,
which the merge base proves.

```
$ git merge-base origin/main origin/feat/auth-hardening
88c66833447d1627a9fe4c9dacbf991816a1f4d6

$ git log --oneline -3 origin/main
1888ece Defer the Sentry SDK off the boot path (#111)
88c6683 Env and secret integrity hardening (#109)
4f27c7c Launch release: seating, guidance, pricing locks, founding waiver, env locks (#108)
```

Read in full before any edit:

| File | What it is | Bearing on this branch |
|---|---|---|
| `src/lib/observability/client-error-report.ts` | The Sentry-free seam. A bounded queue plus a sink installed by `sentry-client-boot.ts`. Carries no Sentry import on purpose | The branch must not reintroduce a client-reachable Sentry import. Verified below that it never had one |
| `instrumentation-client.ts` | Arms a synchronous capture shim, marks `el:sentry-shim-armed`, then loads the SDK on `window.load` | Untouched by this branch |
| `src/lib/env/destinations.ts` | #109's one definition of where platform mail goes, with `PLATFORM_INBOX` | This branch adds a comment block to the same file. Already rebased onto #109, so no conflict, but the two definitions overlap semantically and the boundary is already written down |
| The four error boundaries | `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/checkout/error.tsx`, `src/app/(dashboard)/dashboard/error.tsx`. All four now call `reportClientError` | Untouched by this branch |
| `scripts/check-client-barrel-imports.mjs` | #111's build-failing guard: no third-party namespace import in client-reachable code. Wired into `prebuild` | **This is the conflict.** See 0.2 |
| `scripts/ci/critical-path-guard.mjs` | #111 grew it to four rules, two of them Sentry-specific | Runs in CI. This branch adds client components it will now scan |
| `.github/workflows/lighthouse.yml`, `lighthouserc.json`, `scripts/ci/lighthouse-aggregation-report.mjs` | #111 pinned the gate's aggregation to `median-run` and prints all three runs | Relevant to Phase 5.2 |

### 0.2 What I expect to conflict, and why

`git merge-tree` was run as a dry run before touching anything. It predicts
exactly one textual conflict:

```
$ git merge-tree --write-tree --name-only origin/main origin/feat/auth-hardening
29de61481ecc9f752fe23e28f250c216fdb04de9
package.json

Auto-merging package.json
CONFLICT (content): Merge conflict in package.json
```

**The one textual conflict, and it is the dangerous one.** Both sides rewrote
the same `prebuild` line, from the same base.

```
base   88c6683: ... check-pricing-lock.mjs && node scripts/prebuild-fixture.mjs
main   1888ece: ... check-pricing-lock.mjs && node scripts/check-client-barrel-imports.mjs && node scripts/prebuild-fixture.mjs
branch e0e07d5: ... check-pricing-lock.mjs && node scripts/guards/run-guards.mjs && node scripts/prebuild-fixture.mjs
```

`scripts/guards/run-guards.mjs` runs five guards and `check-client-barrel-imports.mjs`
is not one of them:

```
const GUARDS = [
  'node-version-contract.mjs',
  'auth-provider-guard.mjs',
  'no-supabase-smtp.mjs',
  'sender-single-source.mjs',
  'auth-autocomplete-guard.mjs',
]
```

So taking this branch's side of the conflict, which is what "keep my change"
instinctively means, silently deletes #111's client barrel guard from the build.
Nothing would fail. The build would go green. That is the resolve-by-deletion
trap this task warns about, and it is sitting in the single conflicted line.
Both sides must survive.

**Semantic overlaps that will not show as conflicts.** These auto-merge and then
either break or quietly rot, so they are the ones worth naming in advance.

1. **#111's five new scripts now fall under this branch's Node 20 contract
   guard.** `scripts/guards/node-version-contract.mjs` walks every `.mjs`/`.js`/`.cjs`
   under `scripts/` plus root config files and fails on any Node API newer than
   `.nvmrc`. After the rebase it will scan `check-client-barrel-imports.mjs`,
   `ci/lighthouse-aggregation-report.mjs`, `verify/client-barrel-drills.mjs`,
   `verify/sentry-pre-init-capture-proof.mjs` and `verify/sentry-replay-window.mjs`
   for the first time. Pre-read says they are clean (`readdirSync`, `readFileSync`,
   `execFileSync`, `node:path`, `node:url`; the one `globSync` mention is inside a
   comment, which the guard blanks). Prediction: passes. To be proven, not assumed.

2. **Check 5 of the same guard scans workflow Node pins.** #111 edited
   `.github/workflows/lighthouse.yml`, which pins `node-version: 20`. The contract
   is `20`, and the rule is "no workflow BELOW the contract", so 20 is legal.
   Prediction: passes.

3. **#111's client barrel guard will now walk this branch's new client
   components** (`auth-error-from-url.tsx`, and the changed `login-form.tsx`,
   `signup-form.tsx`, `google-button.tsx`, `reset-password-form.tsx`,
   `forgot-password-form.tsx`, `resend-verification-button.tsx`). The guard fails
   on any third-party namespace import reachable from a `'use client'` file.
   Evidence the branch adds none:

```
$ git diff 88c6683 origin/feat/auth-hardening | grep -nE "^\+\s*import\s+\*\s+as"
(no output)
```

4. **Task 1.3, the "fix that does nothing" trap: does this branch's auth error
   reporting import the Sentry SDK directly?** No. The branch adds zero Sentry
   references of any kind:

```
$ git diff 88c6683 origin/feat/auth-hardening | grep -n "^+.*[Ss]entry"
(no output)
```

   Its auth error handling is `src/lib/auth/auth-errors.ts`, a pure mapper from
   provider error codes to human copy, with no telemetry call. So there is no SDK
   import to reroute through the seam. The obligation this leaves is the negative
   one: prove after the rebase that the branch has not put the SDK back into the
   client bundle by any indirect route. That is `check-client-barrel-imports.mjs`
   plus `critical-path-guard.mjs` plus a bundle measurement, all in Phase 3.

5. **`src/lib/env/destinations.ts` (#109) and `src/lib/email/sender.ts` (this
   branch)** both resolve to `eventlinqs.com` and look mergeable. They are not:
   sending is not receiving. The boundary is already stated in a comment block
   this branch adds to `destinations.ts`. No conflict, but it is the overlap most
   likely to be "tidied" into a single definition by a later reader, so it stays
   named here.

6. **`.nvmrc` is new on this branch and absent from main**, so it adds rather
   than conflicts. Local Node here is v24.14.0, which is NOT the contract. Every
   gate in Phase 3 has to be run under Node 20 or it proves nothing. That is the
   defect this branch's own last roast round found in itself.

### Payment engine, conduct standard 9

The branch touches `src/app/api/webhooks/stripe/route.ts`. Inspected: it is
sender identity only, two hardcoded address literals replaced by
`getNoReplyFrom()` / `getReplyToAddress()` inside `sendRefundConfirmationEmail`.
No calculator, no charge, no payout, no disbursement logic. #111 did not touch
the file, so the rebase does not force any further change to it. Flagged here as
required rather than left silent.

### State before any edit

```
$ git status -sb
## feat/auth-hardening...origin/main [ahead 11, behind 1]
$ node --version
v24.14.0            <- NOT the contract. Node 20 required for every gate.
$ df -h .            <- 4.5G free, above the 1.5G floor
```

---

## PHASE 1: the rebase. COMPLETE.

Safe point tagged `pre-rebase-111-2026-08-08` at `e0e07d5` before anything moved.

```
$ git rebase origin/main
Rebasing (5/11) Auto-merging package.json
CONFLICT (content): Merge conflict in package.json
... resolved ...
Successfully rebased and updated refs/heads/feat/auth-hardening.

$ git merge-base --is-ancestor origin/main HEAD && echo YES
YES: origin/main is an ancestor of HEAD
```

### 1.4 Every conflict and how it was resolved

**ONE textual conflict: `package.json`, the `prebuild` line.** Predicted in Phase 0.

Resolved so BOTH survive, and structurally so it cannot recur. `prebuild` now names
one runner, and `scripts/guards/run-guards.mjs` holds the single registry of
build-failing guards, with `scripts/check-client-barrel-imports.mjs` from PR #111
registered in it. The alternative, a longer chain of `&&`, would have left two
competing notions of "the guard set" and a third line of work could recreate the
same collision.

Three things were added so the resolution is not merely correct today:

1. THE BOUNDARY IS STATED IN THE CODE, in the runner's header: which guard system
   protects what, why they keep separate files, and why they share a runner.
2. A REGISTERED-BUT-MISSING GUARD NOW FAILS UP FRONT. `spawnSync` on a missing
   file returns a non-zero status indistinguishable from an ordinary guard
   failure, so a mistyped path would have reported "the guard failed" instead of
   "the guard is gone".
3. A DRILL WAS ADDED asserting #111's barrel guard still fires from the shared
   runner, so the deletion this conflict invited is now caught by a test.

Proof the guard is genuinely in the build path, not merely mentioned:

```
$ npm run guards
[node-version-contract] PASS - 247 scripts hold to the Node 20 surface ...
[auth-provider-guard] PASS - every provider button is gated (5 checks).
[auth-provider-cost-guard] PASS - the provider gate is paid for only where it is used (4 checks).
[no-supabase-smtp] PASS - no auth flow depends on Supabase's mailer (4 patterns).
[sender-single-source] PASS - every sender derives from src/lib/email/sender.ts.
[auth-autocomplete-guard] PASS - 5 forms, 11 fields match the WHATWG/Chromium contract.
[client-barrel] PASS - 374 client-reachable files, 0 third-party namespace imports.
[guards] all 7 guards PASS.
```

**No other file conflicted.** Everything else auto-merged, and the three semantic
overlaps predicted in Phase 0 all resolved as predicted: #111's five new scripts
pass this branch's Node 20 contract guard, the `node-version: 20` in
`lighthouse.yml` is at the contract and not below it, and #111's barrel guard
passes over this branch's new client components.

### 1.3 The trap: a fix that looks correct and does nothing

This branch adds ZERO Sentry references, so there was no SDK import to reroute
through the seam #111 added. The obligation was the negative one, and it is
proven by ground truth rather than by inspection: a real Chromium against a real
production build of this branch, recording every script each auth route
downloads.

```
  /login             16 scripts, 832.6KB uncompressed   Sentry SDK markers: NONE
  /signup            16 scripts, 833.2KB uncompressed   Sentry SDK markers: NONE
  /forgot-password   15 scripts, 609.2KB uncompressed   Sentry SDK markers: NONE
  PASS: no auth route downloads the Sentry SDK at any point in its page load.
```

Both halves were checked. "Absent from the bundle" would also be true if the
deferral had broken observability altogether, so the probe also confirmed the SDK
is still shipped in separate deferred chunks: deferred, not deleted.

---

## PHASE 2: the two unmet items. COMPLETE.

### 2.1 The citation with no artefact

`src/lib/auth/providers.ts` cited `scripts/verify/auth-provider-cache-cost.mjs`.
It did not exist. Created, not deleted.

```
$ npm run verify:provider-cost
  [PASS] A. warm calls add no network
         1000 warm calls after 1 cold fetch. Total fetches: 1. Expected 1.
  [PASS] A. warm call cost is negligible on a render path
         0.00041ms per call over 1000 calls. Budget 0.05ms.
  [PASS] B. a disabled provider resolves false
  [PASS] B. inside the TTL the dashboard change is not yet visible, and costs no fetch
  [PASS] B. the TTL expires on the clock alone and refetches
         after TTL + 1s: google=true, total fetches=2. __resetProviderCache() was NOT called.
  [PASS] C. cold cost against a real project
         5 samples against vkapkibzokmfaxqogypq.supabase.co: min 55ms, median 65ms, max 1000ms.
  [PASS] D. an outage hides the button rather than showing a broken one
  [PASS] D. the fail-safe answer expires in 30s, not 5 minutes
[provider-cost] 8 passed, 0 failed, 0 skipped.
```

Part B is the one that earns its place. The existing unit test named "a fail-safe
answer is cached only briefly" advances the clock AND calls
`__resetProviderCache()`; the reset is what makes it refetch, so it would pass
with the TTL comparison deleted. It proves the reset seam works, not that the TTL
expires. Part B drives expiry on the clock alone and never touches the seam.

### 2.2 The permanent cost guard, and the documented invalidation

`scripts/guards/auth-provider-cost-guard.mjs`, in `prebuild` via the shared
runner. Four checks, each drilled:

1. no gate call in a file that renders no provider button
2. never reachable from a root layout, template or middleware
3. never imported into a Client Component
4. no call site may hardcode the gate to a literal true

The registry both provider guards read was extracted to
`scripts/guards/lib/provider-registry.mjs`. Copying the tables would have created
a second definition of "which components are provider buttons", leaving each
guard passing about a different platform with neither saying so.

Cache invalidation is documented at the TTL in `src/lib/auth/providers.ts`,
including the asymmetry, which is the part that matters: enabling a provider
costs at worst five minutes of email-only sign-in, while DISABLING one costs at
worst five minutes during which a warm instance still renders a button that leads
to a raw provider error. The bounds are named (five minutes, not indefinite), the
auth sentinel that independently detects the disagreement every ten minutes is
named, and a deploy is named as the instant invalidation lever.

Fail-safe survival: proven by the unit tests (non-200, throw, timeout, malformed
body and missing env all resolve to all-false), by part D above, and now enforced
by CHECK 4, which stops a call site stepping around it with a literal.

---

## PHASE 3: verification. Everything under Node 20.20.2, the .nvmrc contract.

Local Node is v24.14.0. Every gate below was run by invoking the Node 20
executable directly and echoing the version inside the run, because a previous
session found that a PATH prefix silently still ran v24.

| Gate | Result |
|---|---|
| 3.1 Test suite | **127 files, 1382 tests, all passed** |
| 3.2 ESLint before | 42 problems, 0 errors, 42 warnings |
| 3.2 ESLint after | 42 problems, 0 errors, 42 warnings. **Baseline held exactly** |
| 3.3 Production build | BUILD EXIT=0, whole prebuild chain exit 0, guards CI-EQUIVALENT |
| 3.4 Guards and drills | 7/7 guards, 24/24 this branch's drills, 6/6 #111's barrel drills, 24/24 #109's env lock cases |
| 3.5 Auth journey | 9/9 walked steps passed, 3 marked not verifiable locally |
| 3.6 Sentinel parity | no contradiction possible, proven by execution |
| 3.7 Visual | **0 differing pixels**, 12 captures, both widths |

### 3.1 The test count is itself evidence

Pre-rebase this branch ran 125 files and 1370 tests. #111 added exactly two test
files containing 6 tests each. 125 + 2 = 127 and 1370 + 12 = 1382, which is what
ran. Neither side's tests were dropped, and the arithmetic closes with no
remainder.

### 3.2 ESLint, before and after, both under Node 20

BEFORE was measured on a real worktree checked out at the pre-rebase tag, not
inferred. One warning WAS introduced during this session and was found by that
comparison: `CONSTANT_ONLY_CONSUMERS` in the new cost guard, declared as if it
allowlisted the auth sentinel and never referenced by any check. It was dead code
that read as load-bearing, the same class of defect as the citation in 2.1. It
was removed rather than wired in, because every check keys on the CALL and not
the import, so a constant-only consumer passes on the rule itself rather than on
an exception to it. Count returned to 42.

### 3.5 The auth journey, and what it could not prove

`scripts/verify/auth-journey-e2e.mjs` is the real proof and it exits immediately:
it needs `RESEND_API_KEY` to fetch the delivered email back from Resend, and that
key is in neither this shell nor `.env.test`. A local walk covered the same six
hops against the real production server and the real TEST project:

```
  [PASS] 1. signup form posts, and fails CLOSED with a safe message when the transport is absent
  [SKIP] 1b. NOT VERIFIED LOCALLY: a successful signup send (needs RESEND_API_KEY)
  [PASS] 2. email confirmation link confirms the account
  [PASS] 3. sign in with the confirmed account (left /login for /dashboard)
  [PASS] 4. sign out clears the session and locks the dashboard again
  [PASS] 5. the transport-failure reply leaks neither the provider reason nor account existence
  [SKIP] 5b/5c. NOT VERIFIED LOCALLY: the reset email sending, and path equivalence under normal operation
  [PASS] 6. password reset completion sets a password that authenticates
```

THREE HARNESS ERRORS OF MINE were found and corrected along the way, each of
which first looked like an application defect:

1. POSTing to `/auth/signout` returned 404. Sign-out is a Server Action submitted
   from the account dropdown, not a route. Driven through the real UI instead.
2. Step 5 asserted that a registered and an unregistered address are
   indistinguishable. During a transport outage they are not, and
   `src/app/api/auth/recover/route.ts` line 27 says so in its own words, with a
   unit test asserting the 502. My assertion was the opposite of the declared
   design. Realigned to what is assertable without a transport: the failure body
   leaks nothing.
3. The reset link appeared broken: the page rendered "We could not confirm your
   reset link". THE APP NEVER EMAILS THE GOTRUE `action_link`.
   `dispatch-auth-link.ts` takes `hashed_token` and builds
   `/auth/confirm?token_hash=...&type=recovery&next=/auth/reset-password`, which
   verifies server-side. I was exercising an implicit-fragment flow the app does
   not use. With the real link shape the reset completes and the new password
   authenticates. This came within one step of being reported as a severity-one
   "password reset is broken".

### 3.6 The two sentinels: no duplication of logic, no contradiction

| | Auth sentinel (this branch) | Health sentinel (main) |
|---|---|---|
| Schedule | every 10 minutes | every 5 minutes |
| Checks | provider parity, redirect allowlist and site URL, mail transport, sender domain, content types, Supabase SMTP | payment, database, storage, email, maps, ai, push, pages, ssl, env, manifest |
| Overlap | sender domain, mail transport | the `email` check |

CONTRADICTION IS STRUCTURALLY IMPOSSIBLE, and this was verified by execution, not
by reading the comment that claims it. The two import different modules, which is
what made it worth checking: the health sentinel takes `senderDomainsInUse` from
`@/lib/email/send`, the auth sentinel takes `getSenderDomain` from
`@/lib/email/sender`. `senderDomainsInUse()` is built from `getEmailFrom()` and
`getNoReplyFrom()`, both from `sender.ts`, so the dependency is transitive and
real:

```
  auth sentinel   getSenderDomain()    -> "eventlinqs.com"
  health sentinel senderDomainsInUse() -> ["eventlinqs.com"]
  the two sentinels resolve the SAME single domain: true
```

All three sentinels (auth, webhook, health) route their alert through the one
`alertDestination()` from #109, so they cannot disagree about the recipient
either.

The residual is duplicate NOTIFICATION, not duplicate logic: one unverified
domain raises two alerts to the same inbox. That is already documented in the
auth sentinel and is the safe direction. #111 touched none of these files, so the
rebase cannot have changed the relationship:

```
$ git diff --stat 88c6683 1888ece -- src/lib/health src/lib/email src/app/api/cron
(empty)
```

### 3.7 Design lock: zero visual change, proven three ways

Both capture sets came from a real `next build` plus `next start` of their own
tree under Node 20, at 1440 and 390, across all six auth pages.

```
  IDENTICAL  forgot-password-1440 / -390     0 of 1440000 / 354120 pixels differ
  IDENTICAL  login-1440 / -390               0 differ
  IDENTICAL  reset-password-1440 / -390      0 differ
  IDENTICAL  signup-1440 / -390              0 differ
  DIFFERS    signup-organiser-1440           3 of 1440000 pixels differ
  IDENTICAL  signup-organiser-390            0 differ
  IDENTICAL  verify-email-sent-1440 / -390   0 differ
```

The three pixels were NOT waved away. They are adjacent, in a near-white glyph
edge, at a maximum channel delta of 1 in 255. The decisive test was a control:
capture the SAME build twice.

```
  same build, captured twice, signup-organiser at 1440:
    (890,452) rgba(252,252,251) -> rgba(251,251,251)   delta 1
    (889,453) rgba(228,228,225) -> rgba(227,227,225)   delta 1
    (889,454) rgba(236,236,234) -> rgba(235,235,234)   delta 1

  rebase-before  vs  rebase-after-rerun:  0 differing pixels in 1440x1000
```

The identical three pixels oscillate between two states on the same build, and
the post-rebase build's second capture is byte-identical to the pre-rebase build
across all 1,440,000 pixels. The jitter is in the capture harness, not the tree.

Corroborated at source: not one byte of `src/app/(auth)`, `src/components/auth`
or `src/app/globals.css` differs from the pre-rebase tag, the `providers.ts`
change is comment-only (every added and removed line is a comment line), and the
four error boundaries changed only an import name and a call name, with zero JSX,
className or style touched.

### What could NOT be verified here, and exactly why

| Item | Why |
|---|---|
| `scripts/verify/auth-journey-e2e.mjs` | needs `RESEND_API_KEY`, absent from this shell and from `.env.test`. The local walk above covers the same six hops except the actual send |
| `scripts/check-env-stores.mjs` | Vercel CLI 11.9.0 is installed but not logged in; it also compares against the real `CRON_SECRET`, and `.env.test` holds a 4-character placeholder (fp 483aab8b) |
| `scripts/check-dead-branch-env.mjs` | same cause: "the Vercel CLI could not list the project. Run: npx vercel login" |
| `sentry-pre-init-capture-proof.mjs`, `sentry-replay-window.mjs` | #111's runtime proofs need a deployed preview with a live Sentry DSN. Sentry is production-gated, so locally the shim correctly logs "no DSN, skipping init" |
| `ENV_MANIFEST_CONFORMANCE` on the local scope | reports one violation, the same 4-character `CRON_SECRET` placeholder. Non-blocking locally, and the real value lives in Vercel |

None of these is a code fault, and none was introduced by this rebase.

---
