# Roast ledger: nationwide from day one, 2026-08-23

Built from the literal brief plus the two mid-task founder directives. Written
before adjudicating.

## Phase 1: the requirement ledger

### Task 0, establish where things stand

1. Report git status.
2. Report HEAD.
3. Report whether anything is uncommitted or half-written from the interrupted session.
4. Report whether the branch is pushed.
5. Report PR #120's check status, queried directly.
6. If anything is half-applied, finish it before starting new work.
7. Baseline: npm test with file, test, fail and skip counts.
8. Baseline: full guard runner with a verdict per guard.
9. Baseline: npm run build against TEST, unpiped, with the raw $LASTEXITCODE.

### Task 1, nationwide from day one

10. REMOVE any CITY or LAUNCH waitlist gating an organiser until their city opens.
11. REMOVE all copy implying a city is unavailable.
12. KEEP AND DO NOT TOUCH the EVENT waitlist (sold-out tier queue, refund promotes).
13. If the event waitlist is touched at all, prove afterwards that a refund still promotes from the queue.
14. 1a. Establish what exists. Report only, change nothing.
15. 1a. Search for any city/region/launch gate: open-city list, feature flag, signup restriction, "coming soon" copy, national waitlist table separate from event waitlists.
16. 1a. Say plainly whether it exists in code and name every file if it does.
17. 1b. Check homepage, organiser landing, signup, pricing, launch composer, help content, AI knowledge base for Geelong/Melbourne-first, city rollout, queue, or location-limited availability.
18. 1b. Report every hit with a verdict.
19. 1b. Then fix them.
20. 1c. Drive it on TEST end to end: Perth organiser signs up, creates an event, publishes it, appears on the correct city and suburb pages.
21. 1c. Report what I actually saw.
22. 1d. Keep the founding organiser offer: keep the cap and the referral mechanic.
23. 1d. Remove only wording tying a spot to a particular city.

### Task 2, Lighthouse

24. Three deterministic failures on /events/seat-proof-fifty-nwltxi: accessibility 0.97 vs 1.00, CLS 0.186 vs 0.1, script 534,565 bytes vs 491,520.
25. Do not raise a threshold to pass.
26. If the previous session finished these, say so and move on. If not, finish them.

### Ship

27. Verify and ship as standard.
28. Push integration/launch with an explicit refspec.
29. Confirm PR #120's checks with the merge button state stated plainly.

### Mid-task founder directives

30. Repurpose /waitlist to national local alerts (option 1 chosen).
31. DO NOT PROMISE A WEEKLY EMAIL. No frequency stated. Use "we'll email you when there's something on near you".
32. Keep the nationwide hero, the organiser band with "you can sell today, anywhere in Australia".
33. Remove every "your city is on the way", "city by city", "Geelong and Melbourne open first".
34. Keep the /waitlist URL working.
35. Check that the page's email capture writes to the same place as the "weekly local digest" checkbox on checkout. If separate, unify them and say so.
36. Report what existed, what was changed, and the proof that a Perth organiser can sell.

### Standing rules

37. Australian English; no em-dashes, no en-dashes.
38. No merging to main.
39. No writes to Production Supabase; TEST only; production probes read-only.
40. Do not run the demo purge.
41. Do not apply any migration.
42. No trailers, no tool credit line, no AI named as author.
43. Reproduce before fixing; root causes, not display patches.
44. A test measuring an ABSENCE needs a negative control proving it can fail.
45. Every guard prints what it scanned.
46. Never quote evidence captured before the edit.
47. Banned git operations (reset, checkout --, stash, clean, rebase, amend, force-push, merge --abort).
48. The word "culture" is banned in new work (CLAUDE.md copy law).

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | `git status --porcelain`: 11 untracked `tmp-*` probe files, no modified tracked files. |
| 2 | MET | HEAD `7bb59def`, identical to `origin/integration/launch` (`git rev-list --left-right --count` returned `0 0`). |
| 3 | MET | Nothing half-written: zero modified tracked files. The `tmp-*.mjs` files are diagnostic Playwright probes, consistent with the Lighthouse work; no source edit was left partial. |
| 4 | MET | Pushed and in sync: local HEAD and `origin/integration/launch` both `7bb59defa19331c466d113f47b1e164b26221a69`. |
| 5 | MET | `gh pr checks 120` and `gh pr view 120 --json statusCheckRollup`: all SUCCESS/SKIPPED, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`. |
| 6 | MET | Nothing was half-applied, so nothing to finish. Stated rather than assumed. |
| 7 | MET | 217 files / 2630 tests / 0 failed / 0 skipped, exit 0. First run was corrupted by my own concurrent grep (worker start timeouts); re-run clean. Both reported. |
| 8 | MET | `npm run guards` exit 0, `[guards] all 41 guards PASS`, each line naming what it scanned. |
| 9 | MET | `RAW_BUILD_EXIT=0`, unpiped, after clearing `.next`, with `.env.test` loaded (project `vkapkibzokmfaxqogypq`). First attempt exited 1 on a missing env; the guard named the fix. |
| 10 | MET | The only gate that blocked anyone was the founding-invite city restriction, removed in `src/lib/founding/invites.ts` (FOUNDING_CITIES deleted), `dashboard/invites/actions.ts:27`, `admin/(authed)/network/actions.ts:35`, `admin/(authed)/network/page.tsx:52`, and migration `20260823000001`. Signing up and selling were never gated: `src/lib/events/publish-gate.ts` refuses only on `cover_image_required`, `organisation_not_found`, `organisation_payouts_restricted`, `paid_event_charges_disabled`. |
| 11 | MET | Fixed in `waitlist/page.tsx`, `waitlist-client.tsx`, `confirmation-email.ts`, `city-waitlist.ts`, `events/browse/[city]/page.tsx`, `invitation-card.tsx`, `unsubscribe/digest/[token]/page.tsx`, `waitlist/unsubscribe/[token]/page.tsx`, `press/page.tsx`, `founding-offer.ts`, `founding-waiver.ts`, `legal/organiser-terms/page.tsx`, `dashboard/invites/page.tsx`. |
| 12 | MET | `git diff --name-only 7bb59def..8955ed8b` over `src/lib/waitlist/promote.ts`, `src/app/actions/waitlist.ts`, `src/components/waitlist/`, `dashboard/my-waitlists/`, `event-sold-out.tsx`, `cron/waitlist-expire/`, `cron/squad-expire/`, `webhooks/stripe/route.ts` returned EMPTY. |
| 13 | N/A, and stated | Not touched, so the conditional proof is not triggered. The refund promote wiring is intact at `webhooks/stripe/route.ts:1449` and `:1519`, and `tests/unit/webhook-handlers/payment-intent-succeeded.test.ts` and `payment-succeeded-duplicate-delivery.test.ts` (both in the 2660 passing) assert `promoteWaitlist`. |
| 14 | MET | 1a was report-only; the first edit came after the inventory was complete. |
| 15 | MET | Found: `/waitlist` page + `city_waitlist_signups` table (migration `20260709000001`), `src/lib/waitlist/city-waitlist.ts` (9-city list, OPENING_FIRST), `src/lib/founding/invites.ts` FOUNDING_CITIES, the `founding_invites.city_slug` CHECK constraint, `FOUNDING_OFFER`. No feature flag gated a city; the `launch_kit` flag gates the kit, not a city. |
| 16 | MET | Stated plainly in-session: no gate on signup or selling; the gate was in the founding programme. Every file named. |
| 17 | MET | Swept `src/**/*.{ts,tsx,md,mdx,json}` plus `src/lib/ai/knowledge-base.ts` (clean), `src/lib/help-content.ts` (only the HQ address), `src/lib/guidance/`. |
| 18 | MET | Every hit reported with a keep/fix verdict, including the legitimate ones kept (HQ address in footer, emails, legal, press bio; `about/page.tsx` "Started in Geelong. Built for everywhere." already national). |
| 19 | MET | Fixed, see row 11. |
| 20 | MET | `scripts/verify/nationwide-perth-e2e.mjs`, exit 0, all PASS. |
| 21 | MET | Actual output pasted in-session, including the suburb distances. |
| 22 | MET | `FOUNDING_SPOT_CAP` 50, `FOUNDING_WAIVER_CAP` 50, `FOUNDING_INITIAL_MONTHS` 6, `FOUNDING_REFERRAL_MONTHS` 3 all unchanged; asserted by `tests/unit/growth/nationwide-from-day-one.test.ts` "the scarcity the founder kept is untouched". |
| 23 | MET | Only the geography changed. Asserted by "names no launch city anywhere in the offer" with a negative control on the superseded wording. |
| 24 | MET (by the previous session) | `d3e9336c` fixed all three in source; the Lighthouse mobile gate is SUCCESS on `7bb59def`. |
| 25 | MET | Verified unchanged: accessibility `error/minScore 1` (`lighthouserc.json`), CLS `error/0.1`, script `error/491520/median`. Neither `d3e9336c` nor `7bb59def` touched `lighthouserc.json`. |
| 26 | MET | Said so and moved on. |
| 27 | MET | tsc 0, eslint 0 errors, tests 218/2660/0/0, guards 41/41, canary PASS, build exit 0. |
| 28 | MET | `git push origin refs/heads/integration/launch:refs/heads/integration/launch` -> `7bb59def..8955ed8b`, PUSH_EXIT=0. |
| 29 | See UNFULFILLED note below | CI re-running on the new head; reported with the state actually observed, never predicted. |
| 30 | MET | Repurposed, not deleted. |
| 31 | MET | No cadence anywhere. `joinConsentText` reworded; `tests/unit/broadcast/digest-audience.test.ts` asserts `not.toMatch(/weekly|every week|once a week|daily|monthly/i)` WITH a negative control proving it fails on cadence wording. |
| 32 | MET | Hero "What's on near you." + "EventLinqs is open in every Australian city and state today."; band "You can sell today, anywhere in Australia." |
| 33 | MET | All three phrases removed from live copy; they survive only inside explanatory comments recording what was removed, and in test negative controls. |
| 34 | MET | `/waitlist` and `/waitlist/unsubscribe/[token]` both present in the build route manifest. |
| 35 | MET | They are ALREADY one list. `src/lib/broadcast/digest.ts:99-120` reads both `marketing_consents` (checkout checkbox, written by `src/lib/consent/record.ts:111`) and `city_waitlist_signups`, and `mergeDigestAudience` dedupes by lowercased email per city with one suppression list. No unification needed; reported as such. |
| 36 | MET | Reported. |
| 37 | MET | Checked below. |
| 38 | MET | No merge performed. |
| 39 | MET | Only TEST `vkapkibzokmfaxqogypq` written, inside BEGIN/ROLLBACK; preflight printed "not production". |
| 40 | MET | Not run. |
| 41 | MET | `20260823000001` written only. Its DDL was exercised inside a rolled-back transaction, which applies nothing. |
| 42 | MET | `git log -3` grep for co-authored/claude/anthropic/generated with/robot emoji returned nothing; commit-msg hook (`core.hooksPath=.githooks`) accepted all three. |
| 43 | MET | The founding gate was reproduced as a real 23514 from the database before the migration was written, not assumed. |
| 44 | MET | Six negative controls: cadence wording, geelong/melbourne in offer, non-city slug, uncovered consent version, the `city_slug in (...)` constraint, the `.in('city_slug',[...])` detector, plus a source-file-count floor. |
| 45 | MET | Guard runner output shows every guard naming its scope. |
| 46 | MET | Every count re-measured after the last edit; the build was re-run after the admin fix specifically so the reported exit code covers it. |
| 47 | MET | None used. |
| 48 | MET | No new "culture" string introduced. |

## Phase 3: adversarial pass

**Silent drops.** Compared ledger to draft. None unmentioned. Row 13 is
conditional and explicitly stated rather than quietly skipped. Row 29 is
reported as observed, not predicted.

**Interpretation drift. ONE REAL INSTANCE, AND IT WAS CAUGHT.** My 1a inventory
concluded "the city list never leaves the waitlist surface" from a grep whose
output was truncated at the 40-result limit. It was false. The admin waitlist
bridge at `src/app/admin/(authed)/network/page.tsx:36` ran
`.in('city_slug', ['geelong', 'melbourne'])`, a DATA-PATH gate deciding which
rows existed at all, and I had opened the copy, the refusal message and the
display name around it while leaving it in place. Confirmed against HEAD with
`git show HEAD:...`. It is fixed (registry-derived) and, more importantly, the
class is now swept: `tests/unit/growth/nationwide-from-day-one.test.ts` walks
all of `src/` for a hardcoded `.in('city_slug', [...])`, with a control proving
the detector flags the exact line that shipped and a floor proving the walk is
non-empty. Lesson recorded here because every other assertion in that file was
green while the defect stood.

**Match-versus-surpass.** The brief did not ask to surpass a competitor. Not
applicable; not claimed.

**Unverifiable claim hunt.**
- "No functional gate on signup or selling" - falsified by finding a location
  read in the publish path. Tested: read `publish-gate.ts` refusal reasons in
  full, and drove a Perth publish end to end.
- "Nothing persisted to TEST" - falsified by a surviving row. Tested: the whole
  script is BEGIN/ROLLBACK and the rollback line prints.
- "The event waitlist is untouched" - falsified by a file appearing in the diff.
  Tested: explicit `git diff --name-only` over the eight paths, empty.
- "No cadence promised" - falsified by the word weekly in shipped copy. Tested
  by assertion plus negative control.
- "Thresholds not lowered" - falsified by a diff on `lighthouserc.json`. Tested:
  `git show --stat` on both Lighthouse commits, neither touches it.
- CLAIM DELETED: I do not claim the Perth event renders correctly in a BROWSER.
  The proof is at the query and resolution layer, not a rendered page. Stated as
  such below.

**Generic test.** Not applicable: no new UI surface was designed. The `/waitlist`
rewrite reuses the existing hero, `ContentSection`, `MarketingMedia` and the
brand tokens; no new colour, size or layout was introduced.

**AI-tell sweep.** Ran over the full diff: em-dashes 0, en-dashes 0, exclamation
marks in user-facing copy 0, "culture" 0, tell lexicon 0.

**Regression sweep (DESIGN-LOCK).** No hero height, spacing, colour, chrome or
layout token changed. The `/waitlist` edits are copy plus the removal of two
badge elements whose data source (`openingFirst`) no longer exists. One
structural addition: a second button in the browse-city empty state, which is
required by the ruling (the surface must offer the nationwide action rather than
say the city is not live).

**Founder-cost test.** No dashboard trip is asked for that code could do. The
one operator action requested, applying the migration, is reserved to the
founder by his own standing rule, and `createFoundingInvite` names the file in
its error so the requirement is self-describing rather than remembered.

**Evidence-visibility test.** The deliverable is behavioural, not visual. It is
visible as: a re-runnable script at `scripts/verify/nationwide-perth-e2e.mjs`
whose output is in the transcript, a test file, and this ledger. No screenshot
was taken; see the honest gap below.

## Phase 4: the gate

Two items are not clean, and they go at the top of the report rather than the
bottom.

1. **The migration is NOT APPLIED**, by instruction. Until the founder applies
   `20260823000001`, a founding invite for any city other than Geelong or
   Melbourne fails at the database with 23514. The application no longer
   restricts it, so this is the one place where code and database disagree, and
   the disagreement is proven, not theorised.
2. **No browser-rendered proof of the Perth event page.** The end-to-end drive
   proves the city landing's exact predicate returns the event and that the
   venue resolves to the right suburb district, both at the data layer inside a
   rolled-back transaction. It does not show a rendered `/city/perth` page,
   because the row is rolled back and never reaches a running server.
