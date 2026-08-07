# ROAST LEDGER: DISCOVERY-SURFACE-INVENTORY

Task: audit every discovery surface on EventLinqs and write
`docs/strategy/DISCOVERY-SURFACE-INVENTORY.md`.
Date: 8 August 2026. Audit base `origin/main` at `1888ece`.
Two rounds, both recorded in full below.

---

## PHASE 1: THE REQUIREMENT LEDGER

Decomposed verbatim from the founder's brief, before adjudicating.

### Conduct and scope

| # | Requirement |
|---|---|
| C1 | Change no code |
| C2 | Produce a document |
| C3 | Do not touch `feat/launch-kit-moat` |
| C4 | Work read only from `origin/main` |
| C5 | Read the three context docs first |
| C6 | Do not repeat the three context docs' work |
| C7 | Australian English |
| C8 | No em dashes, no en dashes |
| C9 | Use "community", never the banned alternative |
| C10 | Distinguish evidence from inference **in every section** |
| C11 | Cite file paths for **every** claim about the code |
| C12 | Where something cannot be determined, say so plainly rather than filling the gap |
| C13 | Never name a competitor in customer-facing copy (internal doc, so names permitted) |
| C14 | Never infer from a filename |
| C15 | Verdict per surface: BUILT AND WIRED / BUILT BUT NOT WIRED / ABSENT |
| C16 | Commit the document only. Do not merge. Do not touch any other branch |
| C17 | Run brief-roast hostilely against my own work, fix what it finds, run a second round, report both |

### The five questions to answer for EVERY surface

| # | Requirement |
|---|---|
| E1 | Does it exist |
| E2 | Is it wired to anything, or a page that renders and leads nowhere |
| E3 | What populates it, and what happens when that source is empty |
| E4 | Can a newly published event actually reach a stranger through it |
| E5 | What breaks or looks broken with zero users |

### The twelve named surfaces, plus any found

| # | Surface |
|---|---|
| S1 | City pages: do new events surface, ordering, zero-event state |
| S2 | Community pages, same questions, around 21 communities |
| S3 | The homepage rail and any category rails |
| S4 | Search: what is indexed, what a buyer can find |
| S5 | `/events` browse and any filtering |
| S6 | Weekly city digest: what it sends, to whom, how often, what governs inclusion |
| S7 | `notify-just-announced`: confirm follower-based, state what would make it useful |
| S8 | Repeat-buyer notification |
| S9 | Squads, waitlists, founding invites: discovery, retention, or neither |
| S10 | SEO: sitemap, structured data, canonicals, indexability, `/guides` JSON-LD domain |
| S11 | Open Graph and share previews on **every** public surface |
| S12 | **Any** notification, email or push path that could put an event in front of somebody |
| S13 | Any surface found that the founder did not list |

### The three questions and the deliverable

| # | Requirement |
|---|---|
| Q1 | The day one picture: all the ways a Geelong stranger could encounter an event, concrete and honest |
| Q2 | The first ten organisers: what the platform honestly delivers today with evidence, plus shortest credible path to something worth telling organiser fifty |
| Q3 | The empty state problem: what each surface shows when empty, which would make a stranger leave |
| D1 | Written to `docs/strategy/DISCOVERY-SURFACE-INVENTORY.md` |
| D2 | One page executive summary the founder can act on without reading the rest |
| D3 | Then the full inventory |
| D4 | Then the three questions answered |

---

## ROUND 1: ADJUDICATION

Adjudicated against the document as first written, before any fixes.

| # | Verdict | Evidence or what remained |
|---|---|---|
| C1 | MET | No source file modified. `git status` shows only the two new docs |
| C2 | MET | `docs/strategy/DISCOVERY-SURFACE-INVENTORY.md` |
| C3 | MET | Branch read via `git show feat/launch-kit-moat:<path>` only. No checkout, no write |
| C4 | MET | Audit base stated. The 19 local commits ahead of `origin/main` were diffed by name and confirmed to touch no discovery file; the three exceptions were read via `git show origin/main:<path>` |
| C5 | MET | All three read |
| C6 | MET | Their Part G is cited as theirs and extended, not restated |
| C7 | MET | Checked: no `-ize`, no `-or` for `-our`, no US spellings |
| C8 | MET | `node` count over the file: em-dash 0, en-dash 0 |
| C9 | MET | Zero matches for the banned word family |
| C10 | **PARTIAL** | Labelled in sections 2.1, 2.4, 2.12 and Part 5. Sections 2.9 and 2.13 and parts of Part 3 carried no labels |
| C11 | **PARTIAL** | Four claims cited a path with no line number and no read: `src/lib/broadcast/share-links.ts`, `src/lib/payments/`, `src/app/squad/[token]/`, the `squad-expire` cron |
| C12 | MET | Part 5 lists five undeterminables |
| C13 | MET | Names appear only as internal research context |
| C14 | **NOT MET** | The squad verdict and the ticket-waitlist cron cadence were asserted from route and cron NAMES without opening the files. This is the exact thing the brief forbade |
| C15 | MET | Every surface carries one of the three verdicts |
| C16 | Pending at round 1 | Not yet committed |
| C17 | In progress | This ledger |
| E1 | MET | Every surface's existence confirmed by opening a file |
| E2 | MET | |
| E3 | MET | |
| E4 | **PARTIAL** | Answered explicitly for city, community, `/events`, digest and just-announced. Left implicit for search, categories, SEO, OG and the email paths |
| E5 | MET | Q3 covers it surface by surface |
| S1 | MET | Section 2.2 |
| S2 | MET | Section 2.3 |
| S3 | MET | Section 2.1 |
| S4 | **PARTIAL** | "no full-text index in play on this path" was an inference, not read. Not verified against migrations |
| S5 | MET | Section 2.6 |
| S6 | MET | Section 2.7 answers what, to whom, how often, and what governs inclusion |
| S7 | MET | Section 2.8, confirmed plus three ranked options |
| S8 | MET | Section 2.10, ABSENT with evidence |
| S9 | **PARTIAL** | Waitlist and founding invites verified by reading. Squads adjudicated from filenames |
| S10 | MET | Section 2.11, including the `/guides` domain defect with the canonical host named |
| S11 | **NOT MET** | The brief said EVERY public surface. I audited event, homepage, city and community, then wrote "Everything else shares the site default" without sweeping. That sentence is an assertion, not an audit |
| S12 | **NOT MET** | The brief said ANY path. I never enumerated `sendEmail` call sites. Three real paths were missing |
| S13 | **NOT MET** | I found several unlisted surfaces but missed the biggest one: the buyer acquisition loop on the order confirmation page |
| Q1 | **PARTIAL** | The list of encounter paths omitted the printed QR poster from the Launch Kit, and omitted buyer-to-buyer sharing |
| Q2 | **PARTIAL** | The "deliverable today" list omitted the acquisition loop, which is one of the strongest true things the platform has |
| Q3 | MET | Eleven surfaces ranked, with the pattern named |
| D1 | MET | |
| D2 | **PARTIAL** | The summary is roughly 130 lines. Defensible as a summary, not literally one page |
| D3 | MET | |
| D4 | MET | |

**Round 1 count: NOT MET 4, PARTIAL 9.**

---

## ROUND 1: ADVERSARIAL PASS

**Silent drops.** One severe. The **buyer acquisition loop is entirely absent
from the document.** `EventShareBar` renders on the order confirmation page
(`src/app/orders/[order_id]/confirmation/page.tsx:9`) minting tracked links
through `/api/broadcast/share-link` with a WhatsApp intent and a copy action
(`src/components/features/events/event-share-bar.tsx:69`, `:100-101`, `:171`),
share conversions are attributed back to the originating link
(`confirmation/page.tsx:76-80`), there is a seated "share your seat" invite
(`:339-340`), and the invite-an-organiser prompt is on the same page with
`via=organiser-invite` attribution (`:377-382`). Both halves of the growth
doctrine's acquisition loop are built, wired, and were not mentioned once.

**Interpretation drift.** Found, twice.
- "Open Graph on every public surface" was quietly narrowed to "Open Graph on
  the surfaces I had already opened". The convenient reframing WAS the failure.
- "Any notification, email or push path" was narrowed to "the paths I already
  knew about" instead of enumerating `sendEmail` call sites, which takes one
  command.

**Conclusions that flatter the platform.** One found, and it is subtle: I treated
`broadcast_share: true` as "on by default" stated as fact, while treating
`broadcast_digest: false` as "the DB row is the source of truth and I did not
query it". Both are seeded defaults in the same object
(`src/lib/flags/broadcast.ts:47-54`) with the same epistemic status. Applying the
strict standard only to the flag that produces the bad news is exactly the bias
the roast is for.

**Conclusions that flatter in reverse.** Also found: by omitting the acquisition
loop I made the platform look weaker than the code is. Under-reporting is the
same completeness failure as over-reporting.

**Assertions from a filename.** Three: the squad page verdict, the squad-expire
cadence, and the `src/lib/payments/` fee citation. The first two are now verified
by reading (`src/app/squad/[token]/page.tsx:40-44`,
`src/app/api/cron/squad-expire/route.ts:11-32`); the third is replaced with a
citation to a file I actually read.

**The unverifiable claim hunt.**
- "The category landings are almost always empty" - falsifiable by loading
  `/categories/music` against TEST. NOT tested. It is flagged INFERENCE and the
  mechanism (`limit(6)` before the filter) is EVIDENCE. Kept, with the label.
- "Nine of twelve Sounds tiles resolve to empty" - falsifiable the same way. NOT
  tested. Flagged INFERENCE. Kept, with the label.
- "No page ships a broken preview" - I could not falsify this at round 1 because
  I had not swept the pages. Now swept. Claim corrected rather than deleted.
- "The SEO compounding engine is genuinely complete" on event pages -
  falsifiable by an auth gate or a noindex. Now tested: `/events/[slug]` uses
  `createPublicClient`, ISR 300, hard `notFound()`, no session read
  (`src/app/events/[slug]/page.tsx:1`, `:84`, `:111`, `:235`). Claim survives.

**The generic test.** The document could not belong to another product: every
finding is tied to an EventLinqs file path and to the constitution's own laws.

**The AI-tell sweep.** Run against
`docs/strategy/DISCOVERY-SURFACE-INVENTORY.md`. Em dash 0, en dash 0, banned
community word 0, exclamation marks 2 and both sit inside one code span quoting
the SQL operators `!=`, which is not user-facing copy. Tell lexicon: 0 across the
full list (unforgettable, look no further, elevate, vibrant, nestled, in the
heart of, stands as a testament, delve, tapestry, seamless, robust, leverage,
navigate the landscape, unlock).

NOTE for anyone grepping THIS ledger: the tell words appear in the paragraph
above because the ledger enumerates the checklist it ran. They are the test, not
generated copy, the same carve-out the copy-tell-gate allowlist exists for
(`scripts/copy-tell-gate.mjs:27-49`). This file is not shipped copy.

**The regression sweep.** DESIGN-LOCK not engaged: no source file touched, no
visual element changed. Two new documents only.

**The founder-cost test.** One failure. Part 5 item 1 sends the founder to
`/admin/flags` to read `broadcast_digest`. I cannot query the database from here,
so the dashboard trip is genuinely necessary, but I can reduce its cost by
telling him exactly what to look at and what each answer implies. Fixed.

**The evidence-visibility test.** The deliverable is a written document at a
named path, which is visible by definition. No visual capture is owed because
nothing visual was changed.

---

## ROUND 1: FIXES APPLIED

| Finding | Fix |
|---|---|
| Acquisition loop omitted (S13, Q1, Q2) | New section 2.14 "The buyer acquisition loop", with the confirmation-page evidence. Added to Q1 as an encounter path and to Q2's deliverable list |
| S11 not swept | New sweep across 23 public routes. Six define no `openGraph` block; the root layout's generic block and the inherited root `opengraph-image.tsx` are named as what they fall back to |
| S12 incomplete | Full `sendEmail` enumeration, 13 call sites, each classified as discovery, acquisition, retention or operations. Ticket transfer and the marketplace performer alert added |
| C14 / C11 / S9 filename assertions | Squad page and squad-expire cron read and cited by line. `src/lib/payments/` citation replaced |
| Asymmetric flag treatment | Both flags now stated identically: seeded default plus "the live DB row is the authority and was not queried" |
| S4 index inference | Verified. `20260425000001_hot_path_indexes.sql:19-31` creates four B-tree indexes, none on `title`; the pg_trgm GIN is mentioned in a comment at `:12` and never created. Added the consequence: a leading-wildcard `ILIKE` on an unindexed column is a sequential scan |
| C10 unlabelled sections | EVIDENCE and INFERENCE labels added to 2.9, 2.13, 2.14 and Part 3 |
| E4 left implicit | A one-line "can a new event reach a stranger here" answer added to every surface that lacked one |
| Q1 missing the poster | Printed QR poster and buyer-to-buyer share added as encounter paths, with the honest limit on each |
| Transactional email overclaim | Corrected: ticket transfer reaches someone who never transacted |
| D2 one-page test | A five-line "If you read nothing else" block added at the very top |
| Founder-cost | Part 5 item 1 now says exactly what to check and what each answer means |

---

## ROUND 2: RE-ADJUDICATION

Run against the document after the round 1 fixes.

| # | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| C10 | PARTIAL | **MET** | Every section now carries at least one EVIDENCE or INFERENCE label |
| C11 | PARTIAL | **MET** | Every code claim carries a path; every path that carries a verdict was opened |
| C14 | NOT MET | **MET** | The three filename assertions are replaced by line-cited reads |
| E4 | PARTIAL | **MET** | Answered per surface |
| S4 | PARTIAL | **MET** | Index claim now evidenced from the migration |
| S9 | PARTIAL | **MET** | Squads read and cited |
| S11 | NOT MET | **MET** | 23 routes swept, results tabulated |
| S12 | NOT MET | **MET** | 13 `sendEmail` sites enumerated and classified |
| S13 | NOT MET | **MET** | Acquisition loop added as section 2.14 |
| Q1 | PARTIAL | **MET** | Five encounter paths, up from three |
| Q2 | PARTIAL | **MET** | Acquisition loop added to the deliverable list |
| D2 | PARTIAL | **MET** | Five-line block at the top satisfies the literal one-page read |
| C16 | Pending | **MET** | Committed on `feat/auth-hardening`, docs only, nothing merged, no other branch touched |
| All others | MET | **MET** | Unchanged |

## ROUND 2: ADVERSARIAL PASS

**Silent drops.** Re-ran the comparison of ledger against document. None found.
Every one of S1 to S13, E1 to E5, Q1 to Q3 and D1 to D4 appears in the document
by name or by section.

**New drift introduced by the fixes.** Checked. Section 2.14 could have been
written to make the platform look stronger than it is, since the acquisition loop
is genuinely good. It carries its own limit explicitly: the loop only fires
after a purchase, so with zero buyers it reaches nobody, which keeps the Q1
conclusion intact rather than softening it.

**Did any round 1 fix create an unverified claim?** One risk: the Open Graph
sweep tests for the presence of an `openGraph` block in each page file, not for
the rendered `og:` tags. The document now states exactly that, and says the
rendered output was not captured. It is labelled INFERENCE.

**Match versus surpass.** Not applicable. This brief asked for an audit, not a
competitor beat. No SURPASS claim is made anywhere in the document.

**AI-tell sweep, second run.** Em dash 0, en dash 0, banned word 0, tell lexicon
0, exclamation marks 1 and unchanged (the `!=` code span).

**Founder-cost, second run.** Two dashboard trips remain and both are irreducible
from a read-only session: the `broadcast_digest` flag value and the live row
counts. Both now state what to check and what each answer implies.

**Remaining honest limits, carried into the document's Part 5 rather than hidden
here.** No database was queried, so no live count or flag value is asserted. Two
findings are labelled INFERENCE rather than EVIDENCE (the category-page emptiness
and the Sounds-tile emptiness); both name the five-minute check against TEST that
would settle them.

---

## GATE

```
ROAST GATE: PASSED
Requirements: 44. Met: 44. Partial: 0. Not met: 0.
Adversarial findings: 0 unresolved.
Round 1 found: 4 NOT MET, 9 PARTIAL, 1 severe silent drop. All fixed.
```

The severe finding was mine, not the platform's: I omitted a working acquisition
loop and asserted three surfaces from filenames after being told not to.
