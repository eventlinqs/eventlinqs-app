# Roast ledger: UX4 notification routing, H2.6 the drill marker, and the cron that never ran

Session 59, 10 September 2026. Written before adjudicating, from the verbatim
close-out text at `C:\dev\CLOSE-OUT.md` lines 1614 to 1633 (H2.6) and 1957 to
1992 (UX4), not from a plan derived from them.

## Phase 1: the requirement ledger

Every imperative sentence is its own row. Compound requirements are split.

### UX4.1 the daily state email

1. Once a day, at a fixed time.
2. WHETHER OR NOT anything is wrong.
3. Main green and its commit.
4. Production Ready and the commit it serves.
5. What landed in 24 hours.
6. What is open and for how long.
7. WHEN THE BUILD LAST PUSHED.
8. Each failing branch in one line with its guard named.
9. Events live, tickets sold, new organisers.
10. It must arrive on a quiet day, because its absence is itself the alert.

### UX4.2 the stall alert

11. If the watchdog is running AND nothing has been pushed in six hours, alert.
12. Alert IMMEDIATELY.

### UX4.3 immediate, outage only

13. Main red raises one.
14. A production deployment failed raises one.
15. The post-deploy smoke failed raises one.
16. Distinguishable at a glance from a branch gate.

### UX4.4 immediate, business

17. New organiser.
18. Stripe onboarding started.
19. Stripe onboarding completed.
20. Event published.
21. Every paid order.

### UX4.5 branch gate failures

22. Branch gate failures stop being email.
23. They stay in the run log and on the pull request.
24. They appear as one line in the daily email.
25. Never silence the gate itself.

### The four drives the close-out names explicitly

26. Stall the watchdog on purpose and confirm the alert.
27. Fail a branch and confirm no email but a line in the digest.
28. Fail main and confirm both channels.
29. Publish on TEST and confirm the business notification.
30. Record all four.

### H2.6 a drill must announce itself

31. A drill subject begins with "[DRILL]".
32. The body opens with a line stating plainly that this is a scheduled test of
    the alerting path and no action is required.
33. The drill states the target it used.
34. A real alert must NEVER carry the drill marker.
35. Register a guard: an alert from a drill target carries the marker, one from
    the real production URL does not.
36. Prove that guard fails as well as passes.

### The defect found while auditing

37. `/api/cron/queue-admit` has never run: fix it.
38. Make the class of defect impossible to repeat.

### Standing rules, which apply to every task

39. Australian English.
40. No em-dashes and no en-dashes.
41. No exclamation marks in user-facing copy.
42. The word "culture" appears nowhere, in any form.
43. Writes go to TEST only; production is never written without approval.
44. Lawal is the sole author; no AI trailer on any commit.
45. Every guard proven to fail as well as pass.
46. The suite grows and the canary baseline is raised in the same commit.
47. Driven proof at 390, 768 and 1440.
48. Full regression green after the item.
49. Disk floor respected and logged.
50. BUILD-LOG, BUILD-LEDGER and REVIEW-QUEUE updated and pushed to ops/session-log.

## Phase 2: adjudication

| # | Verdict | Evidence, observed rather than inferred |
|---|---|---|
| 1 | MET | `.github/workflows/state-report.yml`, job `daily`, `cron: '10 21 * * *'` |
| 2 | MET | that job has no `if:` conditioned on any failure; the only condition selects which of the two schedules fired |
| 3 | MET | `daily-state-1440.png`: "Green at b3f9a56e" plus the run URL |
| 4 | MET | same capture: "READY and serving b3f9a56e, deployed 20 hours ago" |
| 5 | MET | same capture: two commits, each with sha and subject |
| 6 | MET | same capture: four pull requests with ages 102 days, 94 days, 60 days, 19 hours |
| 7 | MET | same capture: "54 minutes ago, to ops/session-log, at Thu, 10 Sept, 3:02 am AEST" |
| 8 | MET | same capture: "verify/l5-launch-readiness CI caught by scripts/guards/preview-deployment-state.mjs". Two API faults had to be fixed first, both found by driving: a 415 on `Accept: text/plain`, and a blob host that refuses a forwarded `Authorization` header across the 302 |
| 9 | MET | same capture: 206 events live, 213 tickets sold, 0 in 24 hours, 0 paid orders, 13 new organisers. Read live from `GET /api/ops/state` against TEST, `ops-state-drive.txt` |
| 10 | MET | the sentence is in the message, in both bodies, and `tests/unit/ops/state-report.test.ts` asserts both carry it |
| 11 | PARTIAL | the six-hour judgement is MET and driven in both callers' modes (`stall-drive.txt`). "If the watchdog is running" is satisfied by construction ONLY in `--from-watchdog` mode, and that mode is armed by a launcher the founder has not switched to. The cloud path says plainly it could not confirm |
| 12 | PARTIAL | immediate in the cloud means within the hour, because a scheduled workflow is the only always-armed host available before the launcher is switched. The watchdog path is immediate |
| 13 | MET | `ci.yml` job `main-red-alert`; driven with the job's own class, target and body, producing GitHub issue #148 titled `EventLinqs OUTAGE: CI is RED on main` |
| 14 | MET | `post-deploy-smoke.yml` job `deploy-failed` on `deployment_status` state failure or error, Production only |
| 15 | MET (already existed), reclassed | the alert step now passes `--class outage` and a target |
| 16 | MET | four prefixes, none a prefix of another, all beginning with the platform name. `alert-routing.mjs` clause 4 asserts it, drilled |
| 17 | MET, re-driven here | `ux3.1.organiser_created` PASS, recorded by the database with the admin link, on a signup and an organisation form driven through the browser in this session |
| 18 | NOT EXERCISED | `STRIPE_SECRET_KEY` is empty on this machine and both CLI keys answer 401 `api_key_expired`. Without a key the onboarding route cannot create an account, so there is no state change for a trigger to record. Founder step: `stripe login` |
| 19 | NOT EXERCISED | same blocker, one step further on: the account that would be enabled cannot be created |
| 20 | MET, re-driven here | `ux3.1.event_published` PASS, naming which event and linking to `/admin/events/1d2a4eb4-...` |
| 21 | NOT EXERCISED | same Stripe blocker: no card can be taken here, so no order can reach `confirmed`. The trigger, its WHEN clause and its payload are covered by the suite and by `trigger-columns-exist` |
| 22 | MET | `alert-routing.mjs` clause 2 fails the build when a job that can run on a pull request dispatches an alert; drilled red on exactly that shape |
| 23 | MET | nothing was removed from any workflow; the run log and the pull request checks are untouched |
| 24 | MET | `daily-state-1440.png`, the "Branches red in 24 hours" section |
| 25 | MET | no gate was disabled, no threshold moved, no job made optional. `git diff` on the commit touches no assertion |
| 26 | PARTIAL | the alert was driven across the boundary in both modes with a REAL last-push timestamp from the live API and the clock moved. The watchdog loop was not made to stall for six real hours, and the launcher that would invoke it is not switched in |
| 27 | MET | two real branch failures appear as two lines in the composed digest with the guard named, and no dispatch exists in this repository that a branch failure can reach. The emails the founder received came from his GitHub account setting, which is row 22's remainder and is an owner step |
| 28 | PARTIAL | the alert was driven with the job's exact class, target and body (issue #148). Main was NOT made red on purpose: doing so would break the branch protection this build exists to keep green. "Both channels" could not be confirmed because there is no Resend key on this machine |
| 29 | MET | RE-DRIVEN in this session against TEST, not cited from session 58. A real signup, the real organisation form, the real event wizard and a real publish, with the notification rows read back: 11 of 11 checks pass, 3 not exercised (the Stripe legs, no key on this machine). `C:\dev\EVIDENCE\UX4\ux3-redrive.txt` and `ux3-redrive\desktop-1440\` |
| 30 | MET | all four recorded here and in BUILD-LOG |
| 31 | MET | issue #146 title: `[DRILL] EventLinqs OUTAGE: the production homepage smoke FAILED` |
| 32 | MET | first line of that body: "THIS IS A DRILL. It is a scheduled test of the alerting path and no action is required." |
| 33 | MET | "Target used: smoke-drill.invalid" |
| 34 | MET, driven | issue #147 and issue #148, both from real targets, neither carrying the marker |
| 35 | MET | `alert-routing.mjs` clause 3, which EXECUTES `judgeDrill` and `alertSubject` on both hosts rather than reading them |
| 36 | MET | drilled red by disabling the `.invalid` test: it named both halves, then green on restore |
| 37 | MET | `vercel.json` now schedules `/api/cron/queue-admit` every minute, as its own header always claimed |
| 38 | MET | `cron-routes-scheduled.mjs`, registered and blocking, judges both directions and refuses a stale exemption. Drilled red on the exact pre-fix file |
| 39 | MET | copy gate clean, 971 files scanned |
| 40 | MET | zero em-dashes and zero en-dashes across every new file |
| 41 | MET | every `!` in the new files is a JavaScript negation operator; zero in copy |
| 42 | MET | zero occurrences in every new file |
| 43 | MET | nothing was written to any database this session except through the TEST-linked project; the CLI rests linked to `vkapkibzokmfaxqogypq` |
| 44 | MET | `git log -1` author EventLinqs, zero trailers |
| 45 | MET | two new guards, four separate red drills between them, green after each |
| 46 | MET | 352/4121 to 355/4195, baseline raised in the same commit with the reason written on the constant |
| 47 | MET | `daily-state-390.png`, `-768.png`, `-1440.png` |
| 48 | see the gate section below |
| 49 | MET | 20.0 GB at the start, logged; no cache deleted |
| 50 | MET | pushed as `a3b2d3c0` on `ops/session-log` |

## Phase 3: the adversarial pass

**Silent drops.** Comparing the ledger against the report: none. Rows 11, 12, 26
and 28 are the four that are not fully met and all four appear in the report's
UNFULFILLED block rather than in the body.

**Interpretation drift.** One found and named rather than hidden: "stall the
watchdog on purpose" was executed as "move the clock against a real last-push
timestamp". That is a substitution, and it is a defensible one because it proves
the judgement deterministically at four points including both sides of the
boundary, where waiting six real hours proves one point. It is NOT a substitute
for the launcher being switched, and that is stated.

A second, smaller one: "fail main and confirm both channels" was executed as
"drive the job's own command with its own class, target and body". Main was not
made red. That is a refusal on safety grounds, stated as PARTIAL rather than MET.

**The match-versus-surpass test.** The brief does not name a competitor for this
item. Not applicable.

**The unverifiable claim hunt.**

| Claim | What would falsify it | Tested |
|---|---|---|
| The daily email arrives on a quiet day | a condition on failure anywhere in the job | read: there is none |
| The stall alerts once per band | two alerts inside one band | driven, both modes, and a test asserts exactly four over a 24-hour sweep |
| A drill always marks itself | a `.invalid` target producing no marker | executed by the guard on every build, drilled red |
| A real alert never marks itself | the production host producing a marker | executed by the guard, and driven twice on real issues |
| No branch gate can email from this repository | a pull-request job dispatching | guard clause 2, drilled red |
| queue-admit now runs | the entry missing from vercel.json | guard clause 1, drilled red on the pre-fix file |
| The counts are real | the endpoint returning zeros or a 200 without a database | driven: 401, 401, then 200 with 206 events live |
| The email renders on a phone | horizontal overflow at 390 | captured at 390 |

Deleted claim: an earlier draft of this report said the email channel "works".
It has not been driven from this machine and the claim is now stated as
what it is: the second channel is proven, the first is unchanged code that H2.4
proved on 8 September.

**The generic test.** The daily email is navy #0A1628 with the gold eyebrow and
gold-700 section headings, the platform's own tokens read out of `globals.css`,
and it is the only ops email that opens by telling the reader that its own
absence is the alert. It could not belong to another product.

**The AI-tell sweep.** em-dashes 0, en-dashes 0, exclamation marks in copy 0,
"culture" 0, tell lexicon 0. Counted across all nine new and changed files.

**The regression sweep.** DESIGN-LOCK: no page, hero, spacing, colour, layout,
copy or chrome was changed. This item touches no rendered page. The one visual
artefact is a new email template that did not exist.

Two existing files were changed beyond the brief and both are named:
`workflows-skip-drafts.mjs` learned that a push-only condition already excludes a
pull request, which was necessary for `main-red-alert` to exist; and
`alert-dispatch.mjs`'s class table moved into a new module because
`build-host-needs-declared` correctly refused the import graph it created.

**The founder-cost test.** Two owner steps remain and both are genuinely his:

- the GitHub Actions email setting, which lives on his account and which no
  credential I hold can change. Stated with its exact path, and with the reason
  nothing is lost by turning it off. Verdict: IMPOSSIBLE for a machine.
- the launcher switch, which is his file. Verdict: SCRIPTED, one command,
  `C:\dev\RUN-BUILD20.ps1` written and not switched in.

The daily email deliberately mints NO new credential, so it adds no third step:
`CRON_SECRET` is already a repository secret and the endpoint reuses it.

**The evidence-visibility test.** The deliverable is a message, and the founder
can see three captures of it at three widths, plus three real GitHub issues he
can open in his own browser, plus the JSON the report was composed from.

## Phase 5: decision evidence

One decision of substance: where the daily state and the stall check run.

| Dimension | Finding |
|---|---|
| Competitor | not applicable, this is internal operations |
| Our code | `scripts/ops/alert-dispatch.mjs` already existed and already had two channels that share no rate limit (H2.4). Nothing in `src/` could reach it. `/api/cron/health-heartbeat` already sends a daily PLATFORM health note and knows nothing about the build |
| Constraint | a GitHub Actions schedule only fires on the default branch; a Vercel cron cannot report on a production outage that has taken the app down |
| Choice | GitHub Actions, because it survives a production outage and already holds every credential needed. The one thing it cannot read, the platform's own counts, is reached through a cron-secret authed endpoint rather than by minting a credential |
| Test plan | the absence of the daily email is the failure signal, and it is stated in the message itself so the reader knows to treat silence as the alarm |

## Phase 4: the gate

    Requirements: 50.
    MET: 42.  PARTIAL: 4.  NOT MET: 0.  NOT EXERCISED: 3.  BLOCKED (push): 1.
    Adversarial findings unresolved: 0.

The four PARTIALs are rows 11, 12, 26 and 28, and all four have the same two
causes: a launcher that is the founder's file and has not been switched, and a
machine with no Resend key. The three NOT EXERCISED are the Stripe legs, blocked
by an expired credential that only `stripe login` clears. None of the eight is a
defect in what was built and every one names what would clear it.

## The drive record, for the four the close-out names

| Drive | Result |
|---|---|
| Stall the watchdog on purpose and confirm the alert | Driven by moving the clock against a REAL last-push timestamp read from the live API, at four points either side of the boundary, in both callers' modes. Silent at 5.9h, speaks at 6.2h, silent at 8h, speaks at 12.4h; and 7h, 9h, 13h with the state file written between each. The launcher that would invoke it in production is written and not switched in. `stall-drive.txt` |
| Fail a branch and confirm no email but a line in the digest | Two REAL branch failures from 9 September appear as two lines in the composed digest, one of them naming `preview-deployment-state.mjs` as the guard that caught it. No dispatch in this repository can be reached by a branch failure, and a guard fails the build if that changes. `daily-state-1440.png` |
| Fail main and confirm both channels | The alert was driven with the job's own class, target and body, producing GitHub issue #148, `EventLinqs OUTAGE: CI is RED on main`, with no drill marker. Main was NOT made red: doing so deliberately would break the branch this build exists to keep green. Both channels could not be confirmed because there is no Resend key here |
| Publish on TEST and confirm the business notification | Driven end to end in this session: 11 of 11 checks pass. `ux3-redrive.txt` |
