# ROAST: session 64, UX3.2, the second channel's success path. 11 September 2026.

Adjudicated against the session brief verbatim, against the COMPLETION LAW in
`C:\dev\BUILD-BRIEF.md`, and against close-out UX3.2. Evidence is observed output,
a file path, or a test name. Inference is not evidence.

## PHASE 1 AND 2: THE REQUIREMENT LEDGER, ADJUDICATED

### From the session brief

| # | Requirement (verbatim intent) | Verdict | Evidence |
|---|---|---|---|
| 1 | Read `C:\dev\CLOSE-OUT.md` and `C:\dev\BUILD-BRIEF.md` | **MET** | Both read this session; CLOSE-OUT read in full (2009 lines across four reads), BUILD-BRIEF head plus the COMPLETION LAW |
| 2 | CLOSE-OUT.md is authoritative | **MET** | The item worked (UX3.2) is a CLOSE-OUT clause, not an invention. Its text is quoted in the ledger entry |
| 3 | COMPLETION LAW: one item at a time | **MET** | One item start to finish. No second item begun |
| 4 | ... finished with SCHEMA | **MET, NOT REQUIRED** | No table and no column. The tables and triggers are session 58's, unchanged. Stated rather than skipped |
| 5 | ... CODE | **MET** | `src/components/notifications/use-push-subscription.ts`, `src/app/admin/(authed)/notifications/backup-alerts.tsx`, `src/components/notifications/enable-alerts.tsx`, `scripts/ops/pre-push-gate.mjs` |
| 6 | ... TESTS, suite grows, canary raised in the same commit | **MET** | `tests/component/push-subscription.test.tsx`, 6 tests. 375/4516 to 376/4522. Canary raised in commit `66189fc6` with the reason written on it |
| 7 | ... GUARD, registered and blocking | **MET** | `scripts/guards/push-arming-cannot-fail-silently.mjs`, registered in `run-guards.mjs`. Gate step `guards` PASS, 108 of 108 |
| 8 | ... guard PROVEN to fail as well as pass, both outputs shown | **MET** | `scripts/verify/ux3-push-guard-drills.mjs`: 11 drills, 9 RED, 2 NEGATIVE stayed green, every restore GREEN. Output in `C:\dev\EVIDENCE\UX3\ux3-push-guard-drill.txt` and quoted in BUILD-LOG |
| 9 | ... DRIVEN at 390, 768 and 1440, screenshots under `C:\dev\EVIDENCE\<item>\` | **MET** | 66 of 66 checks. `C:\dev\EVIDENCE\UX3\push-escalation\`: `01-before-arming-*.png`, `02-armed-*.png`, `03-escalated-in-the-feed-*.png`, three `axe-*.json`, three `notifications-shown-*.json`, `ux3-push-escalation-report.json` |
| 10 | ... FULL REGRESSION green after the item | **MET, with one step red by design** | 14 of 15 steps PASS including lighthouse (13 URLs, 65 runs, 1670s) and the suite. `production-parity` FAILS: 9 migrations pending on production, which is the founder's command. Table in BUILD-LOG |
| 11 | ... committed, Australian English, no trailers, pushed | **PARTIAL** | Committed `66189fc6`, Australian English, no AI trailer (the `commit-msg` hook would refuse one and `no-ai-authorship` is registered). **NOT PUSHED**: `production-parity` refuses. See row 24 |
| 12 | Fix every defect you find before starting the next task | **MET** | Two defects found and both fixed at the cause in this item: the activation race and the silent refusal. A third suspected defect was investigated and disproved rather than left hanging (see Phase 3) |
| 13 | Never claim something works without driving it | **MET** | Every claim in the report rests on driven output. The push delivery is asserted off `registration.getNotifications()`, which is what the browser DISPLAYED, not what the server believed it sent |
| 14 | Never guess a slug, route or id; enumerate from source or the database | **MET** | The organisation id, the notification id, the admin path and the push tag are all read back from the database. The notification is matched by `platform-<row id>`, never by position. The two consuming surfaces were enumerated by scanning `src/`, not listed from memory |
| 15 | DISK: plenty free; do NOT delete `.next`, `.turbo` or the npm cache | **MET** | 22 GB free at start and end. `.next` never deleted: builds ran through `npm run gate:push -- --only build`, never `scripts/dev/rebuild-and-serve.sh`, which does `rm -rf .next`. No `npm cache clean` |
| 16 | Delete Playwright traces and videos once read; keep final small evidence | **MET** | No traces or videos were recorded. The three stale `02-arm-refused-*.png` captures from the failing run were deleted once read; the passing set is kept. Two throwaway Chrome profiles removed by the drive's own `finally` |
| 17 | If free disk falls under 10 GB, stop and report | **NOT TRIGGERED** | 22 GB throughout |
| 18 | Supabase CLI rests linked to TEST | **MET** | Not re-linked this session. Every database write went through `.env.local`'s TEST service key, and the drive REFUSES if the URL carries `gndnldyfudbytbboxesk` (`ux3-push-escalation-proof.mjs`, and again in the drive wrapper) |
| 19 | Never write to production without explicit approval | **MET** | No production write. The only production contact was the read-only parity check and the read-only Stripe key probe |
| 20 | Africa is deferred | **MET** | Untouched |
| 21 | After each item update BUILD-LOG, BUILD-LEDGER, REVIEW-QUEUE and push them to `ops/session-log` | **PARTIAL at the time of writing** | All three written. The push to `ops/session-log` is the last action of the session and is recorded in the report |
| 22 | FIRST ACTION: check for unpushed commits and push them through the normal gate | **MET** | Done first, before any new work. 23 commits found (`93ca123c`..`9e2577f7`), read from git not from a note. The gate BLOCKED at `production-parity`: 9 migrations pending. Output quoted in BUILD-LOG. Nothing bypassed |
| 23 | HOUSEKEEPING: when an item is fully MET, move its body to CLOSE-OUT-DONE.md leaving one line | **NOT TRIGGERED, and stated rather than assumed** | No CLOSE-OUT ITEM closed this session. UX3.2 is one CLAUSE of UX3; UX3 still carries three Stripe rows NOT EXERCISED and one MET-but-not-driven row, so UX3 is not fully MET and its body must not move. Checked explicitly because session 63's roast caught this rule being excused |
| 24 | PRIORITY ORDER, ABSOLUTE: (1) UX6 (2) D1 (3) D2 (4) UX5 (5) remaining UX1-UX4 (6) L items | **MET** | Priorities 1 to 4 re-checked against the ledger AND their blocks re-tested rather than inherited (see Phase 3). Each is built, driven and green with one founder leg. Work went to priority 5, the remaining UX3 clause. Priority 6 not started |
| 25 | C1-C10 and the F items are historical; do not restart | **MET** | Untouched |
| 26 | Write DONE to `C:\dev\BUILD-COMPLETE.txt` only when every launch-blocking item is MET | **CORRECTLY NOT DONE** | `docs/verification/LAUNCH-READINESS.md` reads NOT LAUNCH READY: 4 of 17 rows PASS, 13 OWNER BLOCKED. The sentinel was not written and must not be |

### From close-out UX3.2 itself

| # | Clause | Verdict | Evidence |
|---|---|---|---|
| 27 | "Every notification is recorded as sent or failed" | **MET (session 58), re-observed here** | `attempts`, `last_attempt_at`, `last_error` read back after every tick |
| 28 | "a failure is retried" | **MET, driven** | tick 1 -> attempts 1 pending; tick 2 -> attempts 2 pending, each carrying `email attempt N: RESEND_API_KEY is not configured` |
| 29 | "a persistent failure raises through the second channel" | **MET, driven, and this is the row that was PARTIAL** | tick 3 -> `delivery_state: escalated`, `channel: push`, `last_error: email failed 3 time(s)`, `sent_at` set; and the device DISPLAYED it |
| 30 | "The notification path may not be able to fail silently" | **MET, and it was NOT met before this session** | The control that arms the second channel failed silently on every first press. Fixed at the cause and held by a registered guard |

## PHASE 3: THE ADVERSARIAL PASS

**Silent drops.** Compared the ledger against the report draft. Rows 15, 16, 18,
19, 20, 23 and 26 were absent from the first draft of the report, exactly as
session 63 predicted: the rules that did not fire are the ones that vanish. They
are adjudicated above and the three that matter (disk, housekeeping, the sentinel)
are stated in the report.

**Interpretation drift, one found and it is worth stating.** The brief's priority
order is absolute, and S1 in CLOSE-OUT.md is substantially buildable while every
remaining UX clause looked blocked. I was drawn to S1 because it is a larger, more
interesting item. I did not start it: priority 5 comes before it, and the correct
move was to test whether priority 5 was genuinely exhausted rather than to accept
that it was. It was not exhausted. That test is the whole value of the session.

**The block-inheritance failure, named because it is the class this session
exists to correct.** I spent the first part of the session treating three recorded
blocks as facts. Two are real and one never was. A recorded block is a CLAIM with a
date on it, exactly like a version pin under Law 9, and nothing in the tree changes
on the day it stops being true. Re-tested: Stripe `401 api_key_expired` on both
keys against `/v1/balance` (real), Google Maps referrer (real, re-verified by
session 63 the same way), VAPID (never a block).

**A suspected defect investigated and DISPROVED rather than reported.** Two service
workers exist in this tree and I believed both took scope `/`, which would mean the
scanner silently kills push platform-wide. Measured in Chrome: at the DEFAULT scope
it is exactly that bad (201 accepted, 0 displayed), but the product passes
`{ scope: DOOR_SERVICE_WORKER_SCOPE }` and both registrations coexist. Reporting
that as a defect would have sent the founder after a fault that does not exist. It
is recorded as a near miss and is now guard clause 4.

**The unverifiable claim hunt.** Every quality claim in the report and what would
falsify it:

  - "a real device received it" - falsified by `getNotifications()` returning
    nothing, or returning a notification with a different tag. Tested: the match is
    BY TAG (`platform-<row id>`), and the first run genuinely failed this way
  - "the email failure is real, not stubbed" - falsified by the row's `last_error`
    naming a stub. Tested: it reads `RESEND_API_KEY is not configured`
  - "the guard fails as well as passes" - falsified by a drill returning exit 0
    where 1 was expected. Tested 11 times; 2 of the first drills of a similar guard
    in session 62 came back DID NOT FAIL, so this is not a formality
  - "every first arming failed" - falsified by a fresh profile arming successfully
    on the first press before the fix. Tested: it did not, and the browser named
    the reason
  - "axe zero" - falsified by a violation at any impact level. Tested at every
    impact level, not the serious/critical floor

**The generic test.** Could this belong to another product? The FIX could; the
mechanism is a Web Push race any site could have. What makes it EventLinqs is what
it protects: the owner's only out-of-band channel for "a real organiser published a
paid event", which is the defect UX3 exists for, and the attendee alert opt-in the
locked growth doctrine names as the demand engine's primary channel at about 5x
email conversion.

**The AI-tell sweep.** Counted across the commit message, the ledger entry, the log
entry, the review-queue entry, the guard, the drive and the tests:

    em-dashes 0, en-dashes 0, exclamation marks in user-facing copy 0,
    the banned community word 0, tell lexicon 0.

The copy gate (`npm run gate:push -- --only copy`) PASSES, and it judges the shipped
surfaces. Two user-facing strings were ADDED (the refusal notes on both surfaces)
and both were swept by hand as well: no dash of any kind, no exclamation mark, plain
Australian English, and each names what to do next.

**The regression sweep, DESIGN-LOCK.** Elements changed that the brief did not ask
for: the note paragraph on each of the two alert controls gains a colour change and
a `role="alert"` in the error state only. Nothing else. No hero, no spacing, no
token, no colour outside the existing ramp (`text-amber-300` was already the
unarmed-state colour on that panel; `text-ink-900` is the existing body ink). No
layout moved: the no-overflow assertion passes at all three widths and axe is zero.

**The founder-cost test.** Does this send the founder to a dashboard for something
scriptable? The VAPID keypair was the candidate, and it was SCRIPTED rather than
assigned: generated here in one command and written into `.env.local`, and the
drive refuses with the exact command if it is ever missing. The two remaining
founder steps are `npm run migrate:production` (RESERVED by his own ruling of
26 August) and `stripe login` (IMPOSSIBLE for an agent: an interactive browser
auth). Both named with their verdicts, per Law 10.

**The evidence-visibility test.** The deliverable is visual and there are captures:
nine screenshots at three widths, three axe reports, three JSON records of what the
browser actually displayed, one JSON report of all 66 checks, and the guard drill
transcript. The founder can see the armed control, the escalated row in the feed,
and the exact notification payload without reading any prose of mine.

## PHASE 4: THE GATE

    Requirements: 30.
    MET: 26.  PARTIAL: 2 (rows 11 and 21, both the same push block).
    NOT MET: 0.  NOT TRIGGERED: 2 (rows 17 and 23, both stated rather than skipped).
    Adversarial findings unresolved: 0.

The two PARTIALs are one cause and it is not mine: `production-parity` refuses the
push because production is 9 migrations behind this tree. Row 21's half that I CAN
do (pushing the three record files to `ops/session-log`) is a separate branch with
no parity gate and is done.

## PHASE 5: DECISION EVIDENCE

One decision was made that needs it: **adding a `mail` option to
`startGateServer`** rather than writing a fourth server spawn.

| Dimension | Answer |
|---|---|
| Our code | `scripts/ops/pre-push-gate.mjs:526` is the ONE place `next start` is spawned, and `scripts/guards/gate-servers-carry-a-limiter.mjs` fails the build on a second one. A private spawn was therefore not available and should not have been |
| The question it answers | Every journey step needs `EMAIL_TRANSPORT=console` to read a confirmation link out of the log. This drive needs the opposite: its whole subject is what happens when email FAILS, and a transport that always succeeds can never show it |
| Test plan | The guard re-run after the change: PASS, 1 spawn, inside `startGateServer()`, both Upstash variables, proven stub, `checkout-reserve` still failClosed. And the drive itself: the row's `last_error` proves the real transport ran |
| Risk | The default is unchanged (`'console'`), so every existing step behaves exactly as before. Verified by the full gate going green |

No competitor, market or trend dimension applies: this is an internal harness
decision, and saying so is better than inventing a citation for it.
