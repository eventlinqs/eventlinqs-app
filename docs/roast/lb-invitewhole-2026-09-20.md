# LB-INVITEWHOLE self-audit ledger, 20 September 2026

The requirement ledger for the founding invite loop, written from the literal
text of the lane B brief, the COMPLETION LAW in `C:\dev\CLOSE-OUT.md`, and the
standing laws in `CLAUDE.md`. Written BEFORE adjudication.

The subject: `src/lib/founding/invites.ts`, `/dashboard/invites`, `/join/[code]`
and the organisation-create action, where every read in the acquisition loop the
growth plan calls lever two answered a failure as an answer.

---

## PHASE 1 AND 2: THE LEDGER, ADJUDICATED

### A. The lane rules, which bind every item

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | Work only in `C:\dev\lanes\B`, branch `lane/b-growth` | MET | every path written is under `C:/dev/lanes/B`; `git rev-parse --abbrev-ref HEAD` reported `lane/b-growth` at the start of the run |
| A2 | Never push, never open a pull request | MET | no `git push` and no `gh pr` was run. The commit stays on `lane/b-growth` |
| A3 | Never write the shared files (CLOSE-OUT.md, BUILD-LOG.md, BUILD-LEDGER.md, REVIEW-QUEUE.md, LANE-RETURNS.md, DEPLOY-STATE.txt, CLOSE-OUT-DONE.md, CLOSE-OUT-NEXT.md, push-attempt.log, BUILD-COMPLETE.txt) | MET | the only files appended under `C:\dev` are `REVIEW-QUEUE-B.md`, `BUILD-LOG-B.md` and `LANE-B-CLOSED.md`, all three lane B's own |
| A4 | Port 3100 only, and find out who owns it before touching it | MET | `netstat` gave PID 29404; `Get-CimInstance Win32_Process` showed `C:\dev\lanes\B\node_modules\next\dist\server\lib\start-server.js`, this worktree's own. Nothing was stopped or restarted. `LB_BASE_URL` defaults to `http://localhost:3100` |
| A5 | Every TEST row carries lane-B in its name, slug, email or reference | MET | organisations `lane-b-invitewhole-inviter-<run>` / `-invitee-<run>`, users `lane-b-invitewhole-*@eventlinqs.test`, invite codes `LANEB<RUN>*`. Named in `scripts/verify/lb-invitewhole-drive.mjs` (`TAG`) and `lb-invitewhole-sql-proof.mjs` |
| A6 | Never delete, edit or reuse another lane's row; never truncate a table | MET | every delete in both scripts is keyed to an id or a slug this run created. No `truncate` anywhere |
| A7 | Work only lane B's slice; a change in another lane's territory goes to REVIEW-QUEUE-B.md as a BORDER line | MET | the founding invite loop is lane B growth (FO1 was lane B's item). No file under the checkout payment intent, the Stripe webhook, refunds, the slot ledger, connected accounts, the notification router or the owner digest was touched. One BORDER line raised for lane C's unapplied migration |
| A8 | Priority order absolute: FO1, GA1 v3, GA2, GA3, GA4, GA5, OL1, AN1, PL1, C19 before anything self-directed | MET | read line by line: FO1 DONE (CLOSE-OUT.md:1354), GA1 v3 DONE (:1443), GA2 DONE (:1448), GA3 DONE (:1453), GA4 DONE (:1458), GA5 DONE (:1463), OL1 DONE (:1359), PL1 DONE (:1406), C19 DONE (:374). AN1 is open on acceptance 4 ALONE, which CLOSE-OUT.md:1395 itself rules a Law 10 IMPOSSIBLE for a machine. CS1 is not before 10 October |
| A9 | Read LANE-RETURNS.md first; returned work outranks new work | MET | read. Its five items to lane B are: types fixed by lane A (nothing asked), the CRLF test helper fixed by lane A (nothing asked), AQ2 queued behind lane A's MONEY FIX (nothing asked), AQ3/AN1 blocked on the founder (nothing asked), and a transient flagged for information. `git merge-base --is-ancestor a3f5b33e HEAD` confirms lane A's fixes are in this branch |
| A10 | Second action every run: `git status`; never discard uncommitted work | MET | run as the second action, reported clean |
| A11 | Six cheap gate steps must all pass; never the lighthouse, build or production-parity steps | MET | typecheck 46s, lint 70s, copy 1s, guards 209s, types-drift 39s, suite 189s, all PASS. The three reserved steps were not run |
| A12 | Never stop, kill or restart a process I did not start; never `Get-Process node` or `taskkill` | MET | no process was stopped. The one `Get-CimInstance` call filtered on a single PID to READ its command line |
| A13 | Never read, edit or delete anything under `C:\dev\leads` | MET | that path was never opened |
| A14 | Production Supabase is not written; the CLI rests linked to TEST | MET | production was read only, through `scripts/lib/production-select.mjs`, which refuses any statement that is not a SELECT. `npx supabase projects list` shows `vkapkibzokmfaxqogypq` linked, `gndnldyfudbytbboxesk` not |
| A15 | Do not delete `.next`, `.turbo` or the npm cache above 10 GB free; never `npm cache clean`; stop under 8 GB | MET | 13 GB at the start, 12 GB at the end. Nothing was deleted, no cache was cleaned |
| A16 | Delete Playwright traces and videos once read | MET | the drive launches `chromium.launch()` with no trace or video recording, so none were produced. The kept evidence is twelve screenshots and three logs |

### B. The COMPLETION LAW, clause by clause

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| B1 | One item at a time | MET | LB-INVITEWHOLE is the only item worked. The one defect found outside its centre (the organisation slug-uniqueness read) is in a file this item already changes and was fixed in the same commit, not queued |
| B2 | Schema | MET | `supabase/migrations/20260920000050_a_founding_invite_is_spent_once.sql`: `accept_founding_invite(text,uuid,uuid,boolean)` and `trg_founding_invite_allowance`. Applied to TEST and READ BACK: `pg_proc.pg_get_function_identity_arguments` = `p_code text, p_user_id uuid, p_org_id uuid, p_offer_open boolean`, `prosecdef` true, `prosrc LIKE '%claim_founding_spot%'` true, `pg_trigger.tgname` = `trg_founding_invite_allowance`, and the allowance constant reads 5 |
| B3 | Measured before the constraint was written, on BOTH databases | MET | TEST 0 invites / 0 by an organiser / 0 max per inviter / 5 founding / 12 waiver holders. Production 0/0/0/0/0, read through the Management API SELECT-only reader. No row on either breaks the allowance, so no repair statement was needed |
| B4 | Code, typechecked, linted | MET | `npm run gate:push -- --only typecheck` PASS 46s, `--only lint` PASS 70s |
| B5 | Tests | MET | `tests/unit/growth/a-founding-invite-is-spent-once.test.ts`, 22 cases against a fake PostgREST server that can refuse and can answer a null count |
| B6 | The test-count canary raised in the same commit, with the arithmetic | MET | `scripts/guards/test-count-canary.mjs` 523/6992 to 524/7014, arithmetic written out, and the one rewritten-not-added test named. Measured, not predicted: `[test-count-canary] 524 files, 7014 tests, 0 failed, 0 skipped` |
| B7 | A registered blocking guard | MET | `scripts/guards/the-founding-invite-is-spent-once.mjs`, registered in `run-guards.mjs` (entry at line 2478, header list at 659) so it blocks on prebuild |
| B8 | The guard proven to FAIL as well as pass | MET | 6 drills, one per clause, `C:\dev\EVIDENCE\LB-INVITEWHOLE\drills.txt`: "6/6 drills fired correctly" and "all guards PASS on the restored tree". Two plant the defect in its ORIGINAL form (the direct `claim_founding_spot` call, and the unconditional cookie delete) |
| B9 | Driven proof at 390, 768 and 1440 | MET | `scripts/verify/lb-invitewhole-drive.mjs`, 48 of 48, against TEST on port 3100. Twelve screenshots in `C:\dev\EVIDENCE\LB-INVITEWHOLE\drive\` |
| B10 | Full regression green | MET | six gate steps green on the committed tree, listed in A11 |
| B11 | Fix every defect found before starting the next task | MET | six fixed in this pass, listed in section D |
| B12 | Never claim something works without driving it | MET | every claim in the report traces to `results.json`, `sql-proof.json`, `drills.txt` or a gate step's own output |
| B13 | Never guess a slug, route or id: enumerate from source or the database | MET | the invite codes come from the SCREEN after a real press, the organisation ids from the insert's `.select()`, the route list from the files themselves. The scan that chose the subject enumerated every unbounded read in `src/` through the guards' own chain parser |
| B14 | Zero placeholders on any shipped surface | MET | no new copy string was added to any surface. The grid change is a class list |

### C. The standing laws in CLAUDE.md

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| C1 | Law 0: state the governing laws before editing | MET | stated in session before the first edit: Law 0, Definition of Done, Growth plan, Law 5, Law 7, Law 8, Law 10, Verification and gates, Copy and banned content, Fee system |
| C2 | Law 1: no generic | MET | the one visual change inherits the documented house pattern from `dashboard/api-keys`, `dashboard/organisation` and the stream page, and its own comment names the measurement that forced it |
| C3 | Law 5: zero dead links, no dead-end tiles | MET | no route, link or tile was added. The one CTA on the affected surface (`Claim your founding spot`) was measured at 235x48 and 292x48 across the three viewports and opens `/organisers/signup?invite=<code>` |
| C4 | Law 7: no third-party specification from memory | MET | the one external claim is the Supabase 1,000-row response ceiling, cited in the code it justifies with the URL and fetch date already in the tree |
| C5 | Law 8: no AI authorship in the commit message | MET | the commit message carries no `Co-Authored-By`, no "Generated with", no robot emoji. `.githooks/commit-msg` would refuse it and `no-ai-authorship` is inside the 198 guards that passed |
| C6 | Law 9: nothing pinned backwards | MET | no version of anything was changed |
| C7 | Law 10: every founder step is SCRIPTED, RESERVED or IMPOSSIBLE | MET | one founder step exists: applying the migration to production. RESERVED by the founder's ruling of 26 August 2026, and already one command, `npm run migrate:production`. Recorded in `C:\dev\REVIEW-QUEUE-B.md` |
| C8 | Copy: no em-dashes, no en-dashes, no exclamation marks in user-facing copy | MET | `--only copy` PASS. The AI-tell sweep below counts zero |
| C9 | Copy: the word "culture" in any form is banned | MET | swept every file in the commit. Zero occurrences in anything this commit WROTE. Two appear and neither is mine: `scripts/verify/guard-failure-drills.mjs:1541` is a pre-existing drill that plants the legacy `/cultures` path on purpose to make a guard go red, and `git diff -U0` confirms my 77 added lines in that file are all elsewhere; this ledger names the word in order to report the sweep |
| C10 | Australian English | MET | "organiser", "organisation", "recognised" throughout; no US spelling introduced |
| C11 | Migrations: write the file, Lawal applies it to production | MET | the migration was applied to TEST only, through `scripts/verify/apply-migration-to-test.mjs`, which refuses any project that is not TEST. Never the Dashboard, never the MCP |
| C12 | Fee system: one source, never a hardcoded fee | MET | no fee value is read or written. The founding waiver's DATE arithmetic is untouched; `foundingGrantVerdict`, `initialWaiverUntil` and `FOUNDING_WAIVER_CAP` are used exactly as before |
| C13 | Design system: inherit exactly, no new colour, size or type | MET | the single visual change is `grid-cols-3` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. No colour, token, font or spacing value was added or moved |
| C14 | axe: zero violations | MET | 9 scans (invites, allowance, landing, each at three viewports), 0 violations at ANY impact level, 25 to 27 passing checks each |
| C15 | Touch targets 44px or larger | MET | the claim CTA measured 48px high at all three viewports. The invite `Copy` control and the generate button both carry `min-h-[44px]` already |

### D. The defects, and what each one was telling somebody

| # | Defect | Verdict | Evidence |
|---|---|---|---|
| D1 | The consume and the spot claim were two transactions and the claim's error was discarded, so a blink spent a single-use code and granted nothing, under the message "All 50 founding spots are taken right now" | MET | migration 20260920000050 puts both inside `accept_founding_invite`. Proven against the live TEST database with an injected fault: `lb-invitewhole.sql.a-fault-in-the-claim-is-an-error-not-a-null-spot` and `...the-invite-is-still-pending-after-the-fault` (status=pending, accepted_at=null), then `...the-retry-after-the-fault-succeeds` (consumed=true, spot=7) |
| D2 | The five-invite allowance was `(count ?? 0) >= 5` over a count whose error was never bound, so a failed count minted a sixth | MET | `countOrRaise` in `invites/actions.ts`, plus `trg_founding_invite_allowance` as the backstop. Driven: `lb-invitewhole.database.the-sixth-is-refused-by-the-database-too  code=23514` |
| D3 | `getInviteByCode` discarded its error, so /join/[code] told a valid invitee their link had been withdrawn | MET | `readOrThrow`. Pinned by two tests: a failed read throws, and PGRST116 still answers null. Driven at three viewports: `lb-invitewhole.landing.a-live-invite-is-welcomed.*`, and a genuinely absent code still refuses |
| D4 | `getFoundingReferralSummary` was `confirmed ?? 0`, so a failed count told a founding organiser they had referred nobody | MET | `countOrRaise` for both counts. Three tests: a failed count raises, a null count raises, real counts come back |
| D5 | The invites list read was unbounded AND discarded its error, and the screen derives `remaining = allowance - invites.length` from it, so a failed read enabled a button the database refuses | MET | `readEveryRow` on a total order (`created_at`, then `id`). Driven: the screen's own count tracked the database at every step (`5 of 5`, `4 of 5`, `3 of 5`), and the pager returned 5 of 5 through a page size of 2 while a window returned 2 with HTTP 200 and `error` null |
| D6 | The waiver cap check was `holders ?? 0`, so a failed count silently disabled the fifty cap | MET | the failure is now audit-logged as `founding.waiver.cap_unreadable` and the grant is left to the database trigger, which is the real authority. Two tests cover both directions |
| D7 | The invite cookie was deleted on the line after a call whose result nobody read | MET | guarded on `outcome.consumed`. Driven: the cookie is dropped by the landing (`el_founding_invite=7S3HWSLEUA`) and gone after a successful conversion |
| D8 | FOUND BY MY OWN GUARD: the organisation slug-uniqueness read discarded its error, so a blink skipped the check and the organiser got the insert's generic refusal instead of the sentence naming what to change | MET | `readOrThrow('organisation-slug-uniqueness', ...)`. The guard reported it at `organisation/actions.ts:51` and now passes |
| D9 | FOUND BY THE GUARD RUNNER: my own SQL proof called `auth.admin.deleteUser` directly, outside the one door that can tell a refused deletion from an absent account | MET | `tearDownAccountOrFailTheRun`. `one-way-to-delete-an-account` PASS |
| D10 | FOUND BY THE GUARD RUNNER: my drive inserted an organisation with `status: 'active'`, publishing `/organisers/<slug>` into a sitemap three lanes share | MET | changed to `pending`. `fixtures-are-not-published` PASS, 104 drives, 218 fixture writes, none published |
| D11 | FOUND BY READING THE SCREENSHOT: the stat grid was `grid-cols-3` with no breakpoint, so at 390 each track was about 110px and "Not active" broke across two lines of display type; at 768 the dashboard sidebar left three tracks at about 150px and it squeezed the same way | MET | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, and the re-driven captures at 390 and 768 show one line per card |
| D12 | FOUND BY READING THE REPORT SCEPTICALLY: my own drive reported the same invite code at all three viewports. It indexed the list at `before` while the list renders newest-first, so it read an OLDER row and reconciled that against the database, passing every time | MET | the helper differences the set of codes instead, and the check now fails if a press produces a code already seen. Re-run: three distinct codes, `5 invite(s) made through the form, 5 of them distinct` |
| D13 | FOUND WHILE REGENERATING TYPES: TEST is missing migration 20260918000010, which production has, and carries four `event_need_*` tables no migration in this tree creates | RAISED, NOT FIXED | not lane B's slice: the organiser sales digest is lane C's territory and the stray tables belong to whoever made them. BORDER line in `C:\dev\REVIEW-QUEUE-B.md` with the one command that fixes the first half |

---

## PHASE 3: THE ADVERSARIAL PASS

**Silent drops.** Compared the ledger with the report draft. Every row above is
mentioned in the closure block or the build log. The three I nearly left out of
the report, and have therefore written in explicitly: D9, D10 and D12, all three
found by something other than me.

**Interpretation drift.** One place, and it is named rather than hidden. The
item could have been read as "fix the discarded reads", which is a morning's
work and would have left the invite still spendable on nothing, because that
defect is not in a read at all: it is in the fact that two writes were in two
transactions. I nearly scoped it to the reads. The atomic function is the harder
reading and is the one built.

A second, smaller one: I considered adding a RETRY path so a failed conversion
could be attempted again later. That would be a new feature, not a defect fix,
and it is not built. What IS built is that a failed conversion no longer costs
anything: the code is still pending, the cookie is kept, and the failure is on
the audit log under `founding.invite.conversion_failed` for the founder to act
on. Stated in the closure rather than implied.

**The match-versus-surpass test.** The brief for this item does not say surpass,
and there is no competitor surface to compare: `/dashboard/invites` is an authed
organiser configuration screen and
`docs/benchmark/competitor-2026/INDEX.md` carries no competitor dashboard.
Capturing one needs an organiser account with that competitor. The benchmark
gate is therefore BLOCKED rather than skipped, and is recorded as such. No
layout was redesigned: the one visual change is named in D11.

**The unverifiable claim hunt.** Every claim in the report, and what would
falsify it:

- "a fault during the claim leaves the invite pending" - falsified by the invite
  reading `accepted` after an injected fault. Tested, twice, in
  `lb-invitewhole-sql-proof.mjs`.
- "the sixth invite is refused by the database" - falsified by the insert
  succeeding. Tested in both the SQL proof and the drive.
- "the screen and the database agree about the allowance" - falsified by the
  button being enabled while the database refuses. Tested at three viewports.
- "no read in the loop discards its error" - falsified by the guard's clause 3,
  drilled red.
- "axe is clean at every impact level" - falsified by a violation at any impact.
  9 scans.
- "TEST is left as found" - falsified by a row remaining. Re-read by name after
  both scripts, and the whole-database measurement was repeated afterwards: 5
  founding organisations and 12 waiver holders, the same as before.

No claim survives in the report that I could not falsify-test. One deleted
during this pass: an earlier draft of the build log said "the acquisition loop
is now whole". It is not a testable statement and it is gone.

**The generic test.** Could this belong to another product? The migration names
the Founding Organiser programme, the fifty cap, the five-invite allowance and
the referral credit that lands on the first paid ticket, all of which are
EventLinqs' own offer as published on `/organisers`. Not generic.

**The AI-tell sweep.** Counted across every file in this commit, source and
comment alike: em-dashes 0, en-dashes 0, exclamation marks in user-facing copy
0, "culture" in any form 0, and the tell lexicon (unforgettable, look no
further, elevate, unlock, vibrant, nestled, in the heart of, stands as a
testament, "not just X it's Y", delve, tapestry, seamless, robust, leverage,
navigate the landscape) 0. The copy gate agrees: PASS.

**The regression sweep, DESIGN-LOCK.** One element changed that the brief did
not ask me to change: the stat grid's column count on
`/dashboard/invites`. It is NOT reverted, and the reason is that the brief's own
clause 9 asks for driven proof at 390 and 768, and the capture at those
viewports is what exposed it. Reverting it would mean shipping a surface I have
photographic evidence is squeezed. It is named here, in the closure block and in
the build log rather than left for someone to find in a diff. Nothing else
moved: no hero, no spacing token, no colour, no chrome, no copy string.

**The founder-cost test.** The report sends the founder to exactly one thing,
`npm run migrate:production`, which is one command and is RESERVED to him by his
own ruling rather than by my convenience. No question in the report could have
been answered by reading the code: the two open questions (whether an organiser
should have a control that deletes a ladder, and who owns the `event_need_*`
tables) are both decisions rather than lookups.

**The evidence-visibility test.** Twelve screenshots at
`C:\dev\EVIDENCE\LB-INVITEWHOLE\drive\`, `results.json`, `drive.log`,
`sql-proof.json`, `sql-proof.log` and `drills.txt`. The founder can see the
three viewports of the invite screen, the allowance state, the warm landing and
the converted state without reading a word I wrote.

---

## PHASE 4: THE GATE

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.

REFUSED: 0.

BLOCKED: 1, and it is a blocker rather than a skip.

- **The competitor benchmark gate.** `/dashboard/invites` is an authed organiser
  configuration screen and `/join/[code]` is a noindex invitation landing with a
  single recipient. `docs/benchmark/competitor-2026/INDEX.md` carries
  Eventbrite's organiser PRICING and LANDING pages, both public marketing
  surfaces, and no competitor dashboard or invite landing. Capturing one needs a
  founding-organiser account inside a competitor's product. What would unblock
  it: such an account, or a founder ruling that an authed configuration screen
  is out of the gate's scope.

RAISED FOR ANOTHER LANE: 1 (D13), with the command that fixes it.

---

## PHASE 5: DECISION EVIDENCE

Two decisions were made in this item that are not pure defect repair.

### Decision 1: the consume and the claim move into one SQL transaction

| Dimension | Evidence |
|---|---|
| Competitor | Not applicable. This is a property of our own conversion path; no competitor's transaction boundaries are observable |
| Market | Not applicable |
| Engagement | The invited organiser is the single most expensive visitor in the acquisition loop: the growth plan's lever one is recruiting the first 25 to 50 organisers personally, and an invited one arrives through a person who already vouched for us. A failure that spends their code and tells them the programme is full is the worst outcome available at that moment |
| Trend | Not applicable |
| Our code | `claim_founding_spot` already existed and already held the fifty cap under a row lock (`supabase/migrations/20260710000002_founding_network.sql`). The new function CALLS it rather than restating it, so the cap stays in one place. The alternative, a compensating write that released the invite after a failed claim, needs a second round trip that can itself fail, which is the shape being removed |
| Test plan | The metric is the state of the invite row after a fault inside the claim. The threshold is exact: `status = 'pending'`, `accepted_at IS NULL`. Measured by injecting a fault scoped by `WHEN (NEW.id = '<this run\'s org>')` so no other row on the shared TEST database can reach it, and dropping it in the same run with the drop verified by counting `pg_trigger` |

### Decision 2: an unreadable waiver cap does not refuse the grant

| Dimension | Evidence |
|---|---|
| Our code | `enforce_founding_waiver_cap` (migration 20260913000010) is a database trigger that refuses the fifty-first window, and the existing code already audit-logs `founding.waiver.grant_failed` when the update is rejected. The in-code check exists to make the refusal READABLE, not to be the authority |
| Test plan | Two tests, one per direction: a readable cap at 50 withholds the window and writes no update; an unreadable cap records `founding.waiver.cap_unreadable` and still attempts the update. The falsifier for the choice is an organisation receiving a window past the cap, which the trigger refuses independently |

Where an A/B test would settle something and cannot be run: none here. Neither
decision is a taste question.
