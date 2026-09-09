# ROAST LEDGER: close-out F2, session 56, 9 September 2026

Written BEFORE adjudicating, from the verbatim text of CLOSE-OUT.md F2 and the
session brief, so the ledger cannot be shaped to fit what happened to get done.

## Phase 1: the requirement ledger

### From the session brief (verbatim imperatives)

| # | Requirement |
|---|---|
| 1 | Read `C:\dev\CLOSE-OUT.md` and `C:\dev\BUILD-BRIEF.md` and continue the build |
| 2 | Obey the COMPLETION LAW: one item at a time, finished with schema, code, tests, guard and driven proof at 390, 768 and 1440, plus full regression green, before the next begins |
| 3 | Fix every defect you find before starting the next task |
| 4 | Never claim something works without driving it |
| 5 | Never guess a slug, route or id; enumerate from source or the database |
| 6 | DISK: do not delete `.next`, `.turbo` or the npm cache; no `npm cache clean` unless short; delete Playwright traces and videos once read; stop and report if free disk falls under 10 GB |
| 7 | Supabase CLI must rest linked to TEST `vkapkibzokmfaxqogypq`; never write to production `gndnldyfudbytbboxesk` without explicit approval |
| 8 | Africa is deferred |
| 9 | After each item, update BUILD-LOG.md, BUILD-LEDGER.md and REVIEW-QUEUE.md and push them to `ops/session-log` |
| 10 | Work the NEWEST items first: the F items, then H, P, PR and L |
| 11 | C1 to C10 are historical and mostly closed; do not restart them |
| 12 | When every launch-blocking item is MET with evidence, write the single word DONE to `C:\dev\BUILD-COMPLETE.txt` |

### From CLOSE-OUT.md F2 (verbatim)

| # | Requirement |
|---|---|
| 13 | F2.1 "Every build-time script must declare which of those it needs" |
| 14 | F2.1 "the registry must carry that declaration" |
| 15 | F2.1 "A script that needs git, docs, or a token, and does not declare it, fails the local gate" |
| 16 | F2.1 "Prove it by adding an undeclared dependency and watching the gate go red before a push" |
| 17 | F2.2 "Make it CI and local only" |
| 18 | F2.2 "remove its dependence on git ls-files: derive the file list by walking the filesystem and applying the .vercelignore rules, so it works in any checkout, shallow or otherwise" |
| 19 | F2.2 "Prove both: it runs and judges in CI, and it does not execute on Vercel" |
| 20 | F2.3 "Wrap every guard invocation so an exception is caught, attributed to the guard that raised it, and printed with its message and the first line of its stack" |
| 21 | F2.3 "Prove it by making one guard throw deliberately and reading its name back" |
| 22 | F2.4 "Enumerate every guard that reads git" |
| 23 | F2.4 "make each state plainly when there is no repository to read" |
| 24 | F2.4 "report how many there are" |
| 25 | F2 closing: "Report at the end: the guard that threw, the count of guards reading git, proof the upload guard no longer executes on Vercel, and a deliberate throw naming itself" |

### Standing rules (apply to every task, from CLAUDE.md)

| # | Requirement |
|---|---|
| 26 | Law 0: state the governing laws before editing |
| 27 | Law 8: no commit carries a Co-Authored-By naming an AI, "Generated with", or a robot emoji |
| 28 | Copy: no em-dashes, no en-dashes, Australian English, no exclamation marks in user-facing copy |
| 29 | The word "culture" is banned in every form |
| 30 | Verification and gates: nothing is pushed until `npm run gate:push` passes locally |
| 31 | H5 / P0.7: never lower the gate, no waivers, no warn-level downgrades |
| 32 | Never merge without approval |

## Phase 2: adjudication

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read CLOSE-OUT.md and BUILD-BRIEF.md, continue the build | MET | both read; F2 identified as the newest item at CLOSE-OUT.md:1993 |
| 2 | COMPLETION LAW, incl. driven proof at 390/768/1440 | MET, with the viewport clause NOT APPLICABLE and said so | F2 changes no rendered surface: `git diff f7aa5d91..HEAD` touches no file under `src/`, `public/`, `next.config.ts` or `package.json`. There is nothing to render at any viewport. Driven proof took the form the item demands instead: execution on the real Vercel build host |
| 3 | Fix every defect found before the next task | MET for 10 of 11; 1 ROUTED and declared | fixed: the launch-readiness "three approvals" lie; the `Error:` regex; the `dir/*` descendant bug; 4 unguarded git spawns; 3 silent catches; 6 invisible entry points; 3 undeclared dependencies; the contradictory SKIP lines; the false staleness notice; the hollow upload simulation. ROUTED: the BenchmarkIndex sustained-load gap (belongs to P0.7, named in BUILD-LOG) |
| 4 | Never claim something works without driving it | MET | every clause driven: a planted throw through the real runner; three planted undeclared dependencies; the guard run as Vercel and as CI; enumeration inside an empty-`.git` tree; seven git readers run in a materialised upload; and the whole item confirmed on two real Vercel deployments |
| 5 | Never guess a slug, route or id | MET | no slug, route or id introduced. The two event slugs quoted are read out of the gate's own URL list; the deployment ids come from the Vercel API |
| 6 | Disk rules | MET | `.next`, `.turbo`, npm cache untouched; no `npm cache clean`; no Playwright runs this session, so no traces or videos; free disk 23 GB throughout, never below 10 |
| 7 | Supabase CLI rests on TEST; no production write | MET | `supabase/.temp/project-ref` = `vkapkibzokmfaxqogypq`. No write to production attempted or made |
| 8 | Africa deferred | MET | not touched |
| 9 | Update the three logs and push to ops/session-log | MET | 4 pushes: `cd1f4672`, `b6a2d9d5`, `81679c66`, plus this one |
| 10 | Work newest first: F, then H, P, PR, L | MET | F2 built. H, P, PR, L then CHECKED rather than assumed: main's smoke green (runs 34283983290, 34283807291), gate passes at unchanged floors, one PR active with three parked, launch-readiness report present and honest |
| 11 | Do not restart C1 to C10 | MET | none touched |
| 12 | Write DONE to BUILD-COMPLETE.txt when every launch-blocking item is MET | REFUSED, correctly | they are not MET: 12 of 16 rows OWNER BLOCKED. CLOSE-OUT L5 also forbids writing the sentinel at this stage in as many words. The conflict is reported, not silently resolved |
| 13 | F2.1 every build-time script declares what it needs | MET | `scripts/guards/lib/build-host-needs.mjs`, 18 of 94 entry points |
| 14 | F2.1 the registry carries the declaration | MET | same file; guard registered in `run-guards.mjs:965`, blocking on prebuild |
| 15 | F2.1 an undeclared need fails the local gate | MET | `build-host-needs-declared.mjs` exits 1 on each of the three |
| 16 | F2.1 prove it by adding an undeclared dependency | MET | driven for git, docs and token; five permanent drills added |
| 17 | F2.2 CI and local only | MET | keyed on `resolveBuildScope`; SKIP proved on the real Vercel host |
| 18 | F2.2 remove the git ls-files dependence by walking the filesystem | MET | `scripts/guards/lib/gitignore.mjs`; 2,155 files enumerated inside a tree where `git ls-files` throws |
| 19 | F2.2 prove both directions | MET | Vercel: `SKIP - this IS the build host`. CI: `scope=ci`, 19 subjects judged. Both are permanent drills |
| 20 | F2.3 a throw is caught, attributed, with message and first stack line | MET | `[guards] no-control-characters.mjs (threw, exit 1)` + `it threw:` + `first frame:` |
| 21 | F2.3 prove it with a deliberate throw | MET | driven on the real runner; permanent drill added |
| 22 | F2.4 enumerate every guard that reads git | MET | 7, derived from the registry, not listed |
| 23 | F2.4 each states plainly when there is no repository | MET | one shared module; five print the sentence on the real build host, two skip before reaching git and say so |
| 24 | F2.4 report how many there are | MET | printed every run: "7 build-time script(s) read git" |
| 25 | F2 closing report: the guard that threw, the git count, proof the upload guard does not run on Vercel, a deliberate throw naming itself | MET | all four in the final report |
| 26 | Law 0: state governing laws before editing | MET | stated at the top of the session before the first edit |
| 27 | Law 8: no AI attribution in commits | MET | 0 matches across `f7aa5d91..HEAD` |
| 28 | No em/en-dashes, Australian English | MET | 0 em-dashes and 0 en-dashes across 2,289 added lines |
| 29 | The banned word | MET | 0 occurrences added |
| 30 | Nothing pushed until the gate passes locally | MET | every push went through the hook; the one red gate blocked the push and nothing was pushed |
| 31 | Never lower the gate | MET | `lighthouse-floor-ratchet`: 43 assertions, all at or above their high-water mark. The red Lighthouse run was answered by re-measuring a rested machine, not by touching a floor |
| 32 | Never merge without approval | MET | PR #145 is CLEAN and unmerged |

## Phase 3: the adversarial pass

Assume the work failed. Find the failure.

### Silent drops

Three items must appear at the TOP of the report or they are silent drops. All
three are in the UNFULFILLED block:

1. Row 3, the BenchmarkIndex sustained-load gap: found, NOT fixed, routed to P0.7.
2. Row 12, the DONE sentinel: refused, with the close-out's own words as the reason.
3. Row 2, the 390/768/1440 clause: not applicable, and saying so rather than
   quietly claiming it.

### Interpretation drift: the one place I took an easier reading, stated plainly

**F2.2 says "remove its dependence on git ls-files". The call is still there.**

I removed the DEPENDENCE (the guard functions with no repository at all, proved
by enumerating 2,155 files in a tree where `git ls-files` throws) but I did NOT
remove the CALL: where the index is readable it is still asked, as a correction.

A strict reading of that sentence says I half-did it. The measured reason, on
this repository:

    tracked but not walked                        333
    of those, surviving .vercelignore              34
    of those, under public/ and therefore shipped  16

Those 333 are force-added, and being force-added is a fact that exists only in
the git index. No correct ignore evaluator recovers it. Dropping the index
entirely would have produced a simulation missing sixteen shipped rasters, which
is a worse simulation, not a purer one. Both deltas print on every run so the
choice is visible rather than buried. **The founder can overrule this**; the
one-line change is to return `walked` unconditionally from `filesForUpload`.

Second, smaller: F2.2 says "applying the .vercelignore rules". The walk applies
the .gitignore rules to decide what git would track, and .vercelignore to decide
what survives the upload. That is a superset of what was asked, and necessary:
applying only .vercelignore would have carried node_modules, .next and .env.local
into a tree that scripts are then EXECUTED in.

### The unverifiable claim hunt

| Claim | What would falsify it | Tested |
|---|---|---|
| 87/87 guards pass | one exits non-zero | ran, exit 0 |
| 152/152 drills fire correctly | any DID NOT FAIL or STALE | ran, 0 of either |
| 5/5 strip-drill cases | any WRONG | ran; found ONE wrong, fixed it |
| 7 git readers, all sharing one sentence | an eighth appears undeclared, or one stops importing the module | guard clause fails the build on either; drilled |
| no runtime file changed | a file under src/, public/, next.config.ts or package.json in the diff | `git diff --name-only`, zero |
| the upload guard does not run on Vercel | it produces output past the SKIP there | read on the real build log |
| the walk agrees with git | a path in one and not the other that is not force-added or untracked | test asks `git check-ignore` per path |

Claim deleted after testing: **"all 19 subjects survive the upload"** was true but
MEANT LESS THAN IT SOUNDED when first made, because 7 of the 19 were escaping the
upload entirely. It is now true in the sense a reader would assume.

### The failure I found in my own work by doing this pass

**The upload simulation was hollow for 7 of its 19 subjects.** It launched each
script from its REAL path with `cwd` pointed at the materialised upload. That
works for a script rooted at `process.cwd()` and does nothing at all for one
rooted at `fileURLToPath(import.meta.url)`, which resolves to the real repository
regardless of cwd. Seven subjects are rooted that way: no-plaintext-credential,
one-fee-copy, one-pull-request-at-a-time, positioning-lock, pre-push-gate-wired,
sourced-specifications and pricing-derive.

The guard reported PASS the entire time. It is a pre-existing defect that I
inherited and then reported on without checking, which is worse than inheriting
it. Fixed: subjects are now launched from INSIDE the upload, which is what Vercel
does. Re-run: 19/19 still exit 0, so nothing was hiding, but the claim now means
what it says. Proof the fix is real: `sourced-specifications` scans 1,542 files
in the upload against 1,756 locally. Before the fix it scanned 1,756 in both.

**And the defect that nearly followed from it.** On the build host,
`no-plaintext-credential` and `sourced-specifications` printed "N reviewed
entry(ies) no longer match anything - delete the line" naming four docs/ paths.
I came within one edit of deleting four LIVE security exemptions, because the
message is an artefact of the stripped tree. Both guards now ask the shared
stripped-or-deleted determination, so a stripped file reads NOT JUDGED and a
genuinely deleted one still reads stale. The count of scripts sharing that
determination rose 1 to 3, derived, and it prints itself.

### The regression sweep (DESIGN-LOCK)

Nothing under `src/`, `public/`, `next.config.ts` or `package.json` was touched:
zero lines. No hero, spacing, colour, layout, copy or chrome change. The only
behaviour change visible to a person is guard output in a build log.

### The founder-cost test

Two items go back to the founder and both are genuinely his: approval to write to
the production database, and approval to move real money. Neither can be scripted
away. The third outstanding item, the two over-readable keys, is already offered
as one command per Law 10. Nothing in this report asks him a question I could
have answered by reading code.

### The evidence-visibility test

F2 has no visual deliverable, so there is no capture to take. The evidence is
readable by him without my narration: two Vercel build logs in his own dashboard
(`dpl_BpQM8P9EtvFx2BMa5aRwSF9VtbL8`, `dpl_7w64ZFqq8vKBHnGoa2PBVPzNyBwv`), PR #145's
check list on GitHub, and the three ledger files on `ops/session-log`.

### The AI-tell sweep

2,289 added lines. Em-dashes: 0. En-dashes: 0. Banned community word: 0. Tell
lexicon (unforgettable, elevate, unlock, vibrant, nestled, seamless, robust,
leverage, delve, tapestry, and the rest): 0. Exclamation marks in user-facing
copy: not applicable, no user-facing copy changed.

### Gate: one more finding, named not fixed

**Neither drill harness is wired into the pre-push gate or into CI.** Both are
hand-run. That is how case 5 of the strip drill went stale for several hours
under three green gates without anything noticing. Wiring them in would add about
twenty-five minutes to every push, which is a change to the gate's shape and
therefore the founder's decision, not mine to make unilaterally. Named here and
in BUILD-LOG.md.
