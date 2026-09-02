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
| 4 | Mobile Lighthouse 95 | DONE, but 95 NOT MET. Ceiling 0.80 on /. Founder ruling needed |
| 5 | Full Scope v5 audit, 18 sections | DONE. 4 BUILT, 10 PARTIAL, 4 NOT BUILT |
| 6 | Remaining known defects, a to h | DONE. Found a launch blocker: the door refused 23.4% of tickets |
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

---

# TASK 4. MOBILE LIGHTHOUSE

**State: DONE as an investigation and a partial fix. THE 95 TARGET IS NOT MET,
and I am not going to claim it.** Commit `4c3892fa`.

## The honest headline

**Mobile 95 is not reached on the homepage, and the reason is not the one in the
brief.** Measured ceiling on the homepage today: **0.80**.

| Path | Before | After | LCP after | Target |
|---|---|---|---|---|
| `/` | 0.80 | 0.78 | 4712ms | 0.95 |
| `/events` | 0.88 | 0.88 | 3824ms | 0.95 |
| `/pricing` | 0.93 | 0.93 | 3198ms | 0.95 |

Median of 3, mobile, warmed, localhost production build. My harness reproduces
the founder's reported 79 / 90 / 93 almost exactly (0.80 / 0.88 / 0.93), so it
is measuring the same thing he is.

## The brief's diagnosis is wrong, and here is the proof

The premise was that 18 of 20 homepage images are optimised on demand, so a cold
request pays a remote fetch plus an AVIF encode before anything paints.

**`/pricing` carries ZERO images, and still has LCP 3.2s.** Its LCP element is an
`H1` reading "Simple. Transparent. Fair.", confirmed by a PerformanceObserver in
a real throttled browser. A page with no images cannot have an image-optimiser
problem, so the shared floor is something else entirely.

Three further facts close it off:

1. **The images are already excellent.** 17 fetched on mobile, 268 KB total,
   hero a **33 KB AVIF at w=750**, correctly lazy below the fold.
2. **Warming already exists.** `scripts/ci/warm-preview.mjs` was added on
   25 August and pulls every `/_next/image` variant before the gate measures.
   Option (b) in the brief was built a week ago. Option (c) has nothing to give
   against a 33 KB hero.
3. **The real homepage count is 113 images, not 20**, with 1,677 optimiser URLs.

## What is actually expensive

Main-thread breakdown, homepage, mobile:

| Bucket | Time |
|---|---|
| other | 954ms |
| **styleLayout** | **923ms** |
| scriptEvaluation | 666ms |
| paintCompositeRender | 210ms |
| **parseHTML** | **116ms** |

Total main-thread work **3.0 s**. JavaScript and CSS total **742 KB** across 15
files, the largest chunk 236 KB and a 166 KB stylesheet.

The cost is **laying out 113 image cards and evaluating 742 KB of JS/CSS**. No
amount of image work reaches it.

## What I changed, and the fact that it did not work

The candidate width lists carried 9 device widths and 8 image widths. Each is
emitted into the srcset of every image that can use it, at about 208 characters
per URL, because each carries a percent-encoded absolute storage URL. On the
homepage that was **348,045 characters, 34% of the entire document**.

Trimmed to 6 and 6, keeping the mobile LCP band intact:

| Measure | Before | After |
|---|---|---|
| HTML | 1,023,683 chars | 912,760 (down 11%) |
| `/_next/image` URLs | 1,677 | 1,162 (down 31%) |
| srcset bytes | 348,045 | 240,927 (down 31%) |
| candidates per image | 12.8 | 8.6 |
| gzip over the wire | 70 KB | 66 KB |

**The Lighthouse score did not move.** 0.78 / 0.88 / 0.93 against 0.80 / 0.88 /
0.93, inside run noise. I am recording that as a null result rather than dressing
it up: `parseHTML` is 116ms of a 3.0s main thread, so removing 111 KB of markup
was never going to be worth much, and the measurement confirms that instead of
flattering it.

**I kept the change anyway, for a reason that is not the score.** 31% fewer
distinct variants is 31% less work for the optimiser to generate and for the warm
pass to cover, and that cost is paid by the first real visitor after every
deploy, which is exactly what the brief was worried about.

**No regression:** the hero is still served at `w=750` (dropping that width would
have pushed a 412px phone up to 828 and made the LCP image BIGGER), and 507 image
elements across 4 routes at 390, 768 and 1440 render with zero broken and zero
optimiser 4xx.

## What would actually close the gap, precisely

In order of leverage, all measured rather than guessed:

1. **Render fewer cards in the initial homepage document.** 113 image cards cost
   923ms of styleLayout on a throttled mobile CPU. This is the single biggest
   bucket. **It collides head on with the market-ready volume law** ("every rail
   full and balanced", "no empty sections"), so it is a founder decision, not an
   engineering one. The evidence that document weight tracks score is on the
   record: 178 KB / 0.93, 421 KB / 0.88, 1,024 KB / 0.80.
2. **Cut the 742 KB of JS and CSS.** `CLAUDE.md` already names the ~209 KB
   pre-load client shell as an honest close and it is still open. 666ms of
   scriptEvaluation plus 0.7s of bootup sits behind it.
3. **Shorten the image URLs.** Each is ~208 chars because it embeds a
   percent-encoded absolute Supabase URL. A rewrite serving them from a short
   local path would cut roughly another 130 KB from the document. Given result
   above, expect this to help the optimiser and the warm pass, NOT the score.

## THE TENSION THE FOUNDER HAS TO RULE ON

Two laws in the constitution are in direct conflict on the homepage:

- **The market-ready completeness bar** demands every rail full, national
  density, no empty sections. That is what produces 113 cards.
- **Lighthouse 95+ on mobile** is law and non-negotiable per this brief.

On a simulated 1.6 Mbps / 4x-CPU mobile profile you cannot have both. Every
image is already AVIF, already sized correctly, already lazy, already warmed. The
remaining cost is the DOM and the bundle. Something has to give, and which one
gives is not my call.

## A measurement trap worth recording

`scripts/perf/lh-local-median.mjs` is added as a kept tool. Two things it
encodes, both learned the hard way today:

- **Driving Lighthouse with Playwright's bundled Chromium fails every
  navigation** with `FAILED_DOCUMENT_REQUEST / net::ERR_ABORTED` and reports a
  null performance score on every URL, including a page with no images. That
  reads exactly like three broken pages and is not: Playwright itself loads the
  same URL 200. It needs a REAL Chrome. I nearly reported a catastrophe that did
  not exist.
- It reports the **median**, not the best run, because the CI gate aggregates
  with `optimistic` (which is `Math.max`) and reading that as a median has
  already cost this project hours once, per `lighthouserc.json`'s own note.

---

# TASK 5. THE FULL SCOPE v5 AUDIT

**State: DONE.** Full document at `C:\dev\SCOPE-AUDIT.md`, pushed to
`ops/session-log`. All eighteen sections audited by reading the code and the
production schema, not by guessing.

**Tally: 4 BUILT, 10 PARTIAL, 4 NOT BUILT.**

| Verdict | Sections |
|---|---|
| BUILT | 3.2 Group ticketing, 3.3 Dynamic pricing, 3.7 Payment and checkout, 3.18 Admin panel |
| NOT BUILT | 3.5 SmartLinq, 3.6 Gamification, 3.8 Resale, 3.15 Sustainability |
| PARTIAL | the other ten |

## The two findings nobody had on a list

**1. A virtual event sells a stream link the buyer can never see (3.11).**
`events.virtual_url` is captured by the organiser form and saved, and it is
surfaced NOWHERE to a ticket holder. Searching `src/app/tickets`,
`src/app/orders` and `src/app/events` for it returns nothing. Small fix, real
defect, blocks launch the moment one virtual ticket is sold.

**2. The door scanner has no offline mode (3.13).** No IndexedDB, no cached
validation set, no offline queue, and no Supabase Realtime channel anywhere in
`src` for multi-scanner sync. The scope itself calls offline "critical for
outdoor events and venues with poor signal" and specifies a 50,000 ticket local
cache. A door with no signal cannot admit anybody, on exactly the outdoor and
community events being recruited this week.

## Three scope claims that are false today

Remove from any pitch until built: **Meilisearch** instant typo-tolerant search
(it is Postgres `ilike`), **multi-language UI** (no i18n of any kind, English
only), and **PostHog conversion analytics** (PostHog appears nowhere in `src`, so
the scope's own definition of conversion cannot be computed).

## What is genuinely good

The commerce spine is real and coherent: checkout, squads, reserved seating with
**accessible seat and companion auto-selection**, discount codes, payouts,
refunds, disputes, the single-source fee system, and twenty admin surfaces behind
RBAC and an audit log.

**The data-ownership promise is real.** `/dashboard/events/[id]/attendees/export`
serves CSV, Excel and PDF, with the ownership statement on the page. That is the
second blade of the wedge and it works.

**No false promise on resale.** I checked deliberately, because 3.8 is not built.
The only mentions in the product are in the legal pages and both PROHIBIT resale
above face value under Australian law. Nothing sells a marketplace that does not
exist.

---

# TASK 6. THE REMAINING KNOWN DEFECTS

**State: DONE, all eight, plus one carried finding.** Commits `e1ae6b3a`,
`78b69e8d`, `671a910c`, `9b0530cc`, `c8e43141`, `a3242249`.

**And it turned up the worst defect of the whole sweep.** See 6d.

| Item | State |
|---|---|
| a. Stale test baseline | DONE, raised three times as the sweep added tests |
| b. Phantom LF/CRLF modifications | DONE, `.gitattributes` created |
| c. Test suite writes into tracked files | DONE, gated behind a flag |
| d. Journey harness j6 and j7-seated | DONE, **and it found a launch blocker** |
| e. Journey screenshots overwriting | DONE, namespaced per viewport |
| f. Dishonest Publish button | DONE |
| g. Ruling R3 half enforced | DONE, six live findings reported |
| h. Payout tiers 2 and 3 | DONE, confirmed manual and documented |
| F2. `caniuse-lite` six months stale | DONE, refreshed |

---

## 6d. THE DOOR REFUSED ONE TICKET IN FOUR

This is the most serious thing found in the entire sweep, and it was found only
because fixing the harness made journey 6 runnable for the first time.

**Two alphabets had drifted apart:**

| Source | Alphabet | |
|---|---|---|
| `gen_ticket_code()` in the ticketing migration | `23456789ABCDEFGHJKMNPQRSTUVWXYZ` | emits **U**, never L |
| `src/lib/scanner/parse-qr.ts` | `ABCDEFGHJKLMNPQRSTVWXYZ23456789` | rejects **U**, allows L |

**Measured against 128 real tickets: 30 of them, 23.4 percent, could not be
admitted at the door AT ALL.** The only offending character was `U`. That matches
the `1 - (30/31)^8` the two alphabets predict, so it is not a sampling artefact.

**It failed on both paths.** `parseScan` and `parseManual` share one validity
check, so presenting the QR code was refused exactly like typing the code by
hand. Roughly one ticket holder in four would have arrived at a door with a
valid ticket and been told their code was invalid.

**Bounded blast radius, and I checked:** the bearer ticket page `/t/[code]` does
not use this parser, so buyers could always SEE their ticket. They simply could
not get in.

**Nothing caught it.** Each file was internally consistent and looked correct on
its own. The defect lived in the space between them, which is exactly why no test
existed. The new test reads the alphabet **out of the migration** rather than
restating it, so it cannot drift with the thing it checks. Proven both ways:
against the old regex it fails with "the door rejects 1 character(s) the database
can issue: U", and passes against the fix.

**Driven end to end after the fix:** first scan **ADMIT** with the holder name,
second scan **REJECT, "Already used just now"**. Zero blockers.

### Why it was never found: j6 could not be run

j6 required three arguments (ticket code, secret, event id). No runner can know
those, so it exited in under a second and reported nothing. **The door, the one
place where a mistake means a stranger walks in on someone else's ticket, was the
single journey never actually driven.**

It now finds a ticket for itself. It reads the organiser's OWN event list from
the dashboard first, then looks for a ticket on one of those events, because an
earlier version picked any seed ticket and hit "You do not have permission to
scan tickets for this event" (the product being right, the harness being wrong).
Scanning CONSUMES a ticket and `.env.local` points at production on purpose, so
discovery calls `assertNotProduction()` before it reads anything.

### j7-seated hung for 622 seconds on one missing parameter

`j7-seated.mjs` already called `finish(j, browser)`. `finish` took **one**
argument, so the browser was ignored and never closed. Playwright keeps live
handles, so the process printed a complete and correct verdict and then hung.

It was the **only** journey that did not call `browser.close()` itself; the other
twelve all do. The caller's intent was right and the signature was wrong.

---

## 6a, 6b, 6c. The tree stops dirtying itself

**The repo had NO `.gitattributes` at all.** With `core.autocrlf = true`, git
checks files out as CRLF while the tests rewrite them as LF. Measured before the
fix: 14, 11, 7 and 230 carriage returns in the four files.

A permanently dirty tree is not cosmetic. It teaches everyone to ignore
`git status`, and an ignored `git status` is how an unintended change eventually
rides along in someone else's commit.

Fixed in **both** halves, because either alone leaves the hole open:
1. Writes gated behind `WRITE_PROOF_ARTEFACTS=1`. Every assertion still runs.
   None of the five call sites reads its own artefact back as a baseline, checked
   before gating, so the artefact is a report and never an oracle.
2. `.gitattributes` pins those paths to `eol=lf` so a regenerated artefact
   matches what is checked out.

**Verified both directions:** flag off, full suite green and none of the four
files in `git status`; flag on, artefacts regenerate **and the tree still comes
back clean**, which is the `.gitattributes` half proving itself.

One assertion had to change honestly: `organiser-copy-review` asserted OUTPUT.md
*exists*, true on every run for the wrong reason (the file is tracked). With the
write gated it would have been checking git rather than the code.

**Suite:** 248 files, 2977 tests, all passing with `.env.local` parked. With it
present, five tests in one file fail, all `--env-file` approval tests. That is the
pre-existing interference the pre-push hook already parks around, proven by the
same tree passing both ways depending only on whether that file is on disk.

---

## 6f. The Publish button now looks as blocked as it is

Disabled only for `isSubmitting`, empty title, missing cover. An organiser with a
paid tier and no Stripe saw a live gold Publish button, pressed it, and was
refused server-side.

**This is presentation, not a guard.** `checkPublishGate` still decides and still
re-reads Stripe before refusing. Three protections stop it inventing a refusal:
`canSellPaid` defaults to true; a **failed read** resolves to true, not false;
edit mode never blocks.

That middle one was caught by the `one-sellability-source` guard on my first
attempt, which is the guard doing its job: destructuring only `data` turns a
transient read failure into "connect Stripe" shown to an organiser whose Stripe
is fine. **That is the exact shape that refused every paid event in production on
18 August 2026.**

**Honest gap:** I did not photograph the disabled button. Reaching Publish means
completing a seven-step wizard with a paid tier and my automated walk did not get
there. The decision logic is proven by 8 unit tests (six of which pin the ways it
must NOT block); the wiring by the build and all 57 guards. I did drive the
surrounding change on TEST, restricting the session's organisation and restoring
it, with the restored value read back and confirmed.

---

## 6g. Ruling R3, the six findings for Lawal to act on

R3 names `GOOGLE_MAPS_API_KEY` in its **own** evidence table: *"NO. A billable key
with no test mode."* Yet one line in the manifest said `mustBeSensitive: false`,
and that line is the entire permission for the key to sit readable on
Development. Both keys are now `true`.

**The six findings, with the fix the checker prints for each:**

| Variable | Scope | Finding |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | production | readable in plain text, must be SENSITIVE |
| `GOOGLE_MAPS_API_KEY` | preview | readable in plain text, must be SENSITIVE |
| `GOOGLE_MAPS_API_KEY` | development | a SECRET on a scope that cannot hold one |
| `PEXELS_API_KEY` | production | readable in plain text, must be SENSITIVE |
| `PEXELS_API_KEY` | preview | readable in plain text, must be SENSITIVE |
| `PEXELS_API_KEY` | development | a SECRET on a scope that cannot hold one |

**WORSE THAN "A VALUE ON DEVELOPMENT".** The generated snapshot records a
per-scope fingerprint, and for both variables it is **identical across all three
scopes**: `3dcc7ad8` for Maps, `d78fb89b` for Pexels. The Development copy is not
a separate development value. **It is the same billable production key, sitting
readable on the one scope the platform cannot protect.**

Commands: `vercel env rm <NAME> development` for the Development copies. For
production and preview, remove and re-add with `--sensitive`, because `--force`
does NOT change an existing record's sensitivity.

**CI stays green, and I checked rather than assumed.** The env-locks workflow
runs the break-restore rehearsal (24 of 24 pass with this change) and
`check-env-stores --mode=handshake` (the CRON bearer only). The full store scan
needs a live Vercel read and is not a CI step, so this surfaces the finding
without turning the branch red on something only the founder can fix.

Also reported, untouched, pre-existing: `CRON_SECRET_CROSS_STORE` says the Vercel
Production copy and the GitHub Actions copy are the **same** secret.

---

## 6h. Payout tier promotion is manual, confirmed

The schema has everything an engine would need: `payout_tier` (tier_1/2/3),
`total_event_count`, `total_volume_cents`, `tier_progression_log`. **The
thresholds those columns exist to serve, $50,000, $250,000 and five events,
appear nowhere in the repository.**

The only writer is the Stripe `account.updated` handler, and it only ever writes
`tier_1`, the ENTRY tier. It logs that with `reason: 'auto_promotion'`, which
**reads like a promotion engine and is not one**. No code path can produce
`tier_2` or `tier_3`, so every organisation stays on tier_1 for ever unless a
human edits the row, and the tier selects the payout schedule and on-demand
eligibility.

**Not implemented, on purpose.** Automatic promotion changes when an organiser is
paid and what reserve is held against them. That is a founder decision about
money, and inventing the thresholds would be exactly the guess this project's
laws forbid. Recorded at the point of use in `src/lib/payouts/queries.ts` so the
next reader does not assume the engine exists.
