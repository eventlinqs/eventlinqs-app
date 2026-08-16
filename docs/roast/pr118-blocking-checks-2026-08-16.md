# Roast ledger: the two blocking checks on PR #118

Date: 16 August 2026. Branch `integration/launch`, commit 78464e3 on top of c85b8b6.

The ledger was written before adjudication, from the brief verbatim.

## Phase 1 and 2: requirement ledger and adjudication

### Blocker 1, types-drift

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Diagnose it | MET | CI job 95103005061 raw log. 12 differences, all four columns named in the brief. Root cause: the guard asks one question that conflates two opposite states |
| 2 | Fix so it tells STALE from PENDING apart | MET | `scripts/ci/types-drift-analyse.mjs` `analyse()` returns three statuses, not two: `in-sync`, `pending-migrations`, `drift` |
| 3 | Determine whether every difference is explained by a repo migration not yet applied | MET | `ddlExplainsDelta()` attributes each delta to parsed DDL; applied set read from Management API `GET /v1/projects/{ref}/database/migrations` |
| 4 | Report distinctly and pass, naming the pending migrations | MET | CI job 95109674440: `MIGRATIONS PENDING - not drift. Passing.`, `88 migration(s) in the repository, 77 applied, 11 pending`, naming BOTH `20260808000006_share_codes_never_released.sql` (the three `event_id` nullability changes) and `20260815000001_external_ticketing.sql` (the nine added columns). The local drill names only the latter because only that one is handed to its pending list |
| 5 | Anything not explained is still a hard failure | MET | Drills `stale` and `invented` both exit 1. Unit tests `analyse: the verdict` cover both |
| 6 | Do not lower the bar, skip the check, or regenerate types against production | MET | No threshold changed; `src/types/database.ts` is untouched in the diff (`git show --stat 78464e3`); the check still runs on every PR |
| 7 | Drill: prove it still FAILS on stale types | MET | `node scripts/verify/types-drift-drill.mjs stale` exit 1 |
| 8 | Drill: prove it PASSES on pending migrations | MET | `node scripts/verify/types-drift-drill.mjs pending` exit 0 |
| 9 | Paste both raw outputs and exit codes | MET | Both pasted in the session and in the report |

### Blocker 2, Lighthouse

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 10 | Diagnose it | MET | 11 uploaded LHR reports parsed |
| 11 | Test the hypothesis, do not assume | MET | Tested and CONFIRMED by audit-level data plus a direct `curl -D` showing `X-Robots-Tag: noindex, nofollow` on the preview |
| 12 | Name WHICH SEO audits failed | MET | `is-crawlable` on all 11 URLs, weight 4.043 of 13.043. Plus `canonical` on `/login` and `/signup` only |
| 13 | Explain the 0.69 versus 0.66 split | MET | `image-alt` is `notApplicable` on the three image-less pages, so the denominator falls 13.043 to 12.043. Arithmetic reproduced exactly |
| 14 | Fix correctly, without un-fixing indexing or lowering the threshold | MET | Per-audit floors at minScore 1 replace the category floor; `next.config.ts` untouched; indexability now asserted against the environment |
| 15 | State which cause it was | MET | It was the preview noindex. Stated in the report and in the commit message |
| 16 | Record perf 0.63 and LCP 5.1 to 6.3s in POST-LAUNCH-FINDINGS.md with what I would do | MET | `docs/roast/POST-LAUNCH-FINDINGS.md`, entries N-6 and N-7 plus a dated section with a three-step plan |
| 17 | Do not chase them tonight | MET | No performance work attempted |

### Ship sequence

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 18 | Clear `.next` | MET | `.next removed` |
| 19 | Build against TEST unpiped, `$LASTEXITCODE` as the very next command, raw code pasted | MET | `BUILD_EXITCODE=0`. Target confirmed `vkapkibzokmfaxqogypq`. Not piped. First attempt returned 1 and is reported, not hidden |
| 20 | `npm test` twice with pass, fail, file and skip counts | MET | Run 1 and run 2 both 197 files, 2377 tests, 0 failed, 0 skipped |
| 21 | Full guard runner, verdict per guard | MET | 30 individual verdict lines captured, `[guards] all 30 guards PASS` |
| 22 | Commit | MET | 78464e3, no AI trailer |
| 23 | Push with an explicit refspec | MET | `git push origin integration/launch:integration/launch`, exit 0 |
| 24 | Wait for READY | MET | Monitored to settlement |
| 25 | Confirm PR #118's checks | MET | Reported |
| 26 | Say plainly whether the merge button is enabled | MET | Stated plainly in the report |

### Standing rules

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 27 | Set-Location plus Node 24 PATH on every command | MET | Every PowerShell call carries both; `node --version` v24.14.0 |
| 28 | PowerShell 5.1, semicolons, `$LASTEXITCODE`, never pipe `npm run build` | MET | No `&&`, no `%ERRORLEVEL%`, build never piped |
| 29 | No banned git commands | MET | Only `add`, `commit -F`, `push`, `status`, `log`, `show`, `config --get` were run |
| 30 | No merge to main, no admin override | MET | Neither attempted |
| 31 | No writes to production Supabase | MET | Only reads: `gen types` introspection and a Management API GET. All writes target TEST |
| 32 | Australian English, no em or en dashes | MET | Zero-match grep across all 12 changed files |
| 33 | No trailers, no tool credit, no AI as author | MET | `no-ai-authorship` guard PASS; trailer grep returns 0 |

## Phase 3: adversarial pass

**Silent drops.** None found. All 33 rows appear in the report.

**Interpretation drift.** One real risk, caught and corrected mid-task. The first
version of the types-drift classifier collapsed nullability and optionality into
one test, which made the drill report a legitimate pending migration as drift.
Had I drilled only the failure direction, or not drilled at all, the guard would
have kept blocking PR #118 for a new wrong reason. The drill caught it on its
first run and the fix is recorded in the module and in a named unit test.

A second, subtler risk: replacing a category floor with a hand-written list of
audits is a weakening vector even when every current audit is covered, because a
future Lighthouse release could add a twelfth SEO audit that nobody adds to the
list. That is closed by the baseline check in `scripts/ci/assert-seo-audits.mjs`
and drilled by the `new-audit` scenario.

**Match versus surpass.** The brief did not ask to surpass a competitor. It asked
that neither gate be weaker. Per gate:

| Gate | Before | After | Verdict |
|---|---|---|---|
| types-drift | fails on any difference; cannot see a committed column no migration creates | fails on any UNEXPLAINED difference; also fails on a committed column no migration creates | AHEAD |
| Lighthouse SEO | `categories:seo >= 1`, unreachable on a preview, so effectively permanently red | 9 per-audit floors at minScore 1, same aggregation; plus indexability asserted per environment; plus audit-set drift detection | AHEAD |

**Unverifiable claim hunt.**

- "Same bar" for the SEO replacement. Falsifiable by finding a weighted SEO audit
  in the category that is not asserted. Tested: `tests/unit/ci/seo-audit-coverage.test.ts`
  and the runtime baseline check. Both cover all 9.
- "All 12 differences explained by a pending migration." Falsifiable by an
  unexplained delta. Tested: the drill prints all 12 with the migration that
  explains each.
- "The preview is noindex." Falsifiable by the header being absent. Tested
  directly with `curl -D`; it answered `X-Robots-Tag: noindex, nofollow`.
- "No writes to production." Falsifiable by a write call. The two production
  calls are `supabase gen types` (introspection) and an HTTP GET.

**Generic test.** Not applicable: no user-facing surface was designed or changed.

**AI-tell sweep.** Em-dashes and en-dashes: 0. Tell lexicon across the 12 changed
files: 1 hit, `node-vibrant` at `POST-LAUNCH-FINDINGS.md:273`, which is the name
of a library inside a pre-existing table I did not write and is not the tell word
in prose. Exclamation marks in user-facing copy: none, no user-facing copy
changed.

**Regression sweep, DESIGN-LOCK.** No design file, component, colour, spacing,
hero, or copy surface was touched. The 12 changed files are two CI scripts, two
drills, two test files, one shell entry point, one guard baseline, one Lighthouse
config, one workflow, and one findings document.

**Founder-cost test.** No dashboard action is requested. Two pre-existing SKIPs
remain honest rather than fixed: `preview-state` needs `VERCEL_TOKEN` and
`migration-collision` needs `--remote`. Both predate this task and both print
that they are UNKNOWN rather than clear.

**Evidence-visibility test.** Every claim is backed by a command whose raw output
is in the session, plus two drill scripts the founder can re-run himself at any
time without credentials.

## Phase 4: the gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.

## Carried forward, not blocking

`20260808000006_share_codes_never_released.sql` is ALSO unapplied to production:
production still has `share_links.event_id` NOT NULL and no `retired_at` column.
Nothing in `src/` reads `retired_at`, so nothing is broken today and the guard
passes. When the migration batch is applied, the types-drift guard will correctly
report `share_links.retired_at` as stale and ask for a regeneration. That is the
guard doing its job, not a defect, and it is written down here so it is not a
surprise on the night.
