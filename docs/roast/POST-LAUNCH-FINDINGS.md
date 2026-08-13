# Post-launch findings: integration/launch

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
| 24 | `scripts/check-public-env.mjs` prints `WARNING (not blocking - local build)` for missing `NEXT_PUBLIC_SUPABASE_URL`, then `next build` fails a minute later on exactly that variable: `next.config.ts` interpolates it into a rewrite unguarded and Next rejects `destination: "undefined/storage/v1/object/public/:path*"` with `Error: Invalid rewrite found`. The warning is wrong about itself, and the resulting error names a rewrite rather than the missing variable, which sends the reader to the wrong file. Building with `.env.test` loaded fixes it. Nothing to do with the runtime; it happens identically on Node 20. |
| 23 | `tests/unit/dashboard/no-clock-during-render.test.ts` flags `formatParts` in `src/lib/launch/draft-artefacts.ts` for formatting with no `timeZone`. Reading the code, the `Date` is CONSTRUCTED from local wall-clock parts (`new Date(y, mo-1, d, hh, mm)`) and then formatted in the same local zone, so the two cancel and the printed label is zone-independent by construction. That looks like a false positive of the scanner rather than a live hydration defect, but it is the scanner that is failing the build, so one of the two has to be changed deliberately. |
