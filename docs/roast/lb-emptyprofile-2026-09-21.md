# LB-EMPTYPROFILE, self-audit ledger. 21 September 2026, lane B, commit f415f272

The brief was re-read verbatim before this ledger was written. The requirement
rows are the same 38 adjudicated for LB-BLINKDOOR earlier today
(`docs/roast/lb-blinkdoor-2026-09-21.md`); this ledger adjudicates them again
against THIS item's evidence rather than inheriting a verdict, because a
requirement met once is not a requirement met twice.

## Phase 1 and 2: adjudication

Rows 14 to 38 of the LB-BLINKDOOR ledger (lane discipline, ports, TEST rows,
production, disk, the standing copy laws, Law 8, Law 10) are re-checked and
re-MET on this item, with these differences worth naming rather than copying:

| # | Requirement | Verdict | Evidence for THIS item |
|---|---|---|---|
| 3 | One item at a time | MET | One subject, one commit (f415f272), begun only after LB-BLINKDOOR was committed, audited and recorded |
| 4 | Schema | N/A AND STATED | No migration. `git show --stat f415f272` lists no `supabase/migrations/` file |
| 5 | Code | MET | `src/app/organisers/[handle]/page.tsx` (2 reads), `src/app/venues/[handle]/page.tsx` (3 reads), all through `readOrThrow` |
| 6 | Tests | MET | `tests/unit/growth/a-profile-is-not-emptied-by-a-blink.test.ts`, 14 cases, 3 driven RED. `C:/dev/EVIDENCE/LB-EMPTYPROFILE-red.txt` |
| 7 | A registered blocking guard | MET | `a-failed-read-is-not-a-fact-about-a-person` gains `src/app/organisers` and `src/app/venues` in SCOPE. `--only guards` PASS |
| 8 | Proven to fail as well as pass | MET | `--only a-failed-read` reports `=== 17/17 drills fired correctly ===`, three of them new: the organiser profile restored, the venue profile restored, and the scope renamed away |
| 9 | Driven proof at 390, 768, 1440 | MET, and with no seam this time | 9 of 9 checks, three viewports, two surfaces plus the empty-state control, all handles enumerated from the database. `C:/dev/EVIDENCE/LB-EMPTYPROFILE/drive.log` and `drive/` (9 PNGs) |
| 10 | Full regression green | MET | typecheck 12s, lint 6s, copy 1s, guards 253s, types-drift 18s, suite 180s (544 files, 7,294 tests, 0 failed, 0 skipped) |
| 11 | Fix every defect found | MET | Two found during the item and both fixed: the literal BACKSPACE a shell heredoc put into the drive's source, caught by `no-control-characters`; and the drive preferring another lane's fixture row, corrected to prefer an untagged one |
| 13 | Never guess a slug, route or id | MET, and it is the load-bearing one here | Every handle comes out of `public.events` and `public.organisations` at run time. The venue slug rule is COPIED rather than imported, which is stated in the file, and the drive asserts 200 before judging anything, so a rule that drifts fails loudly as a 404 rather than quietly as a wrong verdict |
| 20 | Never delete, edit or reuse another lane's row | MET, after a correction | The first run enumerated `northside-sound-lane-c-0064572`. Read-only, so nothing was broken, but a drive that leans on another lane's fixture goes red the day that lane tidies up. The enumeration prefers an untagged row now and says in the log which it used. The drive writes nothing at all |
| 22 | Six gate steps | MET | Listed in row 10. Guards went RED once mid-item, on my own control character, and was re-run green |

## Phase 3: the adversarial pass

**Silent drops.** Compared row by row. The report mentions every row that moved.

**Interpretation drift. NONE FOUND ON THIS ITEM, and the contrast with the last
one is the point.** LB-BLINKDOOR could not photograph its blinked state. This
item's defect has a visible face on real data in both directions and both were
photographed at all three viewports. Nothing was substituted for anything.

**The one place I could have fooled myself, and did, briefly.** The first red
proof rewrote the pre-fix shape as `(upcoming as never as { data: unknown }).data`
to keep TypeScript quiet. The matcher anchors its property test on the NAME, and
`.data` after a closing parenthesis is not `upcoming.data`, so only ONE of the
fourteen tests went red and it was the door-count one rather than either
judgement test. Taken at face value that looked like "the tests are a bit weak".
It was the PROOF that was weak. Redone with the real spelling, three go red
including both judgement tests. Recorded in the canary ledger entry so the next
person writing a red proof reads it.

**The unverifiable claim hunt.** Four claims, each falsifiable and each tested:

- "the page publishes an empty catalogue when a read fails". Falsifiable by
  restoring the shape and asking the guard. Tested: the drill prints the guard's
  own refusal naming `src/app/organisers/[handle]/page.tsx`.
- "the fix does not break a working profile". Falsifiable by driving one.
  Tested: 6 of the 9 checks, 200 with real event links and no empty state.
- "the fix does not break the legitimate empty state". Falsifiable by driving an
  organiser who has none. Tested: 3 of the 9 checks, on
  `/organisers/afrobeats-melbourne`, enumerated as having no upcoming public
  event.
- "no matcher in the tree could see these". Falsifiable by running the old
  matcher over the files. Tested earlier today: it reports zero.

ONE CLAIM WAS NOT MADE, having been checked. The 1440 capture shows "1 event,
0 cities" on the organiser profile, which reads like a counting defect. It was
queried against the database before anything was written about it: that
organiser's one event genuinely carries `venue_city = null`, so "0 cities" is
true. No defect, and nothing is claimed.

**The generic test.** Not generic: the surfaces, the empty-state sentence and
the scope entries are EventLinqs' own.

**The AI-tell sweep.** Em-dashes 0, en-dashes 0, exclamation marks 0, banned word
0, tell lexicon 0. The copy gate passes.

**The regression sweep, DESIGN-LOCK.** NOTHING user-facing changed on this item.
No copy, no hero, no spacing, no colour, no layout, no chrome. The only product
change is which function the three reads go through. The drive proves both
surfaces still render exactly as before, at three viewports, on real data.

**The founder-cost test.** No founder step. No migration. Nothing in the report
sends anybody to a dashboard.

**The evidence-visibility test.** Nine screenshots, a log and a results file at
named paths. Two were opened and read during this audit: the 390 organiser
capture and the 1440 organiser capture, and the second is what produced the
"0 cities" query above.

## Phase 4: the gate

NOT MET: 0. PARTIAL: 0. N/A and stated: 1 (schema). Unresolved adversarial
findings: 0.

## Phase 5: decision evidence

One decision, recorded with its evidence.

| Decision | Evidence |
|---|---|
| A failed profile read THROWS rather than rendering an empty catalogue | Our code: the precedent is already set twice in this tree, in `src/lib/supabase/read-or-throw.ts` ("a 500 says ask again, which is true; a 404 says something false and permanent") and in `src/lib/marketplace/showcase.ts`, which throws rather than rendering an empty marketplace. Test plan: the drive checks BOTH directions, because the failure mode of this decision is turning a legitimately empty profile into a 500, and that is exactly what the third target in each viewport is for |
