# Phase 0: evidence before any change

Branch: `feat/launch-kit-moat`, cut from `origin/main` at `1888ece`.
Date: 8 August 2026. **No source file changed in this phase.**

Every verdict below comes from opened code, a command's output, or a live read
of the TEST project. Nothing is inferred from a filename. Where I could not
verify something, it says so and is not filled with a guess.

---

## 0.1 Two premises in the brief are false, and both change the work

**Premise: "The analysis phase is complete and committed."**
It is not committed. `git log --all -- docs/strategy/LAUNCH-KIT-MOAT-ANALYSIS.md`
returns nothing, and `git ls-files --error-unmatch` on it errors with "did not
match any file(s) known to git". The analysis and its roast ledger are untracked
files in the working tree. They are the brief for this job, so I will commit
them as the first commit on this branch. Flagging rather than silently fixing,
because the founder believes work is preserved that currently is not.

**Premise: "Build and verify under Node 20 matching .nvmrc."**
There is no `.nvmrc` in the repository, and `package.json` has no `engines`
field and no `packageManager` field. The local runtime is Node v24.14.0. What
DOES pin Node 20 is CI: `.github/workflows/ci.yml` sets `node-version: 20` at
three jobs (lines 34, 99, 159). So the intent is right and the file named does
not exist. I will verify locally under v24.14.0, state that plainly, and treat
CI on Node 20 as the merge authority per the constitution. **Adding an `.nvmrc`
is a one-line change that makes the brief's own instruction executable, and I
propose it.**

---

## 0.2 Magic Start, read end to end

| Layer | File | What it does |
|---|---|---|
| Client UI | `src/components/features/events/magic-start.tsx` (200 lines) | Textarea, Web Speech voice button, POSTs `{description}` |
| Route | `src/app/api/ai/magic-start/route.ts` (87 lines) | Flag gate, auth gate, two rate limits, sanitises input, derives category names server-side, calls `extractEventDraft` |
| Engine | `src/lib/ai/magic-start.ts` (464 lines) | Pass 1 Haiku 4.5 extraction, pass 2 Sonnet 5 prose, anti-tell gate, `safeParse` |
| Gate | `src/lib/ai/copy-tells.ts` + `copy-tells.json`, `src/lib/ai/sanitise.ts` | Lexicon check, then mechanical dash and exclamation strip |
| Mapping | `src/components/features/events/event-form.tsx:606-671` (`applyMagicDraft`) | Writes the draft onto form state and builds the status message |

**The contract is `DRAFT_SCHEMA` (`magic-start.ts:72-116`).** Its complete
property list is: `title`, `description`, `category`, `start_date`, `end_date`,
`event_type`, `venue_name`, `venue_address`, `venue_city`, `venue_state`,
`venue_postal_code`, `is_free`, `ticket_tiers`, `unresolved`.

**The wizard's actual step 1 fields** (`event-form.tsx:51-56`) are: `title`,
`summary` (200 char cap), `description`, `category_id`, `tags`,
`community_slugs`.

Put side by side, three step 1 fields have no representation in the schema at
all: **summary, tags, community_slugs**. The model is not asked for them, so it
cannot return them, so the client cannot map them. This is the single root cause
behind C2, C4 and C5, and it is one fix, not three.

---

## 0.3 MODEL versus CLIENT versus TAXONOMY, per defect

The brief asks for this distinction explicitly. Three categories were needed,
not two: one defect is neither the model's fault nor the client's.

| # | Defect | Root cause layer | Evidence | Fix shape |
|---|---|---|---|---|
| **C1** | "End" in both Filled and Add-these-yourself | **CLIENT** | `event-form.tsx:632` runs `filled.push('End')` unconditionally inside the `if (draft.start_date)` branch, even when the client itself just synthesised the end from start plus two hours at `:627-628`. Meanwhile `unresolved` comes from the MODEL (`magic-start.ts:104-108`), which correctly flagged "Event end time" because the organiser never stated one. Two independent sources of truth, guaranteed to contradict | Derive both lists from ONE post-mapping inspection of final form state. Structural, so it cannot recur |
| **C2** | Short Summary empty, 0/200 | **MODEL, by omission of contract** | No `summary` property exists in `DRAFT_SCHEMA`. Never requested, never returned, never mapped. The form field exists at `event-form.tsx:748-753` | Add to schema and prompt as its own craft task with its own instruction, never a truncation of the description |
| **C3** | Category not selected | **TAXONOMY, not model and not client** | Live read of TEST `event_categories` returns 21 active rows and **none of them is Comedy**: Music, Sports, Arts & Culture, Food & Drink, Business & Networking, Education, Charity, Nightlife, Family, Technology, Religion, Fashion, Health & Wellness, Community, Festival, Film, Other, Pride, European, Middle Eastern, Pacific. The prompt says pick one verbatim "or empty if none clearly fits" (`magic-start.ts:129`) and `safeParse:431` drops any non-matching name to empty. For a comedy night the model had no correct answer available | Per the founder's own wording ("the list is fixed and visible, always choose"), force a best-fit choice from the 21 and forbid empty. **Separately flag the taxonomy gap as a founder decision, see 0.4** |
| **C4** | Tags empty | **MODEL, by omission of contract** | No `tags` property in `DRAFT_SCHEMA`. Form field at `event-form.tsx:796` | Add to schema and prompt |
| **C5** | Communities not ticked | **MODEL, by omission of contract** | No `communities` property in `DRAFT_SCHEMA`. Form multi-select at `event-form.tsx:806-821`, sourced from `getAllCommunities()` | Add to schema, constrain output to real slugs server-side exactly as category is constrained, and say so in the status message when none apply |
| **C6** | Venue address pushed back | **WORKING AS DESIGNED, feature absent** | The prompt forbids invention: "Never guess a date, a price, a venue" (`magic-start.ts:128`). The organiser never typed a street address, so leaving it empty was correct behaviour. What is missing is resolution: no geocoding call and no lookup against existing `venues` rows exists anywhere in the Magic Start path | Resolve from the venues table first, then Google Places, and only flag as unresolved if both miss. Not a prompt change |
| **C7** | Microphone failed silently | **CLIENT** | `magic-start.tsx:97-102` calls `rec.start()` with no prior permission state check. `navigator.permissions.query` is never called, `navigator.mediaDevices.getUserMedia` is never called. `onerror` maps only `not-allowed` to a message and lumps every other error code (`audio-capture` meaning no microphone hardware, `no-speech`, `network`, `service-not-allowed`, `aborted`) into one generic line at `:91`. The blocked message names no recovery path | Pre-flight the permission state, give each error code its own honest message with the actual recovery step, and correct the false privacy comment (see below) |

**A factual error found in the code while diagnosing C7.** The file header at
`magic-start.tsx:10-11` claims voice input uses the browser API with "no
external service and no audio stored". For Chrome, which is where
`webkitSpeechRecognition` runs, that is wrong: Chrome sends the captured audio
to Google's servers for transcription
([Chromium HTML5 discussion](https://groups.google.com/a/chromium.org/g/chromium-html5/c/EJl8kE52MyI),
[AssemblyAI](https://www.assemblyai.com/blog/speech-recognition-javascript-web-speech-api)).
Chrome 139 added an OPTIONAL on-device mode which does keep audio local, but it
is not the default and this code does not request it
([on-device speech in Chrome 139](https://medium.com/@roman_fedyskyi/on-device-speech-uis-in-chrome-139-4b9f0397b9c9)).
A privacy claim in a comment is not customer-facing copy, but it is wrong, it
would be repeated by anyone reading the file, and it must be corrected as part
of C7.

---

## 0.4 A taxonomy finding the brief did not anticipate

While resolving C3 I found the platform runs **two different event taxonomies**,
and the create wizard is wired to the one without Comedy in it.

1. **`public.event_categories`** (21 rows, seeded in
   `supabase/migrations/20260101000001_baseline_schema.sql:212`). This is what
   the wizard dropdown offers and what `events.category_id` references
   (`baseline_schema.sql:254`). No Comedy.
2. **`public.cultures`** (seeded in
   `supabase/migrations/20260504000002_culture_taxonomy.sql`), which carries
   tier 2 verticals including `('comedy', 'Comedy', 2, 'Stand-up, sketch,
   improv, all of it.')` at line 94. This drives the PUBLIC discovery surfaces:
   the homepage rail (`src/app/page.tsx:334`), the category nav rail
   (`category-nav-rail.tsx:26`), `/categories/comedy`, the city pages
   (`src/lib/cities/data.ts:542`) and the organiser strip.

**So the platform advertises Comedy browsing to buyers on the homepage and at
`/categories/comedy`, while an organiser physically cannot categorise their
event as Comedy.** The founder's own constitution cites the LPA finding that
comedy is the fastest-growing category (`CLAUDE.md:302`) and names comedy as a
core event type (`:72`). This is a real gap, it is bigger than C3, and it is a
founder decision because it touches taxonomy and Law 3 requires taxonomy to be
verified against current Australian market data before it ships.

**What I will do without a decision:** make the model always pick the best
available fit from the live 21, per the founder's explicit C3 instruction. A
comedy night will land on a defensible existing category rather than on nothing.
**What I will not do without a decision:** add rows to `event_categories`.

**A second, smaller observation, already known and tracked.** The live category
name "Arts & Culture" and the table `public.cultures` both carry the banned
word, which the constitution bans in data, table names and identifiers. Project
memory records this as Phase 2 of the community rename, still pending. I am
reporting it, not fixing it in this branch, because renaming a live table and a
user-facing category is its own migration with discovery-surface fallout.

---

## 0.5 What I could NOT verify, and why

- **The raw model output for the founder's exact input.** There is no
  `ANTHROPIC_API_KEY` in any local env file (checked `.env.local`, `.env.test`,
  `.env.staging.example`, `.env.example`; all zero matches). I cannot call the
  live model from this machine, so I cannot paste the raw JSON the founder's
  sentence produced. **This is a genuine gap in Phase 0 and I am not papering
  over it.** It matters for exactly one defect, C3, where I wanted to know
  whether the model returned `""` or returned `"Comedy"` and had it dropped by
  `safeParse`. For every other defect the schema settles it without a run: a
  field that does not exist in the contract cannot have been returned. I will
  close this gap by running the six-input matrix against the deployed preview
  once the key is available there, and the tests I add do not depend on a live
  model.
- **Whether production shares the TEST category list.** I read TEST only. Both
  are seeded from the same baseline migration, so they should match, but I did
  not query production and will not.

---

## 0.6 The specs I must build against, read

- **`docs/design/PHASE-C.md` part 4** (the `/launch` composer): routes, the four
  page states, the `el_kit_draft` cookie contract already shipped in C2
  (`src/lib/growth/kit-draft.ts` exists, confirmed), the `kit_drafts` table
  shape, the reveal choreography with timings, the abuse posture (per-IP limit,
  new `launch-magic` bucket, 5 per hour), accessibility and the acceptance test.
  **Where it conflicts with the founder ruling:** the spec's state 4 routes the
  organiser into signup before the real event row is created, which is correct
  and consistent with "account creation only when they want to keep it". No
  conflict found. The spec is sound and I will follow it.
- **`docs/design/LAUNCH-KIT-PLAN.md` section 8**: the eight build steps with
  hours. Step 1 shape composer (16 to 20 h), step 2 caption engine (14 to 18 h).
  Confirmed absent by grep: no `1080x1920`, no `width: 1080`, no `story-card`,
  no `square-card` anywhere in `src`.

---

## 0.7 My ordering, and where I disagree with the founder's

The founder's order is C, then A, then B, with D throughout. **I agree with C
first and I disagree on two items, both of which I want to pull EARLIER, for
his own stated reason (cheapest first, highest visibility first).**

| Rank | Item | Hours | Why here |
|---|---|---|---|
| 1 | C1 to C5 (the five field defects) | 12 to 17 | Cheapest, highest visibility, and C2 to C5 are ONE schema change plus prompt craft, not four separate jobs |
| 2 | **A4 positioning copy** (moved UP from the founder's order) | 3 to 5 | It is a sentence, not code, and it is the cheapest item in the entire brief. Doing it FIRST means every surface I touch afterwards already speaks the new promise instead of me writing the copy twice |
| 3 | **B2 the four zeros** (moved UP from the founder's order) | 3 to 4 | Self-contained, in the single most important moment in the product, and if it stays last it is the thing that gets cut when time runs out |
| 4 | C7 microphone | 4 to 6 | Headline promise, and it includes correcting a false privacy claim |
| 5 | C6 venue resolution | 5 to 8 | Needs the Google key plus a venues lookup; more moving parts than C1 to C5 |
| 6 | B1 organiser logo on the poster | 5 to 7 | Genuine, and it depends on knowing what logo data organisations actually hold |
| 7 | A3 spread mechanic in the kit | 6 to 10 | Design work, cheap to build once decided |
| 8 | A2 story and square cards plus captions | 30 to 38 | The largest quality lever, and the caption engine is most of it |
| 9 | A1 the public composer | 24 to 34 | Highest strategic value, largest surface, most risk. Correctly last because it should land on themed, captioned, downloadable artefacts rather than on today's set |
| 10 | D2 full walkthrough plus same-class fixes | 10 to 16 | Cannot be scoped until walked |
| 11 | D4 founder script, D1 and D3 written answers | 3 to 5 | Depends on everything above |

**Total: 105 to 150 hours.**

**I have to say this plainly, because the Definition of Done forbids reporting a
partial build as complete.** This brief is three to four weeks of focused
engineering. It is not deliverable in one pass to the standard the constitution
sets, which requires per-surface benchmark verdicts at 1440 and 390, Lighthouse
95 or better, axe zero, and a link-integrity crawl for every new surface. If I
attempt all eleven items in one pass, the likely outcome is eleven things at
seventy percent and a report that reads as complete, which is the exact failure
the roast gate exists to prevent.

**What I propose, and I will proceed on this unless told otherwise:** work
strictly down the ranked list, verify each item to the Definition of Done as I
finish it, commit per unit, and stop at the point where quality would start to
slip. Then report exactly where I stopped, with every unstarted item listed as
UNFULFILLED at the top of the report rather than buried. That gives the founder
a shippable, verified subset plus an honest map, instead of a broad, unverified
sweep.

**One thing worth his attention before I start item 9.** A1 assumes anonymous
traffic can call an AI generation endpoint. Today `/api/ai/magic-start` requires
auth (`route.ts:33-35`) and rate-limits per user id. Anonymous callers can only
be limited per IP, which is weak, and the cost guard is fail-open when Redis is
unreachable (`cost-guard.ts:35`). Before that endpoint is opened I will need a
deterministic non-AI composition path as the floor so an unauthenticated visitor
can always get a kit even when AI is off, rate-limited or over budget. The
caption engine in item 8 already requires that deterministic layer, which is
another reason item 8 precedes item 9.

---

## 0.8 Baseline captured before any change

Recorded so every later claim of "still green" has something to compare against.
Numbers are from the actual runs on `feat/launch-kit-moat` at `1888ece`, before
any edit.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0, clean** |
| Lint | `npx eslint .` | **48 problems, 0 errors, 48 warnings** |
| Tests | `npx vitest run` | **120 files passed, 1276 tests passed** |
| Runtime | `node -v` | v24.14.0 (CI pins 20) |

The two lint warnings named in the output are `clientIp` unused in
`src/app/api/ai/magic-start/route.ts:4` and `mustFitInside` unused in
`src/lib/seating/render/labels.ts:343`. The first sits in a file this job must
edit, so it will be removed as a side effect of the C-block work.

**The brief states the ESLint baseline is 42 warnings. The measured baseline is
48.** I will hold the line at 48 or below and report the exact number, rather
than quietly adopting a target I cannot reconcile.

---

## 0.9 A fourth false premise, in B1

The brief says: "Add an organiser logo slot, **using the logo already collected
at organisation setup**."

**No logo is collected at organisation setup.** Verified:

- The column exists: `organisations.logo_url TEXT`
  (`20260101000001_baseline_schema.sql:65`), and it is present in the generated
  types.
- It is READ in four places: the organiser profile page and its metadata
  (`src/app/organisers/[handle]/page.tsx:103,104,111,195`), the venue page
  (`src/app/venues/[handle]/page.tsx:152`), and the organiser JSON-LD
  (`organiser-schema-jsonld.tsx:68-69`).
- It is **WRITTEN nowhere in `src`**. `grep -rn "logo_url" src/app/(dashboard)/`
  returns zero results. The organisation create form collects name, slug,
  description, website and email only
  (`org-create-form.tsx:43-117`), and `createOrganisation`
  (`organisation/actions.ts:62`) does not include `logo_url` in its insert
  payload.

So `logo_url` is null for every organisation unless someone set it directly in
the database. **B1 is therefore two jobs, not one:** build the logo upload
(through the existing image pipeline with its 4.5MB cap, client compression and
moderation), then add the slot to the poster renderer and subordinate the
EventLinqs mark. My estimate moves from 5 to 7 hours up to **10 to 14 hours**.

This does not change B1's priority, and it does not change that the founder is
right about the principle. It changes the size, and the founder should know
before it is scheduled.
