# LB-PRICEWHOLE, self-audit ledger. 20 September 2026, lane B, commit `67fbc2be`.

The brief, read verbatim rather than from memory: `C:\dev\BUILD-BRIEF.md` (the
COMPLETION LAW and the definition of DRIVEN), the lane B instruction block of
this session, and `CLAUDE.md` (the Definition of Done and the standing laws).

The ledger was written before any row was adjudicated, so that it could not be
shaped to fit what happened to get built.

---

## Phase 1 and 2: the requirement ledger, adjudicated

### A. The COMPLETION LAW, `C:\dev\BUILD-BRIEF.md`

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | Schema: migration written | MET | `supabase/migrations/20260920000040_a_paused_ladder_is_not_a_deleted_one.sql`, 207 lines |
| A2 | Applied to TEST | MET | `scripts/verify/apply-migration-to-test.mjs --via-api`: "APPLIED to TEST. LEDGER: recorded 20260920000040" |
| A3 | Verified by querying it back | MET | `pg_trigger`: both triggers present, `tgdeferrable=true`, `tginitdeferred=true`. `pg_proc.prosrc` contains `v_replace`. And behaviourally: the drive's `constraint.enabled-with-no-ladder-is-refused` and `constraint.emptying-a-running-ladder-is-refused` both came back `23514` from the live database |
| A4 | Code built, typechecked, linted | MET | `npm run gate:push --only typecheck` PASS 15s; `--only lint` PASS 113s |
| A5 | No silent catches | MET | Two catches added, both log before acting: `tiersForLedger` (`[slot-ledger] no inventory history written`) and the publish gate (`[publish-gate] the ticket types could not be read`). The registered `no-silent-catch` guard passes inside the 196 |
| A6 | Real tests added, the suite grows | MET | `tests/unit/dashboard/the-price-ladder-survives-a-blink.test.ts`, 17 cases. Suite 522/6975 to 523/6992 |
| A7 | The canary baseline raised IN THE SAME COMMIT | MET | `scripts/guards/test-count-canary.mjs` `MIN_FILES = 523`, `MIN_TESTS = 6992`, in `67fbc2be`, with the arithmetic written out and the one replacement case named |
| A8 | A registered blocking guard | MET | `scripts/guards/the-price-ladder-survives-a-blink.mjs`, registered in `run-guards.mjs` and in its header comment list |
| A9 | Proven to FAIL against the broken state | MET | `scripts/verify/guard-failure-drills.mjs --only the-price-ladder-survives-a-blink`: "6/6 drills fired correctly", one per clause |
| A10 | Proven to PASS against the fixed state | MET | The harness's own closing line, re-run with `--env-file=.env.local` on the committed tree: "all guards PASS on the restored tree", and `git status` clean afterwards. The FIRST drill run said "the tree may be dirty" and named seven failing guards; every one of those seven needs a Supabase URL or a token, and the harness had been run without the env file. The tree was never dirty and the conclusion was an artefact of how I ran it, which is why it was re-run rather than explained away |
| A11 | Both outputs shown | MET | Quoted in `C:\dev\BUILD-LOG-B.md` and in this ledger |
| A12 | DRIVEN in a real browser as a real organiser | MET | `scripts/verify/lb-pricewhole-drive.mjs`: signs in at `/login` with a password, then works the screens with clicks and typing only |
| A13 | At 390, 768 and 1440 | MET | 60 of 60 checks across the three viewports |
| A14 | Screenshots under `C:\dev\EVIDENCE\<item-id>\` | MET | `C:\dev\EVIDENCE\LB-PRICEWHOLE\drive\`, nine PNGs, 600 KB total |
| A15 | Full regression green after the item | PARTIAL, by instruction | Six of the gate steps green: typecheck, lint, copy, guards (196), types-drift (OK against production), suite (523/6992, 0 failed). The build, lighthouse and production-parity steps were NOT run because the lane instruction forbids them ("they belong to lane A"). Stated rather than implied: a fault that only the BUILD step can see would not have been caught here |
| A16 | axe zero violations at EVERY impact level on affected surfaces | MET | Nine scans (pricing running, pricing paused, discounts, each at three viewports), 0 violations at any impact level, 23 to 23 passing checks each |
| A17 | Lighthouse | REFUSED | The lane instruction: "Do not run the lighthouse step, the build step or the production-parity step; they belong to lane A." These are authed dashboard routes and are not in the Lighthouse URL set |
| A18 | Committed, Australian English, no trailers | MET | `67fbc2be`. Zero em or en dashes in the diff, zero AI trailers, `no-ai-authorship` guard passes |
| A19 | Pushed | REFUSED | Lane rule one: "YOU NEVER PUSH AND YOU NEVER OPEN A PULL REQUEST." Lane A merges and pushes |
| A20 | Not finished until production deploys green with it | BLOCKED | Lane A owns the push; the migration is the founder's to apply. Both named in the closure block rather than implied |
| A21 | Never start item N+1 while N is partial | MET | One item this run |

### B. The definition of DRIVEN, `C:\dev\BUILD-BRIEF.md`

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| B1 | Exercised through the same UI a real person sees | MET | Every assertion about the screens comes from clicks, typed input and a reload. The database is read only to check what those clicks stored |
| B2 | Not through an API call, a direct database write or a harness shortcut | MET | The ladder is created by pressing the switch, pressing Add step four times, typing five thresholds and five prices, and pressing Save |
| B3 | A journey that only passes because a script seeded state a real user could not create FAILS | MET | The first run of this drive did exactly that in reverse: it typed the ladder without pressing the switch and then asserted the tier came back enabled. The screen was right and the harness was wrong. The comment at `lb-pricewhole-drive.mjs` records it |

### C. The lane B protocol, this session

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| C1 | Read `CLOSE-OUT.md` and `BUILD-BRIEF.md` | MET | Both read in full this run. `CLOSE-OUT-NEXT.md` no longer exists; the GA bodies are folded into `CLOSE-OUT.md` as its own note says |
| C2 | Read `LANE-RETURNS.md`; returned work is the first job | MET | Read. Nothing is returned to lane B: the four items addressed to lane B on 20 September each say so ("NOTHING IS ASKED OF LANE B", "Nothing is asked of lane B") |
| C3 | Second action every run: `git status` | MET | Run second; working tree clean |
| C4 | Work only in `C:\dev\lanes\B` | MET | Every write in this run is under that path or under `C:\dev\EVIDENCE\LB-PRICEWHOLE` |
| C5 | Never push, never open a pull request | MET | No push, no PR |
| C6 | Never write the shared files | MET | `CLOSE-OUT.md`, `BUILD-LOG.md`, `BUILD-LEDGER.md`, `REVIEW-QUEUE.md`, `DEPLOY-STATE.txt` and the rest were read only |
| C7 | Port 3100 and nothing else | MET | The drive's base is `http://localhost:3100`. The server on it is `next dev -p 3100` started from this worktree |
| C8 | Every TEST row carries lane-B | MET | `lane-b-pricewhole-presents-*`, `lane-b-pricewhole+*@eventlinqs.test`, discount codes `LANEB1440`, `LANEB768`, `LANEB390` |
| C9 | Never delete, edit or reuse another lane's rows | MET | The purge is scoped to the slug prefix `lane-b-pricewhole-presents-`. A lane C event was enumerated early and deliberately not used |
| C10 | Leave TEST as found | MET | Re-read by name after the run: 0 organisations, 0 events, 0 `LANEB%` codes, 0 auth users, 0 orphan tiers |
| C11 | Work only your slice | MET | "pricing configuration" is named in the lane B slice. The four surfaces touched are the organiser's pricing screen, discount screen, stream room and event actions |
| C12 | BORDER rather than reaching into another lane | PARTIAL, see D2 | One file, `src/app/globals.css`, is arguably shared. The change is additive only and is raised in `REVIEW-QUEUE-B.md` |
| C13 | Six gate steps before calling the item done | MET | All six run, all six PASS, timings recorded |
| C14 | Never guess a slug, route or id | MET | The event id, tier id and route paths all come from the fixture the drive created and read back. No id is typed into the harness |
| C15 | Never stop a process you did not start | MET | No process was stopped. `Get-CimInstance` was used once to READ the owner of port 3100 before using it |
| C16 | Never touch `C:\dev\leads` | MET | Not read, not listed, not written |
| C17 | Production Supabase read only | MET | One read, through `scripts/lib/production-select.mjs`, which refuses any statement that is not a SELECT |
| C18 | CLI rests linked to TEST | MET | `supabase projects list`: `vkapkibzokmfaxqogypq` `linked: true`, production `linked: false` |
| C19 | Disk | MET | 14 GB at the start, 12 GB at the end, above the 10 GB line. No `.next`, `.turbo` or npm cache deleted, no `npm cache clean`. The drive produced no Playwright traces or videos; the kept evidence is 600 KB |
| C20 | Update the build log, review queue and closed file, and commit them | MET | `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md` and `LANE-B-CLOSED.md`, committed after this ledger |
| C21 | Priority order, and an item is open if its body stands | MET, see D1 | Every named item is closed or blocked on somebody else. Accounted for in D1 rather than skipped |

### D. The Definition of Done, `CLAUDE.md`

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| D1 | Nothing ships partial | MET | Every defect found in this subject is fixed in this commit, including the five colour failures and the squashed switch that were not the subject |
| D2 | Zero placeholders | MET | No stub, no TODO, no sample value added |
| D3 | Everything works on real data | MET | The drive runs against TEST with a real organiser account and real rows |
| D4 | A QA pass confirms it | MET | 60 of 60 driven checks and nine axe scans |
| D5 | Competitor benchmark gate | BLOCKED | The surface is an authed organiser dashboard configuration screen. `docs/benchmark/competitor-2026/INDEX.md` carries Eventbrite's organiser PRICING marketing page and organiser LANDING page, both public; it carries no competitor dashboard. Capturing one needs an organiser account with that competitor, which this project does not hold. Stated rather than skipped, and the layout was not redesigned: see D7 |
| D6 | Honest reporting when not 100 percent | MET | This ledger, and the UNFULFILLED block if any row had remained |
| D7 | DESIGN-LOCK, change only what the item asks | MET, with every change named | Listed in the adversarial pass below |

### E. The standing laws

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| E1 | Australian English, no em or en dashes | MET | Zero matches for either character across the whole diff |
| E2 | No exclamation marks in user-facing copy | MET | The copy gate passes; the one new sentence carries none |
| E3 | The word "culture" banned in every form | MET | Zero matches in the diff |
| E4 | No fee number typed into copy | MET | No fee figure added anywhere. `one-fee-copy` passes |
| E5 | Law 8, the founder is the sole author | MET | `no-ai-authorship` passes; no trailer, no "Generated with", no robot emoji |
| E6 | Law 6, render never generate | MET | No image or video model touched |
| E7 | Law 9, current by default | MET | No version pinned or changed |
| E8 | Media through the media components | MET | No imagery added |
| E9 | No new colours | MET, with the reasoning stated | `--color-success-strong` is a darker value of the existing `--color-success`, added as the third instance of the pattern `--brand-accent-strong` and `--color-error-strong` already set, each of which globals.css documents as existing "for the same reason". No hue is introduced and no existing token changed: the diff on `globals.css` is one token and its comment |

---

## Phase 3: the adversarial pass

**Silent drops.** Compared the ledger against the report draft. The report does
not mention A15 (the three gate steps not run), A17, A19, A20, D5 or C12 unless
they are stated. All six are now stated in the report, at the top.

**Interpretation drift.** One, and it is worth naming. The item as I first framed
it was "the row ceiling in the organiser dashboard", which is the family I have
been working. Partway in, the measured facts said the ceiling is NOT the danger
on these tables: an event with more than a thousand ticket types is not a real
event. The honest subject was the discarded error and the destructive save. I
changed the subject to the defect rather than keeping the subject that was easier
to claim, and the module header and the guard header both say so in as many
words rather than borrowing the ceiling's severity.

**The match versus surpass test.** The brief did not say surpass for this item
and no competitor capability is claimed. D5 records why the benchmark gate is
blocked rather than passed.

**The unverifiable claim hunt.**

- "The pause keeps the ladder" would be falsified by the ladder being shorter
  after a pause. Tested: `pause.*.the-ladder-survived-the-pause` reads the rows
  back after the click at all three viewports.
- "A refused read throws" would be falsified by a list coming back. Tested:
  `reads.a-refused-read-throws` forces a real PostgREST refusal by asking for a
  column that is not there.
- "The database refuses an empty running ladder" would be falsified by the
  update or delete succeeding. Tested twice, both `23514`.
- "The switch is its full width" would be falsified by a measurement under 44.
  Tested: `boundingBox().width` at three viewports.
- "axe is clean" would be falsified by any violation at any impact level.
  Tested at every level, not the serious-or-critical filter.
- CLAIM DELETED: I was about to write that the row ceiling was a live danger on
  these tables. It is not, and the files say so instead.

**The generic test.** The paused band names the organiser's own base price in
their own currency and states what happens to their steps. It could not belong
to another product without that data behind it.

**The AI-tell sweep.** Zero em dashes, zero en dashes, zero exclamation marks in
user-facing copy, zero uses of "culture", zero matches across the tell lexicon
(seamless, robust, leverage, unforgettable, elevate, unlock, vibrant, nestled,
in the heart of, testament, delve, tapestry, navigate the landscape). Zero is the
only passing number and zero is what it is.

**The regression sweep, DESIGN-LOCK.** Every existing element changed, named:

1. `pricing-client.tsx`, the steps render when the switch is off. REQUIRED by the
   fix: a pause that keeps the ladder is not believable while the ladder is
   hidden, and hiding it is what stopped an organiser seeing what they were
   losing.
2. `pricing-client.tsx`, a paused band replaces the running preview band when the
   switch is off. REQUIRED for the same reason; it uses existing ink tokens.
3. `pricing-client.tsx`, `text-gold-600` to `--brand-accent-strong`,
   `text-gold-500` to `--brand-accent-strong`, `text-green-600` and
   `text-red-600` to the strong tokens, `text-ink-400` to `text-ink-600` on the
   subtitle. REQUIRED: five measured axe failures at 2.37:1 to 4.13:1 against a
   4.5:1 floor, and the Design system law that gold-400 or 500 is never text on a
   light surface.
4. `pricing-client.tsx`, the switch gains `flex-shrink-0`, an `aria-label` and a
   focus ring. REQUIRED: flexbox squeezed its 44px pill to a blob at 390. The
   three switches in `event-form.tsx` already carry all three, so this aligns
   with the house pattern rather than inventing one.
5. `discounts-client.tsx`, two action links to the strong gold and error tokens.
   REQUIRED: measured at 2.37:1 and 3.80:1.
6. `globals.css`, one token added. Additive only; the diff is the token and its
   comment. Raised in `REVIEW-QUEUE-B.md` as a BORDER note because the file is
   arguably shared.

Nothing else was touched. No hero, no spacing scale, no chrome, no container, no
rail.

**The founder-cost test.** One step is the founder's and it is RESERVED rather
than unscripted: applying the migration to production, which the constitution
gives him by name. It is offered as the one command he already has,
`npm run migrate:production`. Nothing else in this item asks him for anything,
and no question is asked that reading the code would have answered.

**The evidence-visibility test.** Nine screenshots at
`C:\dev\EVIDENCE\LB-PRICEWHOLE\drive\`, plus `drive.log` and `results.json` with
every check named. The paused state at 1440 and at 390 were both opened and read
rather than only counted, which is how the squashed switch was found: the report
said 57 of 57 while the screenshot showed a blob.

**What the screenshots showed that the report could not.** Twice. The squashed
switch at 390, and, on the first run, that the "pause" the harness thought it was
driving was actually a resume.

---

## Phase 5: decision evidence

This item contains one product decision: **a pause keeps the ladder rather than
deleting it.**

| Dimension | Answer |
|---|---|
| Our code | `save_dynamic_pricing` (migration 20260904000002, line 260) deleted every rule unconditionally; the action sent `[]` whenever the switch was off; `pricing-client.tsx` hid the steps the moment the switch moved. The three together make the switch destructive while saying nothing |
| Competitor | **UNSOURCED.** What Eventbrite, Ticketmaster or DICE do when an organiser disables a pricing rule sits behind an organiser account on each platform, and Law 7 forbids stating it from memory. The decision does not rest on it |
| Market | UNSOURCED, same reason |
| Engagement | Not applicable: this is not a conversion surface, it is a configuration control |
| Trend | Not applicable |
| The argument the decision DOES rest on | A control labelled "Dynamic pricing" with an on and off position does not say that off means delete, and the screen removed the evidence from view at the moment it became destructive. A five step ladder is a decision an organiser made once. Deleting it on a pause is a product behaviour nobody asked for and nobody was told about |
| Test plan | How we would know this is wrong: an organiser who wants the ladder GONE now has no control that removes it. If that turns out to be wanted, the answer is an explicit control that says it deletes, never a switch that does it silently. Recorded in `REVIEW-QUEUE-B.md` for the founder |

---

## Phase 4: the gate

Requirements: 54. MET: 48. PARTIAL: 2 (A15 and C12, both by instruction and both
stated). NOT MET: 0. REFUSED: 2 (A17, A19, each naming the rule that compels it).
BLOCKED: 2 (A20, D5, each naming what would unblock it).

Unresolved adversarial findings: 0. Every finding above was either fixed in this
commit or is recorded with its reason.
