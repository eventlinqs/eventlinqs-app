# EVENTLINQS LAUNCH-WORTHY SWEEP - RUNNING LOG

Branch `integration/launch`. PR #122 into `main`.
Started 3 September 2026. Brief saved verbatim at `C:\dev\SWEEP-BRIEF.md`.

The final summary, the open items and the three direct answers are written at the
top of this file when every unblocked task is finished. Until then this is the
running record, newest task last.

## STATUS BOARD

| Task | Title | State |
|---|---|---|
| 1 | Commit the types fix, CI green | DONE |
| 2 | Corrupted proper nouns | DONE |
| 2b | Orphaned community editorial (found in 2) | DONE |
| 3 | Venue geocoding | BLOCKED ON FOUNDER (amendment 2) |
| 4 | Mobile Lighthouse 95 | NOT STARTED |
| 5 | Full Scope v5 audit, 18 sections | NOT STARTED |
| 6 | Remaining known defects, a to h | NOT STARTED |
| 7 | Prove the configured things | Stripe half BLOCKED, rest NOT STARTED |

## AWAITING A FOUNDER RULING (content, not code)

Two lists, both gated so they cannot rot. Neither blocks a build.

1. **Five corrupted names I refused to guess.** For each, the mechanical reverse
   names a body I could not confirm exists. Held in
   `scripts/guards/lib/proper-nouns.mjs` with what I actually found instead.
2. **191 orphaned editorial paragraphs.** Retired taxonomy roll-ups and removed
   concepts. Held in `scripts/guards/community-editorial-reachable.mjs`.

## ENVIRONMENT AT START

- Node v24.19.0, npm 11.17.0, from `C:\node24\node-v24.19.0-win-x64`.
- Disk free 5.82 GB against a 5 GB floor. This is TIGHT. A Next.js build writes
  gigabytes into `.next` and fails mid-compile on a near-full disk with
  "os error 112", which reads as a code bug rather than a disk fault. Flagged now
  so it is not mistaken for something else later. Watched before every build.
- `core.hooksPath` is `.githooks`, so the Law 8 commit-msg hook is armed.

---

# TASK 1. COMMIT THE TYPES FIX AND GET CI GREEN

**State: DONE.** Commit `f9739ba3`. types-drift guard PASS in 1m21s on PR #122.

## The 13 deletions, adjudicated

The brief asked for confirmation that the 13 deletions were generator reordering
and not a real loss. They are not all reordering. Two of them are substantive and
one of them is a defect I fixed rather than committed. The full account:

| # | Deleted | Verdict |
|---|---|---|
| 1 | `PostgrestVersion: "14.15"` | CORRECTION, not a loss. See below. |
| 2 | `[_ in never]: never` under `Views` | GAIN. Replaced by the real `stored_aggregate_drift` view. |
| 3 to 12 | Five pairs of `TableName` / `EnumName` / `CompositeTypeName extends` lines, 10 lines | FORMATTING. The newer generator wraps the conditional type in explicit parentheses. Semantically identical. |
| 13 | The closing `// ====` comment line | Re-added by the generator WITHOUT the trailing newline. A real, small regression. Fixed. |

1 + 1 + 10 + 1 = 13. Every deletion is accounted for. Nothing is unexplained.

### Deletion 1 is the opposite of a loss

`PostgrestVersion` moved from `14.15` to `14.5`, which looks like a downgrade and
would be a Law 9 concern if it were one. It is not. The repository already
documents the exact fact, at `scripts/ci/types-drift-analyse.mjs:576`:

> on 21 August 2026 TEST reported 14.15 and production 14.5

So the previously committed file was generated against **TEST**. The new file is
generated against **production**, which is what the brief asked for. The value
moving to 14.5 is the evidence that the file now comes from the right project.

The guard ignores that one path deliberately, and says why in its own source: it
records infrastructure rather than schema, it moves when Supabase upgrades their
own estate, and no migration could ever explain it.

### Deletion 13 was a genuine defect, and the commit count proves the fix

The generator dropped the end-of-file newline. No lint rule enforces `eol-last`
in this repo, so nothing would have caught it. I restored it before committing.

The proof is arithmetic: the brief described the diff as 88 insertions and 13
deletions. The commit landed as **87 insertions and 12 deletions**, because with
the newline restored the final comment line is unchanged and is no longer counted
as a delete plus an add. That is deletion 13 confirmed by construction.

## What the 88 insertions actually brought

Not cosmetic. Real schema the application already calls:

- `discount_code_claims` table, with both foreign keys.
- `discount_codes.reserved_uses` column.
- `stored_aggregate_drift` view.
- Eight functions: `claim_discount_use`, `convert_discount_claim`,
  `release_discount_claim`, `release_expired_discount_claims`,
  `increment_discount_uses`, `increment_sold_count`, `transfer_ticket_for_order`,
  and the reservation helpers.

## Verification

- `npx tsc --noEmit` exits 0.
- Pre-push gate ran typecheck, lint and the full suite: 246 files, 2964 tests,
  0 failed, 0 skipped.
- PR #122 `types-drift guard`: **pass, 1m21s**. `test (vitest)`: pass.
  `Resolve Vercel preview`: pass. `Vercel`: pass.
- The job LOG body could not be read while the run was still in progress
  (`gh` returns "logs will be available when it is complete"). The check status
  is authoritative and green; I will read the log body at the finishing gate
  rather than claim now that I have seen it.

## Two incidental findings from this task

**F1. The Law 8 commit-msg hook has a false positive on the word "regenerated".**
The hook substring-matches "Generated with". My first commit message contained
"Re**generated with** supabase CLI 2.116.0" and was rejected. The guard is
behaving conservatively, which is correct for an authorship law, so I rephrased
my message rather than widening the guard. Recorded because the next person to
write the obvious commit message for a types regeneration will hit it too.
Not a defect I am fixing without a ruling: loosening a Law 8 guard to permit a
substring is exactly the kind of change that should need the founder.

**F2. `caniuse-lite` is 6 months stale.** The pre-push build printed
`Browserslist: browsers data (caniuse-lite) is 6 months old`. This is a Law 9
signal (current by default, never backwards): a stale browser matrix silently
changes what gets transpiled and what autoprefixer emits. Not fixed inside Task 1
because it is not a types change and I am not mixing it into that commit.
Carried into Task 6 as an extra item.

**F3. The repository has NO `.gitattributes` at all.** Confirmed by direct check.
This is the root cause of Task 6b (the four phantom LF versus CRLF files) and is
also why git printed `LF will be replaced by CRLF` on the types file. Fixed in
Task 6.

---

# TASK 2. THE CORRUPTED PROPER NOUNS

**State: DONE.** Commit `aecdff36`. 48 occurrences found, 43 fixed, 5 held for a
founder ruling. New blocking guard `proper-nouns-intact`, proven both ways.

## What was actually wrong

A find-and-replace of the banned word did not stop at EventLinqs' own voice. It
rewrote the NAMES of real Australian organisations. 48 occurrences across 8
files, in three classes that need three different fixes:

| Class | Count | Fix |
|---|---|---|
| Proper nouns (real bodies) | 21 | Restore the real name, verified by research |
| Adjectival, EventLinqs' own voice | 22 | Reword. The ban still binds here |
| Reverse names a body I cannot confirm | 5 | Do NOT guess. Held for a ruling |

**Why the classes matter.** The founder ruling exempts PROPER NOUNS. It does not
exempt the adjective. So "multicommunity worship crowd" could not simply be
reversed to "multicultural", because that is EventLinqs describing its own
audience and the ban applies. Those 22 became "diverse" or plain English.

## The collision I had to resolve first

`scripts/guards/no-banned-word-anywhere.mjs` enforces a zero-match rule for the
banned letters across `src`, `scripts` and `supabase/seed`. Restoring
"Multicultural Council of Tasmania" FAILED that guard, on 16 lines.

Resolved by making the exemption an exact registered STRING rather than a file
or a count. The registered name is stripped from the line before the line is
tested, so a second, unregistered use of the word on the same line still fails.
That is tighter than the guard's existing "excuses a count, not a file" rule,
which is the principle its own header argues for.

## The seven names, every one confirmed against the organisation's own page

| Restored name | Source |
|---|---|
| Multicultural Council of the Northern Territory | mcnt.org.au |
| Multicultural Council of Tasmania | mcot.org.au |
| National Multicultural Festival | ACT Government, 28th edition 6 to 8 Feb 2026 |
| Multicultural Neighbourhood Centre (Lambton) | mycommunitydirectory.com.au |
| Illawarra Multicultural Services | ims.org.au |
| Multicultural Services Centre (of WA) | mscwa.com.au |
| Australian GLBTIQ Multicultural Council | pridecentre.org.au |

**One was wrong twice over.** The repository carried "Australian LGBTIQ+
Multicommunity Council". The body at the Victorian Pride Centre is the
**Australian GLBTIQ Multicultural Council**. The acronym was already wrong
BEFORE the find-and-replace touched it, so a mechanical reverse would have
published a second wrong name. This is exactly the case the brief warned about.

## The five I would not guess

For each, the reverse produces a body I could not confirm exists.

| Corrupted text | What I actually found |
|---|---|
| Queensland Multicommunity Festival, "each August" | The Queensland Multicultural Festival ended in 2011. The real August event is **Multicultural Queensland Month** (dwatsipm.qld.gov.au) |
| Tropical North Queensland Multicommunity Centre | No such body. Cairns has **CARMA** and a Cairns Community and Multicultural Centre under construction |
| Newcastle Multicommunity Centre | No such venue. Newcastle has the **Multicultural Neighbourhood Centre** and **Hunter Multicultural Communities** |
| Geelong Multicommunity Centre | No such body. Geelong's is **Cultura** (ex Diversitat, merged with MACS) |
| Darwin Multicommunity Centre | No such venue. Darwin has the **Malak Community Centre** |

I did not substitute these real names into the copy, and that is deliberate. The
sentences assert that a specific festival happens at a specific venue on a
specific cadence. Swapping in a different real organisation would make an
unverified claim about a real body, which is worse than the corruption.

## THE BIGGER DEFECT THIS UNCOVERED

Rendering the page rather than reading the template found something worse than
the names.

**Every community-by-city heading lowercased the community name.** The live page
said:

> Where aboriginal and torres strait islander Sydney happens

All 21 display names are proper adjectives. None may be lowercased, and
lowercasing First Nations identity on a public page is the kind of thing that
ends a conversation with a community organiser. `CLAUDE.md` puts First Nations
first by law.

Fixed at three template sites plus the fallback editorial, which is the copy the
majority of these pages actually serve. Fixing the case also exposed a second
bug underneath: "has a african community" is ALSO wrong article agreement, and
capitalising alone would have produced "a African community". One template
cannot agree with both "a Greek community" and "an African community", so the
sentences were rephrased to drop the article entirely. Slug matching and SEO
keywords still lowercase, correctly.

## Verification

- 24 renders: 8 routes at 390, 768 and 1440, asserting on VISIBLE BODY TEXT
  rather than HTML source. 0 failures. Screenshots in
  `docs/verification/proper-nouns-2026-09-03/`.
- All 21 communities checked for the capitalisation regression. 0 remaining.
- Guard proven FAIL (re-corrupted one name, exit 1, caught by two independent
  checks) and PASS (exit 0). Both outputs captured.
- All 57 guards pass, `tsc --noEmit` exit 0, lint exit 0.

---

# TASK 2b. THE ORPHANED COMMUNITY EDITORIAL

**State: DONE.** Commit `4a7c87cc`. New blocking guard
`community-editorial-reachable`, proven both ways.

## The finding

`src/lib/communities/intersection-editorial.ts` holds **271 hand-written
city-by-community paragraphs**, keyed on community taxonomy **V1**. The site
runs **V2** (21 slugs), and V1 slugs 301 away to their V2 replacement.

**211 of the 271 paragraphs, 78 percent, reached no page at all.**

Nothing reported it, and that is the important part. `getIntersectionEditorial`
falls back to a templated paragraph when the key misses, so every page still
returned 200 and still looked finished. The bespoke copy that is meant to be the
SEO differentiator on 441 of the 552 sitemap URLs was simply absent, and the
fallback is what stopped anyone noticing.

## What I fixed, and what I refused to

**FIXED, because both are mechanical and carry no content judgement:**

1. **A live 404.** `/community/pacific/<city>` returned **404**. `pacific` was
   the ONLY retired slug in `redirects.ts` with no redirect entry, against that
   file's own stated contract of zero 404s and against Law 5. Now 308s.
2. **A 1:1 rename never applied.** V2 renamed `pacific` to `pacific-pasifika`.
   Its 20 paragraphs were rekeyed. Reachable editorial **60 to 80**.

**NOT FIXED, deliberately.** The other 191 are not a rename:

| Prefix | Entries | Why it is orphaned |
|---|---|---|
| south-asian, east-asian, mediterranean, middle-eastern, european, latin | 119 | V1 regional ROLL-UPS. Founder Decision C retired them as landing pages, keeping them as discovery filters |
| gospel | 18 | Not a heritage in V2. Moved to the Faith dimension |
| comedy, wellness | 36 | Not heritages. Event types |
| pride | 18 | Not a heritage. An identity |

Rekeying "South Asian Melbourne" onto the Indian page would publish claims about
Pakistani, Sri Lankan and Nepali communities on a page about Indian ones. That
is a content decision for Lawal, not a mechanical rename, so they are enumerated
with the decision that retired each one and left for a ruling.

## Verification

- `/community/pacific/<city>` 308s to `/community/pacific-pasifika/<city>` for
  five cities. Previously 404.
- The bespoke "Mt Druitt and Blacktown hold the Samoan and Tongan families"
  paragraph is confirmed present on the rendered page.
- Guard proven FAIL on an undeclared orphan AND on a stale declaration, then
  PASS. All 57 guards pass.

## A process failure worth recording

My first attempt to verify the pacific fix reported it still broken. The cause
was NOT the code: a server from the previous session still held port 3100, my
new server died with `EADDRINUSE`, and I was reading a stale build. I only found
it because the result disagreed with the source, and I checked the port instead
of believing the output.

Had it gone the other way, I would have reported a PASS I never observed. The
kill filter used `Get-Process ... CommandLine`, which Windows does not populate
for `Get-Process`, so it silently matched nothing. Now killing by PID and
asserting the port is free before trusting any page result.

## Two environment findings

**F4. The parking block is not crash safe.** The previous session was
interrupted mid-push and left `.env.local.parked` on disk with no `.env.local`.
Every later command that needed it failed with a confusing "not found". My
`push-sweep-log.sh` now recovers a stranded file before it does anything else.
The founder's own one-liner has the same hole: if the shell dies between the
move and the `finally`, the file stays parked.

**F5. `npm run build` cannot run locally without exporting `.env.local` first.**
`next build` reads it automatically but the `prebuild` guards do not, so
`curated-categories-exist` fails with "no Supabase URL or key in the
environment". Not a defect in CI, where the values are real environment
variables, but it makes a clean local build look broken.
