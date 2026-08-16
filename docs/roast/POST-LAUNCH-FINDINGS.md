# Post-launch findings: integration/launch

## STILL OPEN AND BLOCKING, as at 15 August 2026

**Two items, and both are yours rather than the code's.**

| # | Open and blocking | What unblocks it |
|---|---|---|
| B-1 | **The $1 real-card purchase has not been run.** Every gate is green and the money path is proven on TEST, but no real card has moved on production. Until it does, "the platform can sell" is an inference. | Runbook section 4. It is also the gate on the purge: nothing is deleted from production before it passes. |
| B-2 | **ELEVEN migrations are not applied to production**, not two, and one `db push` applies all eleven in one go. The ORDER is the one thing that can take the live site off sale silently. | Runbook section 3, steps 3.4 to 3.6, which lists all eleven by name. Deploy the code first, verify a paid event still renders a ticket selector, then apply, then verify both halves. Section 5 needs no second push. |

Everything else previously listed here is FIXED, SUPERSEDED, or open and NOT
blocking. The sections below are the running record and are kept in date order.

### Closed on 15 August 2026 by this pass

| # | Was | Now |
|---|---|---|
| F-1 | The deleted processing fee was still described on about twenty surfaces, including the AI support knowledge base, which told anyone who asked that there was "a payment processing fee shown at checkout". | FIXED. Every assistant resolves the fee live per request and is forbidden from quoting a figure when that lookup fails. `scripts/guards/one-fee-copy.mjs` fails the build on any customer-facing surface naming a second fee, and is registered. |
| F-2 | `docs/PRICING.md` declared itself the only place a fee figure may be written and then carried four worked examples built on the deleted fee. | FIXED. Section 3 is now COMPUTED from the lock block by `scripts/pricing-derive.mjs`, which is registered and fails the build on any disagreement. |
| F-3 | The admin pricing screen let the founder set a processing fee that nothing read: it accepted the number, versioned it, and audit-logged it. | FIXED. Those two fields are removed from the screen, the action and the reader. |
| F-4 | The help centre described an organiser-settable booking fee and a cap. Neither exists anywhere in `src/`. | FIXED. Both answers rewritten to what the platform actually does. |
| F-5 | `no-partial-builds` reported 57 hits and was deliberately unregistered. | FIXED. All 57 classified and cleared; the guard is registered and its `NOT_GUARDS` entry deleted. |
| F-6 | The purge keyed on `is_seed_data`, which is unset on production, so it would have matched zero rows and reported "nothing to do" over a database full of demo content. | FIXED. Keyed on `owner_id`, with explicit never-delete entries, a dry run by default and a confirmation that cannot be passed without reading the row list. Rehearsed green on TEST. |
| F-7 | Order `EL-6HBNEYY9` was cited in a code comment as a 16.6 per cent over-charge. | CLOSED. It exists on neither database. The surviving specimen is `EL-NGEBXWUZ`, the over-charge was 9.4 per cent not 16.6, and no money ever moved. No refund is owed. |
| F-8 | Four internal preview routes shipped to production un-gated, one rendering placeholder imagery from a third-party host. | FIXED. All four closed on production through one helper. |

### Open and NOT blocking

| # | Item | Why it does not block |
|---|---|---|
| N-1 | Finding 60: nothing on the platform links to an organiser profile, so 38 indexable pages have zero internal links. | Real, and a demand-engine gap rather than a launch defect. Adding an organiser credit block to the event page is a design change needing Law 2 evidence and your approval. |
| N-2 | Finding 72: six privileged server actions on the venue surfaces take an id with `authz=NONE`. | The IDOR in `saveSeatMap` was fixed and drilled. The remaining six are the same shape and were not covered for want of credentials. Worth a ruling before you open the venue surfaces to anyone outside your own account. |
| N-3 | Finding 68: whether Vercel Skew Protection is enabled could not be read from the API. | One deployment-skew error boundary was seen once and did not reproduce. Check the dashboard setting before launch; the same shape would throw a buyer out mid-checkout on any production deploy. |
| N-4 | Finding 61: preview deployments stopped being indexable, but they are still readable. | Deployment Protection is a dashboard action and remains outstanding. |
| N-5 | Two builds requested on 15 August 2026, external ticketing support and the pace engine, are NOT STARTED. | Named in the handover with their design and their blockers. Neither is launch-blocking; both are the next workstream. |
| N-6 | Mobile performance on the homepage is 0.63 and LCP runs 5.2 to 6.3 seconds on the preview. | Warn-level by a dated waiver (Issue #42, expires 2026-11-01), not a blocker. Detail and the proposed fix are in the section below. |
| N-7 | `/pricing`, `/help` and `/legal/terms` render zero `<img>` elements. | Not a gate failure, but `/pricing` is a marketing surface and Law 4 says a text-only marketing surface is a design defect by definition. Detail below. |

### Recorded 16 August 2026, overnight pass: what the two new guards found, and the four things left open

**The headline.** Two build-failing guards were added
(`no-display-time-exclusion`, `publish-requires-cover`) and the first one found
**seven more live copies** of the defect the previous pass had claimed to close
"across every public surface". Nineteen passing tests saw none of them. Every one
is fixed and the audit table in `exclusion-audit-2026-08-16.md` carries the list.

**Open, and named rather than left to be rediscovered.**

| # | Item | Severity | What it would take |
|---|---|---|---|
| O-1 | **The generated cover has no organiser-facing surface.** The renderer, the storage path and the backfill all work and are proven on TEST, but the only caller is an admin script. An organiser with no artwork still cannot publish, because the publish gate correctly refuses them | MAJOR. It is the actual product problem the cover work exists to solve | A server action beside `publishEvent`, and one control in the event form beside the cover upload. The reason it was NOT done tonight is that the event form is a named launch-blocker surface and adding a control to it is a design change needing Law 2 evidence and a ruling, not a quiet edit |
| O-2 | **On desktop the event page's gold "Get tickets" points at a panel already on screen.** Measured on production, three events, 1440x900: the ticket panel's top sits 693px down a 900px viewport, so it is already visible before the CTA is pressed. At 390px it is 2612 to 2768px away and the CTA is doing real work | MINOR, and it is the founder's own find, quantified | A ruling. The options are to hide the hero CTA at `lg` and above, to make it focus the panel rather than scroll to it, or to leave it. All three are design decisions on a working surface |
| O-3 | **`community-picks-section.tsx` is unreferenced and every tile in it links to `/categories/<slug>` for slugs that do not exist.** `/categories/[slug]` serves seven legacy slugs only (afrobeats, amapiano, gospel, owambe, caribbean, heritage-and-independence, networking); asian, african and south-asian are not among them | LOW while it renders nowhere. It would be 18 dead links the day anybody wires it up | Either delete the component or point its tiles at `/community/<slug>`. Not done tonight because deleting a component is a decision and repairing dead code is churn |
| O-4 | **The Supabase Postgres version is still unknown.** `SUPABASE_DB_URL` in `.env.test` is a redacted placeholder, PostgREST does not expose the version, and the Management API needs a token this worktree does not have | LOW, but it is the one item in the forward-compatibility inventory that could need downtime | `supabase projects list`, or `select version();` in either SQL editor. One line, from a machine with the credential |

Detail for the two research tasks lives in
`docs/roast/APP-STORES-RESEARCH-2026-08-16.md` and
`docs/roast/FORWARD-COMPATIBILITY-2026-08-16.md`. The single most actionable line
in either: **every GitHub Action pinned in this repository runs on node20, which
reached end of life on 30 April 2026**, read from each tag's own `action.yml`.

### Recorded 16 August 2026: Lighthouse performance, and a Law 4 gap found beside it

Both came out of diagnosing the SEO gate on PR #118. Neither blocks the merge and
neither was chased on the night, per instruction.

**N-6. Mobile performance and LCP on the homepage.** Measured against the warmed
Vercel preview, median of three, `el-audit=1`:

| Route | Performance (gate value / median) | LCP, all three runs |
|---|---|---|
| `/` | 0.63 / 0.58 | 5156.63, 5900.02, 6341.78 ms |
| `/events` | 0.88 / 0.81 | within the 4000 ms warn cap |
| every other gated route | 0.87 to 0.94 | within cap |

The homepage is the only route below the 0.80 floor, and it is warn-waived on a
dated exemption rather than silently excused: `matchingUrlPattern`
`^https?://[^/]+/?$` carries `_expiresOn: 2026-11-01`, and
`scripts/ci/lighthouse-exemption-expiry.mjs` fails the build the day that passes.

WHAT I WOULD DO, in order, and none of it tonight:

1. **Settle whether this is measurement or reality before optimising anything.**
   The waiver attributes it to the Issue #42 Vercel image-optimiser cold-start
   race, and the warming pass in the workflow is two unrecorded curl hits per URL.
   An LCP spread of 5.2 to 6.3 seconds across three consecutive runs on the same
   build is a wide band, and a genuinely warm cache should not produce it. Warm
   with more passes, or measure the same commit on production, and see whether the
   band collapses. Optimising against a cold-start artefact would be work spent on
   the harness rather than the page.
2. **Get the LCP element named.** This gate physically cannot say which element is
   the LCP: `lighthouserc.json` records that Lighthouse 12.1.0's TraceElements
   gatherer throws, so `largest-contentful-paint-element` returns
   `scoreDisplayMode=error` with no details in every report it produces. That is
   the single most useful fact about an LCP problem and the gate does not have it.
   The fix is already scoped in that file: `@lhci/cli` 0.15.1 ships Lighthouse
   12.6.1 where both audits return real data. It re-baselines all eleven URLs, so
   it needs a validation run, and it is also flagged RE-CHECK BY 2026-11-01.
   Do this BEFORE step 3, or step 3 is guesswork.
3. **Only then, the hero.** The homepage hero is a priority-painted AVIF raster
   and is the likely LCP. The candidates are a smaller mobile-specific raster, a
   pre-warmed optimiser path, or serving the mobile hero as a static asset that
   bypasses the optimiser entirely. Which one depends on what step 2 names.

Explicitly NOT recommended: lowering the 0.80 floor, or widening the LCP cap.
Both would make the number go green without making the page faster, and the
constitution's delivery rule forbids it.

**N-7. Three pages carry no imagery at all.** `/pricing`, `/help` and
`/legal/terms` render zero `<img>` elements, confirmed by fetching the preview
directly. This surfaced because it is why those three score 0.66 on SEO where
every other page scores 0.69: Lighthouse marks `image-alt` `notApplicable` when a
page has no images and drops it from the denominator, so the category total falls
from 13.04 weighted points to 12.04 and the same single failure costs a larger
fraction. The score difference is therefore an artefact and not a defect.

The defect it exposes is a different one. Law 4 says every marketing and landing
surface carries image-rich, full-craft treatment, and that a text-only marketing
surface is a design defect by definition. `/pricing` is squarely a marketing
surface. `/help` and `/legal/terms` are arguably not, and that is a founder call
rather than mine. Reference build is `/organisers` with
`src/lib/images/organiser-photos.ts` and `MarketingMedia`. This is a design task
needing Law 2 evidence and approval, so it is recorded, not actioned.

### Recorded 16 August 2026: the silent fail-open family gains another member

**The near-miss.** While waiting for PR #118's checks I armed a monitor to report
each check as it landed. It parsed `gh pr checks` with `jq`. There is no `jq` on
this machine. Every poll therefore produced an empty string, the monitor emitted
nothing, and it would have run to its one-hour timeout in perfect silence. It was
caught only because the absence of any event after several minutes looked wrong
and the binary was checked by hand.

**Why it belongs here rather than in a session note.** The monitor was never
committed, so the repository carries no defect from it, and it is recorded anyway
because the SHAPE is the one this project keeps finding:

- a shebang that made a security test file collect zero tests and report healthy
- a guard that scanned zero files and printed PASS
- a canary that reported zero failures on a suite that had failed to collect
- evidence that was true when captured and false when quoted
- and now, a watcher whose silence is indistinguishable from patience

The shared mechanism is always the same. **The thing that reports the outcome is
not the thing that does the work**, so when the work does not happen there is
nothing left to notice. Failure and absence produce identical output. Every fix
in this family is the same fix too: make the reporter assert that the work
actually ran, and make "I could not tell" print differently from "it is fine".

Both gates shipped in commit 78464e3 were written to that rule, which is why
`scripts/ci/assert-seo-audits.mjs` fails when Lighthouse's audit set drifts from
its baseline rather than quietly asserting nine of twelve audits, and why
`scripts/ci/types-drift-guard.mjs` fails closed when it cannot read the applied
migration list instead of assuming every migration is pending.

**The audit that followed: what else could go quiet?** Every external-binary
dependency in the tree, and what its absence actually looks like. None is a false
PASS, so per the founder's instruction none was changed tonight.

| Where | Depends on | What its absence looks like | Severity |
|---|---|---|---|
| The PR-check monitor (session tool, never committed) | `jq` | SILENCE, reads as still-waiting | the near-miss itself |
| `.github/workflows/post-deploy-smoke.yml:111,115` | `curl`, swallowed with `\|\| true` | A failed first `curl` leaves `START_ID` empty, so the next non-empty read reports "deployment changed" when nothing changed. A false PROGRESS signal, not a false pass: the step is explicitly non-gating and the real assertions (HTTP status, error-boundary HTML) run afterwards | LOW |
| `.github/workflows/post-deploy-smoke.yml:240` | `npx playwright install chromium >/dev/null 2>&1 \|\| true` | An install failure is invisible where it happens and surfaces later as a loud browser-launch error. The swallow buys nothing | LOW |
| `.github/workflows/lighthouse.yml:78,82` | `gh api ... \|\| true` | Empty result simply retries; after the 10-minute deadline it errors explicitly. Correct as written | none |
| `.github/workflows/lighthouse.yml:175` | `lhci upload ... \|\| true` | Deliberate. Upload is diagnostic and must never gate | none, by design |
| `.github/workflows/env-locks.yml:109-127` | `jq` | Runs on `ubuntu-latest`, where `jq` is preinstalled, under `set -e`. A missing `jq` fails loudly | none |
| `scripts/check-types-drift.sh` | `bash`, `node` | `run: bash <file>` fails loudly if absent. Its surface shrank on 16 August: it is now a one-line delegation to Node | none |
| `scripts/guards/preview-deployment-state.mjs` | `VERCEL_TOKEN` | SKIPS and exits 0, but prints the state is "UNKNOWN, not good" | none: this is the honest handling of the class |
| `scripts/verify/migration-collision-guard.mjs` | `--remote` plus credentials | SKIPS and exits 0, printing "a skipped check is UNKNOWN, not clear" | none, same reason |
| `scripts/guards/no-ai-authorship.mjs` | git history | SKIPS on a shallow checkout and says so | none, same reason |

The last three are worth naming precisely because they look like the defect and
are not. They exit 0 without checking, which is structurally "absence reads as
pass" - but each one says out loud that it did not run and that the answer is
unknown. That is the whole difference, and it is the pattern to copy.

**The exemplar fix is already in this repository, and I nearly mis-reported it.**
I started to write that `no-ai-authorship` still passes vacuously on CI's depth-1
checkout. That was true once and is not true now, and I only found out by reading
`.github/workflows/ci.yml:53-69` instead of trusting the recollection. The build
job pins `fetch-depth: 0` specifically because the guard reads commit MESSAGES and
was "being handed a one-commit clone and reporting PASS having inspected a single
message".

The second half of that fix is the part worth copying everywhere. The guard now
ends with `[no-ai-authorship] scanned N commit(s), scope: ...`
(`scripts/guards/no-ai-authorship.mjs:235`), and the workflow comment states that
a line reading "scanned 1 commit(s)" means the `fetch-depth` block has been lost.
That is the whole family solved in one move: the reporter publishes HOW MUCH WORK
IT DID, so a gate that has quietly stopped working says so in its own output
rather than printing the same PASS it always printed.

Measured against that standard, tonight's `[types-drift] 88 migration(s) in the
repository, 77 applied, 11 pending` and `[seo-audits] 2 report(s) from ...` lines
are the same device, and the SEO gate additionally refuses to print "matches the
baseline" when it does not.


## CORRECTED 15 August 2026: two findings I reported were WRONG

Both are struck rather than quietly edited, because the way they were wrong is
the point.

| # | Finding | Correction |
|---|---|---|
| B1 | ~~"The login form fails SILENTLY."~~ | **WRONG, and the method was the fault.** The evidence was a page-text capture truncated at 300 characters, which cut off exactly where the error renders. Captured properly from the wire: a wrong password returns GoTrue `400 {"code":"invalid_credentials"}` and the page renders "That email address and password combination did not match. Check them and try again." The credentials path was never silent. A correct password returns `200` with a token and lands on `/dashboard`, verified repeatedly. **What IS real and unexplained:** the sign-in is intermittently refused on this preview under repeated automated logins from one IP, and I could not catch that specific failure with the network attached, so its cause is UNPROVEN. It is not the GoTrue rate limit at the token endpoint: twelve rapid attempts all returned `400`, never `429`. Guarded going forward by `tests/unit/auth/no-silent-auth-failure.test.ts`. |
| B2 | ~~"The seat builder zoom and pan are UNVERIFIED."~~ | **NOW PROVEN, and the first two attempts were both the test's fault.** Attempt one looked for a canvas on the seat-map list and concluded there was none; there is one, 754x560. Attempt two drove a plain wheel and reported zoom INERT; `seat-canvas.tsx:8` binds the gestures as "drag pan, pinch, **Ctrl+wheel**, double tap", so a bare wheel is deliberately left to scroll the page rather than trap it. With Ctrl held, `scripts/verify/seat-builder-interaction.mjs` reports **zoom WORKS and pan WORKS**, both by comparing canvas pixels before and after. |

Non-blocking observations found while merging the five launch branches and
clearing the guard failures, 12 August 2026. One line each, by founder
instruction. Nothing here is fixed; nothing here blocks. Fix only on a ruling.

## STANDING RISK, not an observation

**The main repository defaults to PRODUCTION.** In
`C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app`, `.env.local` sets
`NEXT_PUBLIC_SUPABASE_URL` to the PRODUCTION project `gndnldyfudbytbboxesk`, and
`.env.local.bak.20260627145347` carries production values as well. `.env.local`
is the file Next.js and most scripts load by default, so **any script run in that
worktree reads production unless it explicitly overrides the environment**.

That sits directly against the standing rule that production is never written to
and TEST `vkapkibzokmfaxqogypq` is the only writable database. The protection
today is that individual scripts refuse when the URL is not the TEST ref, which is
a per-script courtesy rather than a property of the environment, so it holds only
for the scripts that remembered to check.

Recorded 12 August 2026 from `integration/launch`. **Nothing in that repository
was changed**, per founder ruling. It is listed here because it is a live hazard
awaiting a decision, not a defect to be quietly patched.

| # | Finding |
|---|---|
| 1 | `CLAUDE.md:1150` and `:1152` carry two em dashes, inherited by automatic merge from `fix/security-hardening`, inside a block the file itself says `next dev` regenerates, so deleting them re-creates them. |
| 2 | No gate scans `CLAUDE.md`: `scripts/copy-tell-gate.mjs` is wired in CI at `ci.yml:65` and its `DASH_RE` is real, but its walk is rooted at `src` only, so finding 1 will not fail any gate. |
| 3 | `.githooks/commit-msg` is mode `100644`, not `100755`, on both original variants and therefore on the union. It runs on Windows through Git's shell, but a POSIX checkout will not execute a non-executable hook, so Law 8's first line of defence is silently absent there. |
| 4 | There is no `.gitattributes` and `core.autocrlf=true`, so `.githooks/commit-msg` is CRLF in a Windows working tree. The committed blob is LF and both original variants had the same exposure. |
| 5 | `tests/unit/media/image-pipeline.test.ts` carries TWO describe blocks covering the downscale, one from each line of work, testing the founder's 3625 x 4961 case, the within-bounds pass-through and the no-upscale rule twice over. Harmless duplication, worth collapsing. |
| 6 | `tests/unit/security/image-pipeline-format.test.ts` covers the format fix only, which is correct rather than a gap because the downscale assertions live in `tests/unit/media/image-pipeline.test.ts`, but the split is not obvious from either filename. |
| 7 | The merged `image-pipeline.ts` header still describes the pipeline as SPEC 1.5 while three branches have since rewritten the block. Accurate, no longer complete. |
| 8 | The merge order and PR mapping in `docs/roast/HANDOVER-INTEGRATION-2026-08-12.md` section 3 is authoritative, confirmed by founder ruling: `#113` is `feat/public-composer` and `#117` is `fix/production-sweep`. |
| 9 | Per-merge verification of markers, symbol presence and overlap cannot see a cross-file type break. `business-name-mismatch.tsx` was left uncompilable by merge 3 and surfaced only at the typecheck after merge 5. A typecheck belongs after every merge. |
| 10 | A grep sweep by CONSTANT NAME misses assertions written as bare numbers. Stale `4000` expectations survived a sweep for `MAX_STORED_IMAGE_DIMENSION` and were caught only by reading the file. Sweep by value as well as by name. |
| 11 | This machine has no Node version manager and its only system Node is 24. The pinned Node 20.20.2 used for a CI-equivalent run is a portable extract at `C:\node20`, added to PATH per shell. It is not on PATH by default, so a future session will silently run Node 24 again unless it repeats the step. |
| 12 | `lighthouse@13.1.0` declares `node >=22.19` while `.nvmrc` pins 20, so `npm ci` on the pinned runtime emits EBADENGINE for it. The install succeeds and the CI jobs that run Lighthouse pin 20 explicitly in `lighthouse.yml`, so this is a latent inconsistency rather than a live break. |
| 13 | `scripts/security/entrypoint-authz-audit.mjs` fails the build only on `RED-NO-AUTH`. It currently prints **6 `RED-IDOR-RISK`** entry points, all authenticated but privileged with no ownership check, and passes them. The gate's own worst category does not block. |
| 14 | The drive-account password appears in clear text in two committed COMMENTS that `no-plaintext-credential` cannot see, because it only matches an assignment: `tests/unit/auth/no-native-submit.test.ts:12` and `src/lib/hooks/use-hydrated.ts:17`, both quoting the leaking URL that motivated the fix. |
| 15 | `mintKitCode` draws `randomBytes(n)` and takes `% 31`, which is a slight modulo bias (256 is not a multiple of 31, so 8 of the 31 symbols are marginally likelier). Irrelevant at 2^59 of headroom, worth knowing before the alphabet or length is ever changed. |
| 16 | `.env.test` carries 11 variables and does not include `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, so `check-public-env` warns on it locally. Non-blocking for a local build; the maps surface will not render from this worktree. |
| 17 | A **Sensitive `NEXT_PUBLIC_` variable is invisible at build time and fails silently**: Sensitive values are runtime-only, `NEXT_PUBLIC_` values are inlined at build, so `NEXT_PUBLIC_SITE_URL` read as empty in every production build from 23 July until 13 August and the resolver fell through to `VERCEL_PROJECT_PRODUCTION_URL` (`eventlinqs.com`). That is the root cause of the canonical-host defect. Now a regular Production-only variable set to `https://www.eventlinqs.com.au`. Nothing warns on the combination. |
| 18 | The env manifest's production shape for both origin variables, `brandedHttpsOrigin` = `^https://([a-z0-9-]+\.)*eventlinqs\.com(\.au)?/?$`, ACCEPTS `https://eventlinqs.com` and `https://www.eventlinqs.com`, so the shape guard would pass a non-canonical production origin. Closed at the point of use by `acceptableExplicit` in `src/lib/site-url.ts`; the manifest shape itself is still loose. |
| 19 | Node 24 ships **npm 11.17.0**, which warns `allow-scripts: 3 packages have install scripts not yet covered by allowScripts` for `@sentry/cli`, `esbuild` and `unrs-resolver`. This warning class did not exist under the npm that shipped with Node 20. All three still work (`require('esbuild')` resolves 0.27.7, builds and tests pass), so it is a notice rather than a break, but `npm approve-scripts` is now a decision somebody should make deliberately rather than leave as a permanent warning. |
| 20 | `npm audit` on the Node 24 install reports **31 vulnerabilities (2 low, 18 moderate, 11 high)**. Unchanged in kind by the runtime move and not investigated here per the standing rule, but recorded because the number is now on the record for a launch build. |
| 21 | **BLOCKING CI, and PRE-EXISTING on both runtimes.** `npx vitest run` on `integration/launch` fails 5 tests on Node 24 and 6 on Node 20, out of 2228. Same command, same tree: Node 20 = 6 failed / 2222 passed, Node 24 = 5 failed / 2223 passed. The failures are `tests/unit/security/rls-column-exposure.test.ts` (collection error), `tests/unit/launch-compose-arrivals.test.ts` (workshop and birthday, `questions.length` does not equal `payload.unresolved.length`), `tests/unit/dashboard/no-clock-during-render.test.ts` (flags `src/lib/ai/draft-fallbacks.ts` and `src/lib/launch/draft-artefacts.ts`), and `tests/unit/events/publish-scheduled.test.ts` (2, admin client constructed when one was injected). None is caused by the Node move and none is in a file the 13 August session edited. `npm test` is a CI gate, so the branch cannot go green until these are fixed. |
| 22 | Exactly one test behaves DIFFERENTLY across the two runtimes, and it improves: `tests/unit/security/no-native-submit.test.ts` fails on Node 20 and PASSES on Node 24. Node 24 is therefore strictly better on this suite, not merely equal. |
| 31 | **The seeded demo catalogue on TEST has 61 orders against 16 distinct events.** The runbook's original bulk delete was refused outright (23503) because `orders.event_id` is `ON DELETE RESTRICT`. Runbook step 4 is now guarded with `NOT EXISTS` so it removes only what has taken no money. If production's 32 seeded events carry orders, the same applies there. |
| 32 | `SUPABASE_DB_URL` in `.env.test` has an **unencoded password**, so `new URL()` rejects it and `pg` reports the input as `*****REDACTED*****`, which reads like a placeholder rather than a parse failure. Any script passing it as a `connectionString` fails; the four e2e scripts under `scripts/` do exactly that. They also import `pg`, which **is not declared in `package.json` at all**, so those four scripts cannot currently run. |
| 33 | `npm install --no-save --no-package-lock` still **drifts `node_modules` off the lockfile**: vitest moved 4.1.5 to 4.1.10 and three unrelated tests began failing on timeouts under load. `npm ci` restored it. Gates measured on a drifted tree are the same class of error as gates measured on the wrong runtime. |
| 34 | npm 11's `allowScripts` is **advisory today**: per npm's own docs, "install scripts still run by default", and "a future release will block unreviewed install scripts". Decision 13 August 2026: leave the warning, approve `@sentry/cli`, `esbuild` and `unrs-resolver` before that future npm lands. Source: `https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts`. |
| 35 | `undici` is **not reachable from any request path**: it arrives only via `jsdom`, the vitest DOM environment and a devDependency. Next.js server fetch uses the runtime's built-in copy. No action. |
| 29 | The `no-clock-during-render` narrowing shipped on 13 August was **position-dependent and blind at close range**: an instant-derived `.format(new Date())` one line below a components constructor was cleared, while the same call thirteen lines below was caught. Found by drilling, not by reading. Now resolves the formatted identifier instead. **A guard verified by reading is a guard that has not been verified.** |
| 30 | `npm audit` triage is INDICATIVE, not verified per chain. The 11 high are dominated by the `lighthouse` devDependency chain (`puppeteer-core`, `@puppeteer/browsers`, `extract-zip`, `ws`, `ip-address`) plus `vite` via `launch-editor`, all build and audit tooling with no request path. `undici` is the one worth a second look, because Next.js uses it for server-side fetch. `exceljs`/`uuid` is a production dependency but the flaw needs a caller-supplied buffer, which the export path does not do. **No chain was traced to a route handler; treat this as a starting point.** |
| 25 | **A shebang on any `.mjs` a test imports makes the whole suite fail to collect.** Vite does not strip `#!`, so `tests/unit/security/rls-column-exposure.test.ts` died with `SyntaxError: Invalid or unexpected token` and no line number, reported `no tests`, and passed vacuously for the life of this branch. Removed from `scripts/security/rls-exposure-scan.mjs`; **29 other scripts under `scripts/` still carry one** and are the same trap the day a test imports them. |
| 26 | `stripNonCode` in `scripts/guards/lib/source.mjs` did not understand regex literals, so a regex containing a quote opened a phantom string and blanked the rest of the file, hiding `.insert(` from write detection. Fixed, with a test. **Measured impact on this tree: none.** All seven dependent guards produce byte-identical output before and after, so no file currently trips it. Kept as hardening because it fails in the dangerous direction. |
| 27 | `0284817` is NOT a merge commit; it has a single parent. The five-way merges are `197a24b`, `6e779da`, `6f62621`, `47ac212`, `579e3a6`. Any attribution done against `0284817` as a merge point is measuring the wrong thing. |
| 28 | The `no-clock-during-render` scanner flagged a Date built from EXPLICIT LOCAL COMPONENTS as needing a `timeZone`. It does not: the components go in and come back out, so the label is identical in every zone, and pinning a zone would actively shift a wall-clock time the organiser typed. Scanner narrowed to Dates derived from an instant. Its four "still catches" cases still fire. |
| 24 | `scripts/check-public-env.mjs` prints `WARNING (not blocking - local build)` for missing `NEXT_PUBLIC_SUPABASE_URL`, then `next build` fails a minute later on exactly that variable: `next.config.ts` interpolates it into a rewrite unguarded and Next rejects `destination: "undefined/storage/v1/object/public/:path*"` with `Error: Invalid rewrite found`. The warning is wrong about itself, and the resulting error names a rewrite rather than the missing variable, which sends the reader to the wrong file. Building with `.env.test` loaded fixes it. Nothing to do with the runtime; it happens identically on Node 20. |
| 23 | `tests/unit/dashboard/no-clock-during-render.test.ts` flags `formatParts` in `src/lib/launch/draft-artefacts.ts` for formatting with no `timeZone`. Reading the code, the `Date` is CONSTRUCTED from local wall-clock parts (`new Date(y, mo-1, d, hh, mm)`) and then formatted in the same local zone, so the two cancel and the printed label is zone-independent by construction. That looks like a false positive of the scanner rather than a live hydration defect, but it is the scanner that is failing the build, so one of the two has to be changed deliberately. |

## Added 14 August 2026

Findings **31 and 32 above are SUPERSEDED**. 32 is fixed: `pg` is now a declared
devDependency at `8.23.0` and every call site takes discrete fields from
`resolveDatabaseTarget()`. 31 is superseded: the purge no longer skips
order-bearing seeded events, it removes them and their dependents in dependency
order, rehearsed on TEST.

| # | Finding |
|---|---|
| 36 | **The seeded-data purge removes events, not the organisations and venues behind them.** On TEST that leaves **33 organisations** and **13 venues** with zero events, all `status='active'`, each still served by `src/app/organisers/[handle]/page.tsx:57` and still listed by `src/app/sitemap.ts:217` and `:239`. They are deliberately NOT deleted: **31 of the 33 hold a `stripe_account_id` with `stripe_charges_enabled` true** and all 33 have an `owner_id`, so deleting the row orphans a live Stripe Connect account from the only record naming it. Unwinding a Connect account is a deliberate Stripe-side job. The purge script prints both counts on every run so this stays visible. **Needs a founder ruling before launch**, because an indexed organiser page with nothing on it is a Law 5 dead end. |
| 37 | `scripts/guards/preview-deployment-state.mjs` called **`/v6/deployments`**, which Vercel's REST reference has superseded with `/v7` (https://vercel.com/docs/rest-api/deployments/list-deployments, fetched 14 August 2026). Moved to v7 under Law 9. Whether v6 still works is **UNSOURCED**: no Vercel deprecation-policy page could be fetched. The guard is still unverified end to end because no `VERCEL_TOKEN` exists yet. |
| 38 | The same guard had **two silent fail-opens**, both now closed. It read only `d.state`, while the v7 reference documents `readyState`; had the field been renamed, `settled` would never be found and it would have printed "still building" and exited 0 for ever. And a **`CANCELED`** deployment fell through to the success line and printed PASS, letting a cancelled build stand in for a verified one. |
| 39 | **`numFailedTests` is 0 when a file fails to collect.** Established from the installed vitest 4.1.5 source: `@vitest/runner` records the throw on the FILE, and the JSON reporter counts only tasks whose state is `fail`. A file that never collected registers no tasks. Reproduced: a deliberate module-scope throw printed `185 files, 2246 tests, 0 failed`. Any check keyed on `numFailedTests` reads a broken suite as clean. The canary now also gates on `success`, `numFailedTestSuites`, and a testResults entry that failed while registering zero tests. |
| 40 | **A vitest project whose `include` glob matches zero files exits 0 in silence.** The `!modules.length` check is global, not per project, so with two projects (`node` and `component`) a renamed directory would delete an entire project's tests with no warning and a green run. Nothing in vitest catches this; only a committed test-count floor does. |
| 41 | **`/events` silently drops any event failing `hasRealCover`** (`src/lib/events/fetchers.ts:741`). After the purge, a real event with no cover image will not appear on `/events` even though the row exists, which will read as "the purge emptied the site" when it did not. |
| 42 | The homepage's **`RAIL_MIN = 3`** (`src/app/page.tsx:114`) hides any category rail with fewer than three events. Post-purge the homepage will lose most rails and fall back to the "Events loading soon" state. Correct behaviour, and it is the completeness bar reporting honestly, but it will look alarming the first time. |
| 43 | **`tests/unit/guards/guard-registry.test.ts` had `every registered guard exists on disk` changed from `test(` to `test.skip(`** in uncommitted work, with no comment and no reason. That is the check catching a guard registered in the runner whose file is absent. Un-skipped it passes, so the skip was hiding nothing and had simply been left behind. Caught by the test-count canary, not by review. The canary now fails on **any** skipped test, because adding one test while skipping another leaves the total unchanged. |
| 44 | **The copy-gate scratch file poisoned the gate, not just the walkers.** `src/__copy_gate_scratch__/scratch.tsx` was found sitting in the tree from an interrupted run, and `node scripts/copy-tell-gate.mjs` exited 1 on it, reporting `placeholder-copy` on a tree that was genuinely clean. The scratch now lives in the system temp directory, outside the repository, reached by an additive-only `COPY_GATE_EXTRA_DIR`. |
| 45 | **Three seeded-data scripts called the wrong preflight.** `seeded-order-forensics`, `seeded-dependency-map` and `seeded-purge-rehearsal` connected over `SUPABASE_DB_URL` as database owner while calling `assertNotProduction()`, which judges `NEXT_PUBLIC_SUPABASE_URL`. Those are different variables and can name different projects, so a run could pass its preflight and connect somewhere else. All three now call `assertNotProductionDatabase()`. Each also carried its own fourth copy of the connection-string parser. |
| 46 | **`npm ci` left `node_modules` completely empty when it failed mid-run.** A network `ECONNRESET` hit after the cleanup phase, so every package was removed and nothing reinstalled; `vitest`, `next`, `react` and `typescript` were all gone. A retry with `--fetch-retries=8` recovered it. Worth knowing before running `npm ci` on a flaky connection with no time to spare. |
| 47 | **Free disk sat at 5.07 GB**, barely above the constitution's 5 GB floor, before `.next` (0.49 GB) was removed. A Next.js build writes gigabytes and fails mid-compile with `os error 112` on a near-full disk, leaving broken routes that read as code bugs. This machine is one large build away from that. |

## Added 15 August 2026

**Finding 36 is CLOSED, and it closed by measurement rather than by work.**
Production carries **zero** seeded events (48 events, all `is_seed_data = false`,
exact server-side counts, read only). The 33 orphaned organisations and 13
venues were a TEST-only artefact. On production exactly one organisation has no
events (`oanh`), it holds no Stripe account, and it is not seeded. Runbook
section 6 is therefore **not a launch step**.

| # | Finding |
|---|---|
| 48 | **THE HOMEPAGE WAS EMPTY ON THE DEPLOYED PREVIEW, and had been for weeks.** `scripts/seed-events-catalogue.mjs` anchored fixture dates to a hardcoded `Date.parse('2026-06-07T00:00:00Z')`. By 15 August every one of the 55 fixture events was 5 to 10 weeks in the PAST. `loadHomeUpcoming` filters `start_date >= now`, so it returned an empty array, and its fall-through only covered a **missing** fixture (`rows.length > 0`), never a **stale** one, so it never reached the live query. The preview homepage rendered "Events loading soon" while the TEST database held **184 upcoming published public events** and `/events` showed a full catalogue. Nothing failed anywhere: a stale fixture and an empty catalogue render the identical screen. Every "verified on the preview" claim about the homepage since roughly late June was made against a blank page. Fixed three ways: the generator anchors on tomorrow, the fall-through now triggers when the fixture yields nothing USABLE, and two new tests fail CI if the fixture ever ages out again. |
| 49 | **The audit's own first run produced 93 false positives**, and the mechanism is worth keeping. Its inert-control detector compared `document.body.innerHTML.length` before and after a click. The footer accordion is a correct ARIA disclosure whose click flips `aria-expanded` false to true (one character shorter), swaps `grid-rows-[0fr]` for `[1fr]` (same length), drops `inert` and adds `rotate-180`. Net movement under the 8-character threshold, so a working control read as dead. The payout calculator was flagged the same way, because "$30" and "$60" are the same length. **A length is not a fingerprint.** Now hashes the markup and folds in URL, aria-expanded/selected/checked, open and inert states, and dialog count. |
| 50 | **The audit invented URLs and then reported their 404s as defects.** `/categories/comedy` and `/categories/arts-community` are not routes: `/categories/[slug]` accepts seven hero-category slugs only (afrobeats, amapiano, gospel, owambe, caribbean, heritage-and-independence, networking) and the general taxonomy is reached through `/events?category=`. `/music` does not exist in this branch. `/artists` 404s by design because the `artist_showcase` flag is off. An audit that manufactures its own findings buries the real ones. |
| 51 | **The event detail page was never audited on the first run**, and nothing said so. The audit derived its sample event slug from the homepage; the homepage was rendering an empty state; so no slug was found and the most important page on a ticketing platform was silently skipped. It now takes the slug from `/events` and reports explicitly when no event link can be found anywhere. |
| 52 | `loadHomeUpcoming` discards the query error (`const { data } = await supabase...`). A failing query is therefore indistinguishable from a genuinely empty catalogue at the call site. Not changed here because the fall-through above removes the practical risk, but the error is still being thrown away and a logged warning would have found finding 48 in minutes rather than weeks. |
| 53 | **Production holds exactly one order**, `EL-NGEBXWUZ`, `pending`, payment `initiated`, no payment intent, no ticket, from 28 May 2026. An abandoned checkout, correct behaviour, no money moved and no ticket owed. Recorded so the count is not mistaken for a stuck paid order later. |
| 54 | `Get-Content -Raw` piped into `Set-Content -Encoding UTF8` in PowerShell 5.1 **corrupted `scripts/seed-events-catalogue.mjs`**: it added a BOM and turned every box-drawing `--` comment rule into mojibake. Caught by reading the diff. Repaired by restoring the exact bytes with `git show HEAD:path` written through Node as a Buffer. Do not round-trip source files through PowerShell text cmdlets; use the editor or Node's `fs`. |

## Added 15 August 2026, second pass: the final pre-launch audit

| # | Finding |
|---|---|
| 55 | **The `VERCEL_TOKEN` created on 15 August is not referenced by any workflow.** `grep -rn VERCEL_TOKEN .github/` returns nothing. `scripts/guards/preview-deployment-state.mjs` runs inside `npm run build` (prebuild then run-guards) in the CI `verify` job, and needs three inputs: a token, `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID`. It had none of them, so it printed SKIP on every CI run since it was written. A secret nothing reads is not protection. All three are now wired into the `verify` job; the two ids are identifiers rather than secrets, so they sit in version control instead of a dashboard (Law 9, clause 3). |
| 56 | **The same guard could never have worked in CI even with the token.** Its branch came from `git rev-parse --abbrev-ref HEAD`, and `actions/checkout` leaves a DETACHED HEAD, so that returns the literal string `HEAD`, which matches no `githubCommitRef` on any deployment. The guard would have printed "no deployment found for HEAD yet" and exited 0 for ever, and that line reads as "this branch has no preview yet" rather than as a broken gate. It now reads `GITHUB_HEAD_REF` then `GITHUB_REF_NAME` first (https://docs.github.com/en/actions/reference/variables-reference, fetched 15 August 2026), and returns null rather than "HEAD" when detached. Drilled against a real detached-HEAD repository: without the CI variables it now skips and says DETACHED HEAD; with either variable set it resolves the real branch. A wrong token and absent ids were also drilled and both exit 0, so wiring it cannot turn a passing build red. |
| 57 | **`is_seed_data = false` on production is the column DEFAULT, not a measurement that production holds no demo data.** Migration `20260628000001` adds the column `NOT NULL DEFAULT false` and its own header says the backfill that marks the demo catalogue "is done by the seeder under a TEST-only guard, NOT in this migration". Production's 48 events were created 25 April, 9 May and 14 May 2026, all BEFORE that migration, so every one of them inherited `false` regardless of what it is. 46 of the 48 are the demo catalogue by content (Afrobeats Melbourne, Diwali Festival Melbourne, Lagos Comedy Tour and so on) across 16 organisations. The runbook's "production carries no seeded data at all" is true of the MARKER and not of the DATA, and the practical consequence is that `seeded-purge-rehearsal.mjs` would match zero rows on production and throw "no seeded events found; nothing to do". Nothing was deleted; this is recorded so the eventual cleanup is not planned around a marker that cannot see its target. |
| 58 | **46 of production's 48 events belong to organisations that cannot take money.** Read only, exact counts: production has 18 organisations, 17 of them hold no `stripe_account_id` and have `stripe_charges_enabled = false`. Exactly one, `Party Pty Ltd`, holds `acct_1SFaa2E8rD62IcbM` with charges and onboarding complete, and it owns the two events created 8 and 9 August. **CORRECTED 15 August 2026 (founder): `Party Pty Ltd` is NOT a company and NOT EventLinqs' legal entity. It is the founder's TEST ORGANISER RECORD, created with a made-up name so a real card could be run through a $1 checkout, and it is deleted after that purchase passes.** Every description of it in this log as "the one real organisation" or as a business is wrong. That does not change the count above: 46 of 48 events still sit behind organisations that cannot charge. Production also holds **zero venues**. Whether that Connect account is live-mode is **UNRESOLVED from this shell**: the only Stripe key in any local env file is `sk_test_`, and retrieving the account under it returned HTTP 403 `account_invalid`, which a live-mode account and another platform's account produce identically. The $1 purchase settles it. |
| 59 | **33 of 40 sampled event pages on the preview cannot sell a ticket**, rendering "This organiser is still finishing their payment setup. Tickets for this event go on sale once that is complete. Check back soon." Correct behaviour per event, and the same shape as production's 46 of 48. Every route returns 200 and a link crawl is clean, so no existing gate can see it: this is a completeness question under the volume law rather than a code defect, and it is the founder's call. |
| 60 | **Nothing on the platform links to an organiser profile.** `/organisers/[handle]` is a real route and the sitemap publishes 38 of them, but `grep` over `src/` finds no link to it outside the page's own canonical and Open Graph metadata. The only `/organisers/` link on an event page, a listing page or a community page is `/organisers/signup`. So 38 indexable pages have zero internal links, and an attendee cannot reach, let alone follow, the organiser running the event they are looking at. That sits against the demand engine, where following organisers is a named component. Reported, not fixed: adding an organiser credit block to the event page is a design change and needs Law 2 evidence and founder approval. |
| 61 | **The preview deployment invited Googlebot in.** Measured: `x-robots-tag: index, follow`, `robots.txt` with `Allow: /`, and a sitemap of 932 URLs on the preview host, a near-complete second copy of the catalogue on a different hostname. Vercel adds `X-Robots-Tag: noindex` to preview deployments itself (https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines, fetched 15 August 2026); `next.config.ts:148` was overriding it with a flat `index, follow` on every deployment. Already recorded as a pre-launch blocker in `docs/PRE-LAUNCH-HARDENING.md`, flagged 15 May 2026 and still open. The header is now conditioned on `VERCEL_ENV` (https://vercel.com/docs/environment-variables/system-environment-variables, fetched 15 August 2026), failing open to `index, follow` when the variable is absent so local and CI builds keep their Lighthouse `is-crawlable` pass. **This is half the fix**: previews stop being indexed, they do not stop being readable. Deployment Protection is a dashboard action and remains outstanding. |
| 62 | **The CI placeholder `NEXT_PUBLIC_SITE_URL` was `https://eventlinqs.com`**, in both the `verify` and `test` jobs. Not emitted on production, because Vercel builds with its own environment, but it is a non-canonical host sitting in version control where the next person copies it from, and copying that host is precisely how the post-deploy smoke gate ended up probing a URL that 301s and dropping its bearer token. Changed to `https://www.eventlinqs.com.au`. |
| 63 | **The audit walked `/organisers/signup` and filed it as "organiser profile".** Its discovery took the first `/organisers/<something>` link on the page, and on every page the only one is the signup call to action, so a whole page type went unaudited behind a row saying it had passed. The reason there was nothing else to match is finding 60. It now excludes the reserved paths and falls back to the sitemap, which is the only place organiser profiles are reachable from. |
| 64 | **The audit called a ticketing-blocked event page an empty state**, because "Check back soon" in the payment-setup message matches an empty-state marker. Worse, it had picked that page as its sample event, so the checkout walk would have reported "the payment surface was never reached" as a money-path defect that was entirely the audit's own doing. There is now a third state, TICKETING BLOCKED, and a census that asks the pages themselves which ones can sell before choosing which one to walk. |

## Added 15 August 2026, third pass: walking the money path after the sale gate was fixed

| # | Finding |
|---|---|
| 65 | **THE SALE-GATE FIX IS PROVEN ON THE DEPLOYED PREVIEW, by measurement either side of it.** Before `ac2b62e`: 30 event pages sampled, **33 of 40 blocked**, **0 paid and sellable**. After: 30 sampled, **0 blocked, 24 paid and sellable**. The catalogue went from unbuyable to buyable in one commit. Recorded because the fix was found by walking the deployment, not by reading code, and the before/after is the only thing that proves it landed. |
| 66 | **The event page's sale gate and the charge precondition check DIFFERENT THINGS, and the page is the more permissive of the two.** `isOrganiserSellable` (`src/lib/payments/sale-status.ts:48`) requires `stripe_account_id` and `stripe_charges_enabled`. `assertChargePrecondition` (`src/lib/payments/application-fee.ts:188`) additionally requires `getCurrencyForCountry(org.stripe_account_country)` to resolve, and `getCurrencyForCountry(null)` returns null. So an event can advertise tickets, take the buyer through quantity selection, hold a reservation with a countdown, collect their name and email, and only then refuse with "Payments for this region are not yet supported." with no way forward and the button still enabled. Reproduced end to end on the preview. It is worse than refusing on the event page, because a reservation was taken and the buyer's time was spent. |
| 67 | **28 of 40 TEST organisations holding a Connect account have `stripe_account_country = NULL`**, which is what triggers finding 66 there. That is a seeder gap rather than a platform defect: the seeder sets `stripe_account_id` and `stripe_charges_enabled` and never sets the country. **Production is NOT affected**: read-only, `Party Pty Ltd` (the founder's TEST organiser record, deleted after the $1 purchase, not a company) holds `acct_1SFaa2E8rD62IcbM` with `country=AU`, `charges=true`, `payout_status=active`, `onboarding_complete=true`, so every charge precondition passes for the $1 event. |
| 68 | **The checkout page rendered "Something broke at the root" once, and did not reproduce.** It happened on the first walk after `ac2b62e` deployed, at the moment the alias rolled over to a new deployment id. A second and third walk on the settled deployment reached checkout cleanly, and Vercel's runtime errors for the last 6 hours record **no 500 on any checkout route** (the only group is an old `fetchEvent` PGRST116 on `/events/[slug]`, last seen 14 August). "Something broke at the root" is a CLIENT error boundary, and a client holding assets from the previous deployment navigating into the new one is the classic deployment-skew failure. **UNCONFIRMED**: whether Vercel Skew Protection is enabled on this project could not be read from the API response, and it should be checked before launch, because the same shape would throw a buyer out mid-checkout on any production deploy. |
| 69 | **The all-in price is correct and is shown early, as the ACCC drip-pricing law requires.** Measured on a real reservation: AUD 45.00 subtotal, AUD 2.57 service fee, and the button itself reads "Continue to payment - AUD 48.70". 3.5% of 45.00 is 1.575, plus the 0.99 flat, is 2.565 which rounds to 2.57; 2.5% processing on 45.00 is 1.125; 45.00 + 2.565 + 1.125 = 48.69, displayed 48.70. Both locked fees are applied and the total the buyer sees on the first screen is the total. |
| 70 | **The audit's own money walk was wrong three times before it was right, and each way is worth knowing.** (a) It picked its sample event at random and got one whose organiser could not charge, then reported "the payment surface was never reached" as a money defect of its own making. (b) Corrected to pick a "sellable" event, it got a FREE one, which correctly never reaches Stripe because the fee calculator short-circuits a zero-subtotal cart. (c) Corrected again to require a price, its `NEVER_CLICK` list contained a bare `/register/i` to stop it creating accounts, which also matched "Register 1 ticket", the only proceed control a free event offers, so it excluded the exact button it existed to press and reported "0 candidates" about a page that had one in plain sight. The census now classifies blocked, free and paid separately and the never-click list distinguishes the two senses of "register". |
| 71 | **The audit destroyed its own report once.** The markdown was written before the JSON, a `ReferenceError` fired between them, and a deep-only pass overwrote the full walk's `REPORT.md` with its own fifteen surfaces and then died before saving anything. An hour of walking survived only because the previous run's `raw.json` was still on disk. The raw record is now written FIRST and `scripts/verify/audit-report-from-raw.mjs` rebuilds the markdown from it, so the expensive artefact never depends on a formatter finishing. |
| 72 | **Six privileged server actions take an id with `authz=NONE`**, reported by `entrypoint-authz` on every guard run and passing because the guard only requires a declared posture: `deleteSeatMap`, `importSeatMapCsv`, `saveSeatMap` (`dashboard/venues/[id]/seat-maps/actions.ts`) and `createVenue`, `updateVenue`, `deleteVenue` (`dashboard/venues/actions.ts`). All are `auth=getUser`, `validation=none`, `takesId=true`, `privileged=true`, which is the IDOR shape: a signed-in organiser passing another organisation's venue or seat-map id. Not verified as exploitable here, and not touched, because the venue surfaces were NOT COVERED this session for want of credentials. Worth a ruling before launch. |
| 73 | **`.env.test`'s `CRON_SECRET` no longer matches the Preview scope.** Probing the preview's `/api/cron/health-sentinel?dry=1` with it returns 401. Expected after the rotation that gave Production and Preview different values, but it means any local script that probes a preview cron endpoint now fails authentication, and the failure reads like a broken sentinel rather than a stale local file. |
| 74 | **The Launch Kit poster prints the APEX host, not the canonical one**: `From $25 · eventlinqs.com.au/launch/k/<code>`. It resolves (`https://eventlinqs.com.au/` 301s to `https://www.eventlinqs.com.au/`, verified), so a printed poster works, and it is NOT the banned `eventlinqs.com`. Recorded because a printed artefact cannot be corrected after it is printed, and one redirect hop is being spent on every scan of every poster. |
| 75 | **The composer uses the organiser's whole sentence as the poster headline.** "Warehouse party at the Barwon Club in Geelong, Marlo Reyes b2b Kita" is set as the title across all four artefacts, while the place line under the date reads only "Geelong": the venue named in the input reaches the headline but not the place label. Date, time, price, city and category were all parsed correctly, so this is the one field that is passed through rather than extracted. Also worth knowing: the input said "Saturday 20 September" and every artefact prints "Sunday 20 September", which is CORRECT (20 September 2026 is a Sunday) but silently contradicts what the organiser typed. |
| 76 | **Every artefact was pulled, measured from its own bytes and looked at.** story 1080x1920 (184 KB), square 1080x1080 (169 KB), feed 1440x1800 (251 KB), all `image/jpeg`; poster 595x842 pt, which is 210x297 mm, exactly A4. The poster's drawn text was decoded through its embedded ToUnicode maps rather than inferred. No separate street address is printed, which matches the poster route's own rule that a held-back address becomes a suburb-only place label. |

## Added 15 August 2026, fourth pass: the GIT_DIR incident class

| # | Finding |
|---|---|
| 77 | **Two commits on `integration/launch` are authored `drill <drill@eventlinqs.test>` and this is CLOSED, not a defect to fix.** `487846f` and `ae55157` carry that identity because a test drill ran `git config user.name/user.email` inside a temp directory while `GIT_DIR` was set by the pre-push hook, so the write landed on the shared worktree config instead. **Founder ruling, 15 August 2026: leave it.** The reasoning is recorded here so it is not reopened. `main` takes this branch by **Squash and merge**, which is this repository's established practice: every commit on `main` from `(#105)` to `(#112)` is single-parent, and the last true merge commit was PR #44. A squash merge writes ONE new commit and does not carry the squashed commits forward, so neither drill-authored commit ever reaches `main`. Where the squashed commits have more than one distinct author, as here, GitHub attributes the squash commit to the person who performs the merge, which is the founder. The identity config has been restored to `EventLinqs <hello@eventlinqs.com>` and every commit after `ae55157` carries it. The banned operations (`--amend`, rebase, force push) are the only way to rewrite the two, and rewriting is not authorised. **Do not raise this again.** |
| 78 | **THE INCIDENT CLASS: a child process that inherits `GIT_DIR` makes its own `cwd` decorative.** A git hook runs with `GIT_DIR` (and often `GIT_INDEX_FILE`, `GIT_PREFIX`) exported by git, pointing at the real repository. Any subprocess that shells out to `git` inherits them, and from that moment the `cwd` option is ignored for the purpose of choosing a repository: the command operates on the real one. The drill that proved the migration collision guard did exactly this, ran `git init` in a temp directory, and set `core.bare=true` on the shared config, which broke `git status` with "this operation must be run in a work tree" in ALL NINE worktrees at once. Nothing was lost only because the same failing `git init` also stopped the `git add .` that would have staged temp files into the real index. **This is a class, not one bug**: it applies to every script, test and drill in the repository that spawns git, and it only manifests inside a hook, which is the one place none of them had ever been exercised. Closed by a sweep, a fix to every exposed call site, and a guard that fails the build when a script invokes git without clearing inherited `GIT_` variables. |
| 80 | **THE FOURTH AND MOST DANGEROUS MEMBER OF THE FAMILY: A DIRECTORY LISTING OF EVIDENCE MISTAKEN FOR THE EVIDENCE.** A research sub-agent reported fetches it had never made, with fetch dates, naming Adelaide Fringe, Vivid Sydney, a Muller-Brockmann interview, Gerstner, MoMA and V&A records, and measured scale ratios from award artwork. It withdrew them itself. **DIAGNOSED, and the diagnosis matters more than the incident:** it was NOT invention from nothing, and NOT failed fetches reported as successes. Its own sub-agents had genuinely retrieved real documents and written them into a shared scratchpad. The parent listed that directory, saw the FILENAMES, and reported what the filenames implied as though it had read the contents. Verified by inspection: the files are real and hold real retrieved text (`agda-darkmofo.md` is a genuine AGDA awards entry for Dark Mofo 2017 naming Leigh Carmichael and Megan Perkins; `hofmann_pr.md` is MoMA press release No. 53 announcing "POSTERS BY ARMIN HOFMANN" opening 10 September 1981; `gerstner.md` carries the Designing Programmes text with its Kroplien footnote). **The evidence existed and was never opened.** So a large part of the withdrawn material is probably recoverable by reading the files rather than re-fetching them. This is the most dangerous member of the family because the other three produce a false GREEN, which a later check catches, while this produces confident FALSE FACTS, which nothing downstream catches: a parent cannot tell a fetched citation from an inferred one, so Law 7 was being enforced on assertion rather than on evidence. **THE CONTRACT THAT CLOSES IT: every sub-agent research claim must carry an ANCHOR, meaning the URL plus something from the retrieved content that could not have been guessed, an exact quoted phrase of six words or more, or a specific numeric value with its sentence. No anchor means UNSOURCED regardless of how confidently it was reported, and every agent brief must also demand an explicit FAILED TO RETRIEVE list so gaps are visible rather than filled.** |
| 79 | **THE THIRD INSTANCE OF "EVIDENCE TRUE WHEN CAPTURED, FALSE WHEN QUOTED".** A type error reached the remote and put two previews into ERROR. `tsc --noEmit` had been run and had exited 0, and was reported as evidence, but it ran BEFORE the final edit and was quoted AFTER it. The build, the suite twice and nine guards were all genuinely green against a tree that no longer existed by the time the claim was made. Named as a class because this is now the third occurrence in the same shape: (a) the stale `node_modules` junction that let `npx tsc` return exit 0 having run nothing, (b) the Sensitive environment variable that read as present when the dashboard was checked and as empty at build time, and (c) this one. **The common shape is a measurement whose validity window closed between the measuring and the telling, with nothing in the report recording when it was taken.** Two mitigations landed with this finding: the pre-push hook now runs the typecheck as well as the suite, so the last gate before code leaves the machine measures the tree that is actually leaving; and the standing rule is that the verification sequence is re-run after the LAST edit, never before it. |

### The research audit, 15 August 2026, required by finding 80

Every research finding this project currently relies on that came from a
sub-agent, with a verdict. VERIFIED means I opened the retrieved artefact or the
primary source myself and matched the claim against it. UNVERIFIED means the
claim may well be true, I have not checked it, and it may not be built on.

| Finding relied on | Source | Verdict | How |
|---|---|---|---|
| Officeworks A4 poster is 210 x 297mm, trimmed to full document size, "No trim or registration marks are required in your design", 150dpi, "can also be printed in RGB colour mode" | print-spec agent | **VERIFIED** | matched every phrase against the retrieved `ow-posters.md` on disk |
| Officeworks general page: "Do not supply crop marks, trim lines or registration marks in your design", "includes 5mm of 'bleed'", "300dpi is considered the benchmark standard" | print-spec agent | **VERIFIED** | matched against retrieved `ow-fileready.md`, the crop-mark rule at its line 182 |
| Officeworks A4 flyer is "220mm x 307mm (5mm bleed)" at 300dpi, contradicting their own poster spec | print-spec agent | **VERIFIED** | matched against retrieved `ow-flyers.md` |
| PDF/X-4 is ISO 15930-7:2010, and ISO 15930-8 is PDF/X-5, not PDF/X-4 | print-spec agent | **VERIFIED** | matched against the retrieved Library of Congress capture, which states both explicitly |
| 3mm bleed is the modal Australian value across eleven printers; 5mm is the strictest | print-spec agent | **PARTLY VERIFIED** | the CMYKhub, CMYK Colour Online, ONA and Printcraft captures are on disk; the aggregate was checked, not all eleven individually |
| Officeworks A4 EPS template measures exactly 595.2756 x 841.8898 points | print-spec agent | **UNVERIFIED** | the template file is not in the scratchpad. Plausible and consistent with A4, and not measured by me |
| Android Palette target constants, node-vibrant weights, Material Color Utilities tone tables, the HCT contrast guarantees | palette agent | **UNVERIFIED** | quoted with file paths and exact constants, which is a strong anchor, and not checked against the source files. **Must be re-verified before any palette code is written** |
| Oklab and CSS Color 4 quotations | palette agent | **PARTLY VERIFIED** | `csscolor4.html` and `cssextract.txt` are on disk; not every quotation matched |
| D&AD splits posters into graphics-led and typography-led categories; TDC72 Best of Communication Design went to a monochrome no-photography identity | composition agent | **PARTLY VERIFIED** | `dadgd26.md`, `dadtypo26.md`, `tdc2026-bod.md`, `spatial.md` are on disk and were genuinely retrieved. Not matched claim by claim |
| Adelaide Fringe, Vivid Sydney, Melbourne Comedy Festival specs, the Muller-Brockmann interview, museum records, and every measured scale ratio from award work | composition agent | **WITHDRAWN by the agent, treat as UNSOURCED** | the underlying files exist and are real, but the claims were inferred from filenames. Recoverable by reading them, which has not been done |
| The Launch Kit artefact code map: renderers, dimensions, routes, QR payloads | code survey agent | **VERIFIED** | code facts, checked directly in the tree at the quoted paths |
| The git subprocess inventory and its verdicts | sweep agent | **VERIFIED** | every named call site checked and fixed in the tree, and the guard now enforces it |

**THE 6x TO 8x HEADLINE-TO-META RATIO IS A DESIGN RULING, NOT A CITATION**, and it
is recorded here so it is never quoted as sourced. It did not come from the
withdrawn measurements: it was proposed in the panel diagnosis before any
research agent reported, and the composition agent afterwards confirmed that **no
source it retrieved publishes any numeric scale ratio at all.** The defence is
from first principles rather than from a source. A poster is read at two
distances, from across a room where only the largest element resolves, and at
arm's length where the detail is read. Below roughly 4x the two reading modes are
not separated and the poster has no dominant element; above roughly 10x the
secondary information is starved of presence and the page reads as a headline
with footnotes. 6x to 8x sits in the middle of that band. If it is ever pinned in
a guard, that guard's header must say in its own words that the number is a
design ruling by Lawal Adams and not a sourced specification.
