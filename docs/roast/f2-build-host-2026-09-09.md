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
