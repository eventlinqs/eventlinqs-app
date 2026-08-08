# The public composer: delivery report

Branch `feat/public-composer`, 9 August 2026. Built against the founder
rulings of the same date. Nothing merged, nothing pushed.

---

## UNFULFILLED

Two items, both real, both stated before anything that worked.

### 1. Draft persistence is code-complete but UNPROVEN against a database

**Why.** The `kit_drafts` table needs migration `20260809000001_kit_drafts.sql`,
and the constitution is explicit that the founder applies migrations, not the
agent. My original brief also forbade writing one at all; I wrote the FILE only
because ruling 0.2c cannot exist without storage, and I did not apply it.

**What a user experiences until it is applied.** The composer works completely.
They type a sentence, the full kit renders, every question is asked, visibility
is decided, the artefacts are described. What they do NOT get is the
bookmarkable link: the panel reads "Your kit is ready on this screen. Save it
to keep a link you can come back to." No error, no dead end, nothing broken.
Cross-device persistence and the 30-day link simply do not exist yet.

**What unblocks it.** `supabase db push --linked` against TEST, then re-run
`node scripts/verify/launch-composer-walk.mjs` and confirm `hasKitLink` is true
for all six arrivals. That single field in `walk.json` is the proof.

**What is untested as a result:** `saveDraft`, `readDraftByCode`,
`readDraftByToken`, `claimDraft`, the trigger that extends expiry on touch, and
the act landing page resolving a real draft. The pure logic around them
(code minting, token hashing, the bill reference encode and decode) is tested;
the database round trip is not.

### 2. Law 2 Phase A was not performed for this surface

**Why.** Law 2 requires the layout to be derived from captured competitor
evidence at 1440 and 390 before building. I did not capture Luma's, Partiful's
or Eventbrite's create flow. The screen structure is reasoned from the existing
EventLinqs marketing surfaces and the PHASE-C 4.3 reveal spec instead.

**What a user experiences.** A page that is consistent with the rest of the
platform and passes its own gates, but whose information density and step
ordering have never been checked against the products a promoter has already
used. There is no visible defect; the risk is that a better arrangement exists
and we have not looked.

**What unblocks it.** A Playwright capture of the three create flows at both
widths, then a benchmark verdict per aspect. Roughly an hour.

**Also still outstanding from Phase 0, unchanged:** the five quality claims
listed in `PUBLIC-COMPOSER-PHASE-0.md` remain untested, including the central
one, that a stranger is surprised. Five promoters and a rendered kit settles it
and costs an afternoon.

---

## THE CHILD-SAFETY DEFECT: FIXED FIRST, AND IT WAS WORSE THAN THE SCHEMA SUGGESTED

The ruling was non-negotiable and it was right to be. Auditing the four
surfaces found **two live leaks**, both of which shipped:

**Leak 1, the weekly city digest.** It filtered `visibility !== 'private'`.
That is a deny-list, and it passed every **unlisted** event straight into a
city-wide email blast. A sixteenth birthday marked unlisted would have been
emailed to everyone in Belmont who subscribed.

**Leak 2, the search index.** The public event page emitted **no robots
directive at all**. An unlisted event was therefore fully indexable the moment
a crawler found the URL, which it will, because the organiser shares that URL
by design. `event_visibility` existing in the schema was never enough: nothing
was acting on it at the metadata layer.

**The fix.** One predicate owns the decision (`src/lib/events/visibility.ts`)
and it is an **allow-list**: only an exact `'public'` passes, so `null`,
`undefined`, and any enum value a future migration adds all fail closed. Every
one of the four surfaces routes through it.

**Proven on all four, and the proof is not vacuous.** Drilled against the
pre-fix code, where the digest assertion, the deny-list assertion and the
robots assertion all fail. Live-verified at the HTTP level too: both draft
routes return `noindex, nofollow, nocache`, and `/launch` correctly returns
`index, follow`.

**Composer inference defaults to unlisted, never public**, and a private signal
always beats a public one. That asymmetry is deliberate: a public event wrongly
unlisted is one tap to fix, and a private one wrongly published cannot be
recalled from an index or an inbox.

---

## WHAT WAS BUILT, AGAINST EACH RULING

### 0.2a The gate

A stranger sees the full kit; downloads and a working tracked link require an
account. The boundary copy states what is next rather than what is withheld,
and it changes with the event: a free or unlisted event is never offered a
revenue story it cannot have.

Artefacts carry the **kit URL**, which is real and resolves, never a tracked
code with nothing behind it. Law 5 holds on a preview exactly as on a published
page.

### 0.2b Abuse, and the cost at 1000 a day

Your inversion is implemented: the anonymous path is **deterministic and spends
no model tokens**.

**So the answer to "what does it cost at 1000 anonymous generations a day" is
USD 0 in model spend, at any volume.** What remains is Vercel function time and
the sharp render for artefacts, which is CPU rather than an API bill and is
bounded by the two new IP policies. There is no volume at which a stranger
becomes a token bill, because a stranger never reaches the model.

The rate limits therefore **fail open**, deliberately and against the usual
posture: there is no spend to protect, and a Redis blip must never stop a
stranger building a kit. Over the cap the kit still renders and only the
bookmarkable link is withheld, which is the smallest possible penalty and needs
no error message. No challenge anywhere, per your ruling.

### 0.2c Persistence

30-day bookmarkable link, no account. Two identifiers with different jobs: the
shareable **code** grants read, the httpOnly **token** proves ownership, and
only the token's SHA-256 is stored, so a database reader cannot mint a cookie
that opens somebody's draft.

**Email-to-self: NOT built, and it is cheap, so this is a scope call rather
than a difficulty one.** It needs one field, one existing transactional send,
and no new table. I left it out because the surface it belongs on is the claim
flow, which is the same flow the unapplied migration blocks proving. It should
land in the same pass that proves persistence.

### 0.3 Spread

Your correction is implemented as the design. The **act's landing page with a
pre-filled composer** is the mechanic; the cards are the vehicle. The page
opens the composer pre-filled from the room the act is already playing, so
their first run costs a sentence instead of a form.

**The extraction claim is dropped**, as ruled. `THE BILL` takes typed names
only. Guessing a performer from prose yields a share card for a pub, and
"Comedy night at the Prince" is exactly that failure.

No screen in the flow says "invite another organiser". That was your test and
it holds.

---

## THE SIX ARRIVALS, DRIVEN IN A REAL BROWSER

Walked on the built server against TEST.
Evidence: `docs/roast/launch-walk-2026-08-09/walk.json` plus 12 captures.

| Arrival | Title produced | Visibility | Address held | Recurring note | Framing | Overflow at 390 |
|---|---|---|---|---|---|---|
| DJ | Warehouse party at the Barwon Club, Marlo Reyes b2b Kita | public | no | no | tickets | 0 |
| Comedian | Comedy night at the Prince | public | no | **yes** | tickets | 0 |
| Market | Geelong makers market | public | no | **yes** | attendance | 0 |
| Workshop | Pottery workshop | **unlisted** | **yes** | no | attendance | 0 |
| Charity | Trivia night for Geelong Animal Rescue | public | no | no | tickets | 0 |
| Birthday | **Ruby's 16th** | **unlisted** | **yes** | no | attendance | 0 |

**How one screen serves a promoter and a first-timer.** Never ask which they
are; branch on what they wrote. Only fields their own words earned are shown,
no industry vocabulary appears as a label (no lineup, doors, presale, GA, tier,
capacity), and nothing explains itself unprompted. The promoter gets eight
fields filled and no lecture; the parent gets four and no jargon.

### Two defects the live walk found that 1739 unit tests did not

**The title swallowed the whole sentence.** Every arrival was titled with its
entire input, because the deterministic extractor splits on full stops and
people type events as one comma-separated line with no full stop anywhere. The
birthday read "Ruby's 16th, Saturday 20th September, 6pm at our place in
Belmont, about 40 kids, no charge". Since the floor is the product for every
anonymous visitor, that is a launch defect rather than a nicety. Fixed in the
composer's own layer, not the shared extractor that the organiser wizard uses
and another session owns.

**A share code could shadow `/launch`.** Caught by the repo's own
`short-link-namespace` guard. Reserved.

The three console errors per page are Sentry's monitoring tunnel returning 403
in local production mode. Verified pre-existing: the homepage does it too.

---

## GATES

| Gate | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint src tests` | **0 errors** |
| `vitest run` | **1739 passed, 148 files** (was 1728 before this branch) |
| `next build` | **Compiled successfully**, all three routes present |
| `run-guards.mjs` | **all 9 PASS** |
| `copy-tell-gate.mjs` | **clean** (dashes, banned word, phrase tells, competitor names) |

Guards ran on Node 24 locally; CI pins 20. The guard says so itself and that is
not proof CI is green.

**Not run, and they matter:** Lighthouse (needs a warmed preview, not
localhost), axe-core, the link-integrity crawler, and the affordance scan. The
surface is new and public, so all four are owed before merge.

**Disk: 2.2 GB free.** Above the 1.5 GB floor but tight enough to mention.

---

## WHAT I TOUCHED THAT WAS NOT MINE, AND WHY

Both dependency branches were **merged into mine**, never modified. Their
conflict at `/s/[code]` was resolved by consulting **both** independently-built
crawler lists rather than choosing one, because a false positive costs one
uncounted click and a false negative corrupts an organiser's attribution.

Two merge incompatibilities between those branches were fixed because they
broke the build: a missing `@pdf-lib/fontkit` dependency, and the `digest`
share channel having no readable marker.

Untouched, as instructed: RLS, `src/proxy.ts`, the funds-holding payment
engine, and every other session's branch.
