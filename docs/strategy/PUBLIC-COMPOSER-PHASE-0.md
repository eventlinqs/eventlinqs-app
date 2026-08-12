# The public composer: Phase 0 design and research

Branch `feat/public-composer`. Started 8 August 2026.
Status: PHASE 0 REPORTED. No product code written. `src/app/launch` does not
exist and is not created by this document.

---

## THE THING THAT OUTRANKS THIS ENTIRE DOCUMENT

The brief says the Launch Kit is the only thing that acquires anyone. The moat
analysis this brief rests on records something narrower and much harder, as its
risk 9: **production cannot currently sell a ticket.** All sixteen production
organisations sit at `stripe_charges_enabled = false` and no ticket picker
renders (recorded project state, 31 July 2026; I did not re-verify it this
session and it is carried forward, not observed).

**A perfect composer that hands a stranger a finished kit whose checkout cannot
take money is worse than no composer**, because it burns a personally recruited
relationship at the exact moment of maximum trust. The composer is the front of
the funnel. If the bottom of the funnel is closed, the composer's only function
is to waste the founder's warmest leads.

I am not raising this to avoid the work. The design below is complete and I
recommend building it. But it should be sequenced behind proving that one real
organiser can take one real payment in production, and nothing in the brief or
in PHASE-C says that out loud.

INTERNAL DOCUMENT. Competitor names appear as research context only. None of
this language belongs on any public surface.

**Governing laws** (Law 0 declaration): Law 0, Definition of Done, Growth plan
(the acquisition loop and the wedge), Law 1 (no generic), Law 2
(evidence-driven), Law 4 (marketing surfaces are image-rich), Law 5 (zero dead
links and no dead-end tiles), Design system, Motion, Copy and banned content,
Fee system (any fee claim in copy), Verification and gates. Plus the brief's
Law 6: this platform never generates images or video.

**How to read the labels.** Every claim about our own code is one of:

- **READ**: I opened the file on the named branch and quote or cite the line.
- **DERIVED**: I computed it from something READ, and the method is shown.
- **UNVERIFIED**: I could not confirm it in this session and say so.

Market claims carry a source and a fetch date. Where a conclusion is mine
rather than a source's, it is marked **Inference**.

---

## 0.1 THE EXISTING KIT, READ END TO END

### 0.1.0 The dependency situation, stated first because it governs everything

My branch is cut from `origin/main`. **Almost nothing the brief tells me to
reuse is on `origin/main`.** Verified by `git cat-file -e` against each path
this session:

| Path | On `origin/main`? | Lives on |
|---|---|---|
| `src/lib/broadcast/captions.ts` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/broadcast/social-cards.tsx` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/broadcast/social-card-spec.ts` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/broadcast/short-links.ts` | **NO** | `feat/launch-kit-artefacts` |
| `src/app/e/[code]/page.tsx` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/broadcast/kit-artefacts.ts` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/media/logo-pipeline.ts` | **NO** | `feat/launch-kit-artefacts` |
| `src/lib/ai/draft-fallbacks.ts` (the no-AI floor) | **NO** | `feat/launch-kit-moat` |
| Cost guard with a `failMode` parameter | **NO** | `feat/launch-kit-moat` |

`feat/launch-kit-artefacts` adds 4,445 lines across 53 files under `src/`.
`feat/launch-kit-moat` adds 3,818 lines across 68 files. Neither is merged.

**What I assume from those branches, stated plainly as the brief requires.**
I assume they land, essentially as written, before the composer ships:

1. `renderSocialCard(format, input)` renders story 1080x1920, square 1080x1080
   and tall 1440x1800 from a plain input object.
2. `buildCaptions(input)` returns six per-channel captions deterministically.
3. `/e/[code]` serves the event page on one request with no redirect, and
   preview crawlers are filtered so robots book no click.
4. The A4 poster renders with a working QR and an organiser logo slot.
5. `buildDeterministicDraft` and the `draft-fallbacks` module compose a full
   step-1 draft with no model call.
6. `checkMonthlyBudget(failMode)` exists and takes a required fail mode.

**If any of those does not land, the composer's scope changes.** Item 5 and
item 6 are the two that would hurt most: without them the anonymous AI path has
neither a floor to fall back to nor a guard that fails closed, and 0.2b below
becomes unanswerable rather than merely harder.

I did not modify any of those branches and will not.

### 0.1.1 What is reusable exactly as-is, with no parameter

These are pure functions over plain inputs. No database read, no auth, no
network, no session. An anonymous caller can use every one of them unchanged.

| Module | Entry point | Why it needs no change |
|---|---|---|
| `broadcast/captions.ts` | `buildCaptions(input: CaptionInput)` | READ: takes a plain object, returns six captions. Its own header states the five rules, first among them "Deterministic. No model call, no API key, no network." Nothing in it touches an event row. |
| `broadcast/social-card-spec.ts` | `SOCIAL_CARD_FORMATS` | READ: a constant table with every platform figure cited to a primary source in the file header. Pure data. |
| `broadcast/social-cards.tsx` | `renderSocialCard(format, input)` | READ: signature is `(format, input: SocialCardInput)`. `SocialCardInput` is title, labels, `shortUrl`, eyebrow, organiser name, optional prepared cover, optional prepared logo, optional QR data URL. No event id anywhere. |
| `broadcast/social-cards.tsx` | `prepareCardCover(bytes, format)`, `prepareLogo(bytes)` | READ: operate on raw bytes. |
| `ai/draft-fallbacks.ts` | `extractFactsFallback`, `buildSummaryFallback`, `deriveTagsFallback`, `pickCategoryFallback`, `detectCommunitiesFallback` | READ: the module header states its second job explicitly: "THE NO-AI FLOOR. The public composer must hand a stranger a real kit even when the AI key is absent, the monthly budget is exhausted, or the rate limiter has fired." It was written for this build. |
| `ai/magic-start.ts` | `extractEventDraft(opts)` | READ: opts are `{description, categoryNames, communities, nowIso, who}`. No user id, no auth check inside. Already calls `checkMonthlyBudget('closed')`. |
| `ai/sanitise.ts` + `ai/copy-tells.json` | `enforceCopyLaws`, `findCopyTells` | READ: pure string functions. The C3 gate applies unchanged. |

**This is the single most important finding of 0.1.** The artefact layer is
already parameterised correctly. The previous sessions built pure renderers
over plain input objects rather than functions that read the database. That is
why the composer is a smaller build than PHASE-C's 20 to 30 hour estimate
implies for the artefact half.

### 0.1.2 What needs a parameter, not a rewrite

| Module | What it does today | The change |
|---|---|---|
| `broadcast/kit-artefacts.ts` `loadArtefactContext` | READ: `createAdminClient()` then `.from('events').select(...).eq('id', eventId)`. It is the ONLY database-bound step in the artefact chain. | It already takes `mintLinks = true` as its fifth parameter, and READ: when false "every artefact carries the plain event URL: still a working link, still a sale, simply not attributed. Nothing is written to share_links." That is exactly the anonymous posture. What is needed is a **sibling constructor**, not an edit: `contextFromDraft(draft, origin)` returning the same `ArtefactContext` shape from a draft payload instead of an event row. `toCardInput` and `toCaptionInput` then work untouched. |
| `api/organiser/events/[id]/card/[format]/route.ts` | READ: `getOrganiserEvent(id)` gate, then `loadArtefactContext`, then `fetchImageBytes`, `prepareCardCover`, `prepareLogo`, `QRCode.toDataURL`, `renderSocialCard`. | The last five steps are reused verbatim. Only the first two are replaced: a draft-token gate instead of the organiser gate, and `contextFromDraft` instead of `loadArtefactContext`. **Inference:** this is roughly a 40-line route, not a new subsystem. |
| `api/organiser/events/[id]/poster/route.ts` | Same shape as the card route. | Same treatment. |
| `rate-limit/policies.ts` | READ: a single central table, each policy carrying `keyPrefix`, `limit`, `windowSec`, `rationale`, and optional `failClosed`. There is already a per-minute plus per-day pair for AI (`ai-chat` 10/60s and `ai-chat-daily` 120/86400s, both `failClosed: true`). | Two new rows following that exact precedent. Numbers proposed in 0.2b. No new mechanism. |

### 0.1.3 What genuinely needs new code

Short list, and it is shorter than the PHASE-C spec assumes.

1. **`contextFromDraft`** - a draft payload to `ArtefactContext` adapter
   (0.1.2). Small, pure, unit-testable.
2. **Draft persistence** - the `kit_drafts` table, the signed cookie, and the
   two server actions. PHASE-C 4.1 and 4.2 specify this down to the column
   list. **I do not write the migration** (Verification and gates: migration
   files are written, the founder applies them; and this brief forbids me a
   migration outright). Decision and cost in 0.2c.
3. **The composer UI** - `src/app/launch/page.tsx` plus the client pieces.
   This is the real build, and 0.5 designs it.
4. **The anonymous artefact routes** - draft-scoped card and poster endpoints,
   thin shells over the reused renderers.
5. **The spread mechanic** - 0.3.
6. **A per-session cap primitive** - the rate-limit table is per IP; a
   per-draft-token cap needs one new counter. Small.

**Not needed, contrary to what the brief's framing implies:** a caption engine
(exists, pure), a card renderer (exists, pure), a poster renderer (exists), the
readable link scheme (exists), crawler filtering (exists), the logo pipeline
(exists), the anti-tell gate (exists), the deterministic floor (exists, and was
written for this).

### 0.1.4 The cost guard, verified rather than assumed

The brief asks whether another session's fail-closed fix is on main.

**It is NOT on `origin/main`.** READ, `origin/main:src/lib/ai/cost-guard.ts`:

- line 32: `export async function checkMonthlyBudget(): Promise<BudgetStatus>`
  - no fail-mode parameter at all.
- line 35: `if (!redis) return { ok: true, ... }` - no Redis configured means
  **allow**.
- line 42 (the `catch`): `return { ok: true, ... }` - a Redis error means
  **allow**.

So on main today, an unreachable meter means uncapped spend for the duration of
the outage. That is exactly the failure the composer cannot afford.

The fix is on `feat/launch-kit-moat` and is good: `checkMonthlyBudget(failMode)`
with the parameter **required**, and the module comment states the reasoning
("There is no safe global default here, so the parameter is REQUIRED: a new
call site cannot inherit the wrong risk posture by forgetting to think about
it"). `extractEventDraft` already passes `'closed'`.

**I depend on an unmerged branch for this, and I say so rather than assuming.**
If `feat/launch-kit-moat` does not land first, the public composer must not
ship: an anonymous AI endpoint behind a guard that fails open is the one
configuration that turns a Redis blip into an unbounded bill.

---

## 0.2b ABUSE AND COST (answered before 0.2a, because it constrains it)

### The per-generation cost, derived rather than inherited

The brief cites USD 0.0166 per generation. **I could not find that figure
anywhere in the repository** (searched `docs/` and `src/` across
`origin/main`, `feat/launch-kit-moat` and `feat/launch-kit-artefacts` this
session; the only matches were unrelated Lighthouse timings). So I derived it
from the code instead.

**What a generation actually costs, from the code.** READ,
`feat/launch-kit-moat:src/lib/ai/magic-start.ts`:

- Pass 1 extraction is pinned to `claude-haiku-4-5` (line 34).
- Pass 2 prose runs on `claude-sonnet-5` by default (line 37).
- A tell in the output triggers **one** regeneration on the copy model
  (line 329) - so the worst case is **three** model calls, not two.
- `max_tokens: 1500` per call (line 683).

**Model pricing**, from the Anthropic pricing table current this session:
Haiku 4.5 USD 1.00 input / 5.00 output per million tokens; Sonnet 5 USD 3.00 /
15.00 (an introductory 2.00 / 10.00 applies through 31 August 2026, which makes
the figures below conservative for the next three weeks and correct after).
The repository's own estimator (`src/lib/ai/config.ts:37-41`) uses the same
standard numbers, so the guard's accounting and this model agree.

**Prompt size, measured.** I measured the assembled prompt from source
(`scratchpad/measure2.mjs`, run this session): system prompt string literals
5,100 chars across 54 strings, `DRAFT_SCHEMA` 2,602 chars, `COPY_SCHEMA` 703
chars, injected live taxonomy about 1,114 chars. **Total about 9,519 characters
per call.**

**The one number I cannot measure and will not fake:** the exact token count.
No `ANTHROPIC_API_KEY` is present in this working tree, so I could not call
`count_tokens`. I converted at 3.6 characters per token and state the divisor
openly; the true figure will differ, and the table below is therefore DERIVED,
not measured. **The founder should treat the ordering as reliable and the
decimals as approximate.**

| Scenario | 2 passes | 3 passes (tell retry) |
|---|---|---|
| 400-char description, 600 output tokens | USD 0.0230 | USD 0.0403 |
| 400-char description, 1500 output tokens (cap) | USD 0.0410 | USD 0.0718 |
| 2000-char description, 600 output tokens | USD 0.0248 | USD 0.0434 |
| 2000-char description, 1500 output tokens (cap) | USD 0.0428 | USD 0.0749 |

**So the brief's 0.0166 understates the real cost by roughly 1.4x at the
typical end and 4.5x at the worst end.** The gap is mostly the large system
prompt (5,100 characters of voice registers and copy law) plus the fact that
the tell-retry path exists. This matters because every exposure number below
scales off it.

### Exposure at the four volumes asked for

Typical is the 400-char, 600-token two-pass case (USD 0.0230). Worst is the
2000-char, capped, tell-retry case (USD 0.0749). Monthly is 30 days.

| Anonymous generations / day | Monthly at typical | Monthly at worst |
|---|---|---|
| 10 | USD 6.91 | USD 22.47 |
| 100 | USD 69.06 | USD 224.70 |
| 1,000 | USD 690.60 | USD 2,247.00 |
| 10,000 | USD 6,906.00 | USD 22,470.00 |

**The finding that decides the design:** READ,
`src/lib/ai/config.ts:24-29` - `getMonthlyBudgetUsd()` returns
`AI_MONTHLY_BUDGET_USD` or **defaults to USD 50**. At 100 anonymous
generations a day the typical monthly spend is USD 69, which **exceeds the
default budget before the month ends**. At 1,000 a day the guard trips on
about day two.

**Inference, and it is the important one:** on any successful launch the
deterministic floor is not a degraded fallback for outage days. It is the
normal path for most of the month. That reframes it from a safety net to a
primary surface, and it means the floor's output quality is a launch-blocking
concern, not a contingency concern. 0.5 designs for the floor first and treats
the AI pass as an enhancement, which is the opposite of how the current kit is
framed.


### The defences, and why IP rate limiting alone is not one

**IP rate limiting alone is weak, and the reason is specific rather than
general.** It fails in both directions at once:

- **Too tight for real organisers.** Australian mobile carriers put large
  numbers of subscribers behind carrier-grade NAT, so one public IP can front
  thousands of genuine phones. A cap tuned to stop an abuser blocks a real
  promoter on mobile data, at the exact moment we are trying to impress them.
- **Too loose for a real abuser.** Residential proxy pools are sold by the
  gigabyte. Rotating IPs is the cheapest thing an attacker does.

So per-IP limits are worth having as a floor and are worthless as the answer.

**The layered posture I recommend, cheapest and least intrusive first.**

| # | Control | Where | Why this one |
|---|---|---|---|
| 1 | **A global daily ceiling that DEGRADES** | new counter, checked before the model call | The whole answer. Above the ceiling the composer stops calling the model and serves the deterministic floor. Nobody sees an error, nobody sees a queue, the stranger still gets a complete kit. This bounds worst-case spend **absolutely** while never producing a broken experience. |
| 2 | **Per-draft-token cap** | the existing `el_kit_draft` cookie | The natural unit of legitimate use is one event, not one request. A real organiser regenerates a handful of times for one event. Proposed: 5 AI generations per draft token. Clearing the cookie evades it, but clearing it also destroys their kit, which is a real cost to a real user and nothing to an abuser, so it is paired with 3, never used alone. |
| 3 | **Per-IP hourly and daily** | `rate-limit/policies.ts`, following the existing `ai-chat` / `ai-chat-daily` pair | Bounds the naive case. `failClosed: true`, matching every other spend-bearing policy in that table. |
| 4 | **Invisible bot detection** | platform-level | Deals with the scripted case without putting a puzzle in front of a human. Only on the AI call, never on page load. **Founder call**, because it is a new dependency. |
| 5 | **Input caps** | already shipped | Description capped downstream at 5,000 characters. Keep. |
| 6 | **Cost guard failing closed** | `feat/launch-kit-moat` | Verified in 0.1.4. Without it the rest is decoration. |

**Deliberately NOT recommended: proof of work.** It is the wrong trade here. A
GPU-equipped attacker pays almost nothing per solve; a real organiser on a
three-year-old Android pays battery and seconds, at the one moment the product
is trying to feel effortless. It taxes exactly the person we want and barely
touches the one we do not.

**Deliberately NOT recommended: a challenge before the first generation.** The
first generation is the entire acquisition event. Putting a checkbox in front
of it to save two cents is the most expensive saving in the product.

### Setting the numbers from one dial, not six

The founder should set **one** number, `AI_MONTHLY_BUDGET_USD` (READ:
`src/lib/ai/config.ts:24-29`, currently defaulting to USD 50). Everything else
derives:

- Daily ceiling = monthly budget / 30 / typical cost per generation.
  At the current default: 50 / 30 / 0.023 = **about 72 anonymous AI
  generations a day** before the composer switches everyone to the floor.
- Per-IP daily = a small fraction of the daily ceiling, so no single network
  can consume it. Proposed 15.
- Per-IP hourly = 5, as PHASE-C 4.6 already proposed.

**Inference, and the founder should weigh it:** 72 a day is low for a launch
that works. If the composer succeeds, most strangers will be served by the
deterministic floor most of the time. That is not a failure state, but it does
mean **the floor's output is the product** and must be judged as such, not as a
fallback. If the founder wants the AI pass to be the normal path at 500
generations a day, the budget needs to be about USD 350 a month, and that is a
business decision rather than an engineering one.

---

## 0.2a HOW MUCH A STRANGER SEES BEFORE SIGNING UP

### What the market actually gates, from primary sources

| Product | Fetched | What is free | What the account or payment buys |
|---|---|---|---|
| **Canva** | 8 Aug 2026, `canva.com/help/preview-designs-with-premium-elements` | The full editor and a **watermarked draft download**. Verbatim: "If you're not yet sure about buying them, you can download a watermarked draft first to see how they'll look like in your design." | Removing the watermark. Verbatim: "they'll be watermarked (criss-cross patterns) until you buy them." |
| **PosterMyWall** | 8 Aug 2026, `postermywall.com/index.php/premium` | A$0 tier with "limited free downloads" and 1M+ templates. | High-resolution downloads "starting from A$7.99"; "Remove watermark from pages" is a Premium feature. |
| **Luma** | 8 Aug 2026, `help.luma.com/p/promote-your-event` and `/p/event-referrals` | Share Event Poster generation, QR code, per-guest referral links, Insights showing top referrers, UTM support. | Not stated on these pages. All of it sits behind a host account and a created event. |
| **Humanitix** | 8 Aug 2026, `help.humanitix.com/.../promotional-hub` | Pre-made Canva templates via the logged-in console. | n/a |

**The pattern across all four: they gate the EXPORT, never the VIEW.** Canva's
stated reason is the see-it-in-context principle: let them look at the real
thing in their own design before asking for money.

### The two gating claims the brief handed me, both checked

**Luma charging for a readable slug: CONFIRMED.** `luma.com/pricing`, fetched
8 August 2026. "Custom URL for event pages" is listed under **Luma Plus**, at
**USD 59 per month billed annually**, alongside "0% platform fee for paid
events" and the check-in manager role. The free plan carries a "5% platform fee
for paid events". So Luma gates the readable URL and the fee relief together.

**Eventbrite charging for a custom event address: NOT SUPPORTED by Eventbrite's
own current help centre.** `eventbrite.com/help/en-us/articles/560293/` ("Customize
your event link"), fetched 8 August 2026, describes it as a plain Event
Dashboard action: "Create a custom link for your event to make it more
personalized and easier to remember. To get started, go to your Event
Dashboard." The article contains **no** paywall language: I grepped it for
paid, upgrade, pro plan, professional, premium and not-available, and found
none of them.

**So one of the two premises in the brief does not hold, and it changes the
conclusion slightly.** The market gates a readable URL less uniformly than the
brief assumes. That weakens "everyone gates something" as a justification for
us gating something, and correspondingly strengthens the recommendation below.

**One correction to the record.** The moat analysis cites PosterMyWall at
"roughly a million" event templates. Their own current page says "over 2
million customizable templates". The comparison is worse for us than recorded,
not better.

**One finding the moat analysis missed.** Humanitix's promotional hub is not an
event-promotion tool at all. Its templates promote **the organiser's switch to
Humanitix**, and the help page's own recommended caption is an advertisement
for Humanitix's charity model ("We are thrilled to announce that we've switched
to Humanitix as our exclusive ticketing provider..."). It asks the organiser to
market the platform. **Inference: that is a materially weaker offering than
"pre-made Canva templates" implies, and it is a live opening.** Our composer
markets the organiser's night, not us.

### The recommendation

**Full fidelity, full downloads, working links, no watermark, no resolution
gate, no account.** A stranger gets the complete kit.

That is a deliberate departure from all four benchmarks, and it is defensible
for a reason none of them share: **our artefacts are not the product.** A story
card is a JPEG of the organiser's own artwork (Law 6: we never generate the
image, we render theirs). Canva must gate the export because the export is what
they sell. We sell a checkout. Giving away the JPEG costs us a JPEG and buys us
the surprise that acquires the organiser.

Precisely, per artefact:

| Artefact | Renders for a stranger | Downloadable | Notes |
|---|---|---|---|
| The event page | Yes, in full, at its own URL | It **is** a URL | `noindex`, unlisted, real design system |
| Story / square / tall cards | Yes, full size, full resolution | **Yes, free, unwatermarked** | |
| A4 poster PDF | Yes | **Yes, free** | QR resolves, see below |
| All six captions | Yes, full text | **Yes, copy to clipboard** | |
| The readable `/e/[code]` link | Yes, live from the moment the draft exists | Yes | see below |
| Checkout / taking money | **No** | No | Needs an account, an identity, and Stripe. Unavoidable and honest. |
| The reach panel with real numbers | Shown as an empty-state promise, never as zeros | No | Nothing to measure until something sells |

### The one design decision that makes free downloads safe

**Mint the `/e/[code]` at draft time and never change it.**

Before publish the code resolves to the draft's own preview page. After
publish the **same code** resolves to the live event. Same string, same QR,
forever.

This matters more than it looks:

- **Law 5 holds.** No artefact ever carries a dead link. A card downloaded at
  11pm and posted at midnight resolves to something real.
- **Nobody is burned by printing early.** The poster's printed URL does not
  change when they publish. Without this, free downloads would be a trap: we
  would be handing a promoter a poster whose QR breaks the moment they finish
  setting up.
- **The reach panel has data before publish.** Views and clicks accrue from the
  first share, so the panel is not empty at the moment it first matters. This
  also partly answers risk 1 in the moat analysis (the four zeros), because the
  first two numbers can be non-zero before a single ticket exists.

This is a sharpening of the REACH-AND-TIE proposal, which had the QR carrying a
preview URL captioned "goes live the moment you publish". Making the code
**stable across the publish boundary** is strictly better: the artefact is
genuinely finished at download time rather than provisionally correct.

### The copy at the boundary

Not "sign up to download". Nothing is being withheld, so nothing needs
justifying. The line states what is true and what is next:

> Your page is live at this link. Add your bank details and it can take money.
> Free events stay free.

**Inference:** this reads as the next step because it **is** the next step, and
it never implies the kit was a trailer for a paid thing.

---

## 0.2c DOES THE KIT PERSIST

### What people expect

The literal scenario in the brief (build at 11pm, close the tab, come back
tomorrow, same device, same browser) is already covered by the cookie PHASE-C
4.2 specifies: `el_kit_draft`, httpOnly, 72-hour max age, shipped in C2.

What the cookie does **not** cover is the second device, the cleared cookie,
private browsing, and sending the kit to someone else to look at.

### The recommendation: a bookmarkable link, plus an optional email, plus a claim

**Primary: a readable, unguessable kit URL** - `/launch/k/[code]` - displayed
on the reveal with a copy control. Anyone holding the link can open the kit for
72 hours. No email, no account, no gate.

**Offered, never required: "send this link to yourself"**, one field, one
button. This is how it becomes an email for the people who want one, without
becoming a wall for the people who do not.

**On signup: `attachDraftToAccount` claims the draft**, exactly as PHASE-C 4.4
specifies. Nothing new.

Rejected: **nothing persists** (loses the 11pm builder, and the brief is right
that this is the common case). Rejected as primary: **email required to save**
(it is the auth wall wearing a hat, and it is the exact inversion the whole
build exists to remove).

### The costs, including the one nobody has named

**Storage.** The draft row is small: a few KB of jsonb. That is not the cost.

**The cover image is the cost, and it is unbudgeted.** The existing upload path
caps at 4.5MB with client-side compression. An abandoned draft with a cover
leaves an object behind. At 1,000 anonymous drafts a day averaging 2MB, that is
**about 2GB a day, 60GB a month, of images belonging to events that will never
exist.** Nothing in PHASE-C 4.1 addresses object lifecycle; the nightly sweep
it specifies deletes expired rows only.

**This must be designed in, not bolted on:** anonymous covers go to their own
storage prefix with a 72-hour lifecycle rule, and the sweep deletes the object
alongside the row. Cheap if done now, painful later.

**Complexity.** Low. PHASE-C already specifies the table, the token hash, the
expiry and the sweep. The genuinely new pieces are the readable code and the
object lifecycle.

**What an unclaimed kit means.** It is a lead we cannot contact and a cost we
carry. At 1,000 drafts a day and a 72-hour expiry, steady state is about 3,000
rows, which is nothing. So **72 hours is right and should not be extended.** If
the founder wants a longer life, the honest price for it is the email, and that
trade should be made explicitly rather than by quietly raising the number.

---

## 0.3 THE SPREAD MECHANIC

The requirement: structural, inside the composer, at the moment of peak
impressiveness, not a campaign bolted on.

### The mechanic: THE BILL

The founder's own framing supplies the unlock: **a tagged performer is a future
organiser**, and on this platform the act and the organiser are frequently the
same person.

**What it is.** When the composer's extraction finds other named humans in the
organiser's own words (acts, comics, stallholders, speakers, the band, a
sponsor), it renders **one share card and one tracked link per person**, using
the same renderers, and presents them as a row: *Marlo's card. Kita's card.*

**Why it is structural rather than a campaign.** Four reasons, in the order
they matter:

1. **It produces a thing the organiser already wants to send.** Every promoter
   already tags the acts. We are not asking for a new behaviour, we are making
   an existing behaviour produce a better artefact.
2. **The act receives something they actually want and never get: their own
   number.** "Your link sold six" is the thing a support act has never once
   been told by a ticketing platform.
3. **The invitation is a by-product of the artefact, never a message.** The act
   lands on a page showing their card and their number. The offer sits under
   it, one line.
4. **Every name is a warm organiser lead arriving via someone they trust.**

### Correction after the roast: the emphasis above is backwards

My first draft called the cards the mechanic and the act's landing page an
"addition". **That is the wrong way round, and the roast caught it.**

The cards need a human to press send. **The act's landing page does not.** It
is reached by a tracked link that exists and works whether or not anybody
promotes us, and it is where a performer turns into an organiser. So:

- **The mechanic is the act's landing page.** It shows the act their own card,
  their own number, and offers the composer **pre-filled from the event they
  are already on**: same city, same venue, same category, their name in the
  title slot. A support act's first run costs them a sentence instead of a
  form.
- **The cards are the delivery vehicle** that gets a person to that page.

### Two things this needs that I did not list as new code, and should have

**1. The draft schema has no lineup field, so THE BILL cannot extract names
today.** I read `DRAFT_SCHEMA` myself: title, summary, description, category,
tags, communities, start_date, end_date, event_type, the five venue fields,
is_free, ticket_tiers, unresolved. **There is no performer or lineup field.**
So this mechanic requires a schema addition plus an extraction rule, and 0.1.3
above listed only "the spread mechanic" without saying so. Correcting that
here rather than letting it surface during the build.

**2. Name extraction will produce false positives at the worst possible
moment.** "Comedy night at the Prince" yields "the Prince", which is a pub.
Rendering a share card for a venue and calling it a performer, on the reveal
screen, in front of someone we are trying to impress, is worse than not
offering the feature at all. It must take the same high-precision, low-recall
posture `detectCommunitiesFallback` already takes for community ticks: **a
name is only a person when the signal is unmistakable, and returning none is
the correct answer for most events.**

### The second, weaker, universal vector

The kit link from 0.2c is shareable by construction. A person building at 11pm
sends it to a co-organiser to look at; that person opens a finished kit with a
"make one" control on it. **Honest assessment: this is weak per instance** (a
co-organiser is not reliably a future organiser) **but it fires for every
arrival including the ones THE BILL does not reach, and it costs nothing
because the link exists anyway.**

### My honest assessment of my own design

**How strong is it? Moderate. Clearly stronger than the zero that exists
today, and clearly weaker than the founder will want.** Three specific
weaknesses:

1. **It does not fire for everyone.** Against the six arrivals: strong for the
   market organiser (20 to 40 stallholders, many of whom run their own
   events), strong for the comedian (a room is four to six comics, most of whom
   run their own rooms), strong for the DJ. Moderate for the charity. Weak for
   the solo workshop host. **It correctly does not fire at all for the kids
   birthday**, and it must not.
2. **It still depends on the organiser pressing send.** We generate the card;
   a human still delivers it. That is a genuine gap between "structural" and
   "automatic", and I will not paper over it. The mitigation is that the act's
   own tracked link does work even when the organiser never sends anything
   privately, because a publicly posted lineup carries it.
3. **It has never been tested.** Everything above is reasoning. The
   falsification is cheap and should be named now: count signups whose first
   touch is an act's landing page. If that is zero after fifty events with
   named bills, the mechanic is decoration and should be cut rather than
   defended.

**Would I forward it?** Being honest as a promoter rather than as its author:
**I would send the cards, and I would not forward "try EventLinqs".** I send
the cards because they make my night look organised and cost me nothing. That
is precisely why the design must make the **artefact** the vector and the
invitation a by-product. **If any screen in this flow ever says "invite another
organiser", the mechanic has failed and should be considered a defect.**

---

## 0.4 THE COMPETITOR BENCHMARK, RESEARCHED

All four fetched 8 August 2026. Sources and quotations in 0.2a above.

### Verified, per product

**Luma** (`help.luma.com/p/promote-your-event`, `/p/event-referrals`). Ships a
**Share Event Poster** generator (shareable to Instagram Stories or saved), an
automatic screenshot-to-poster offer in the iOS app, event cover images, a
**QR code** that opens the event page, **per-guest referral links** with an
Insights tab showing "registration trends, top referrers, and traffic sources",
UTM `utm_source` support, discount codes, and a newsletter to calendar
followers. Referral tracking is **public events only**: verbatim, "On private
or members-only events, guests can still share the event link and others can
register, but referral tracking isn't available."

**PosterMyWall.** "over 2 million customizable templates designed with
promotional use in mind". Free tier at A$0 with limited free downloads;
high-resolution downloads from A$7.99; watermark removal is Premium.

**Canva.** Full editor free; watermarked draft download to preview premium
elements; paying removes the watermark.

**Humanitix.** Promotional hub = pre-made Canva templates promoting the switch
to Humanitix and its charity impact, edited in Canva, downloaded as PNG/JPEG,
posted manually. Requires the logged-in console.

**Australian ticketing platforms with a self-serve promo tool: still none
found.** Humanitix's hub is the closest and, as shown, is co-marketing rather
than event promotion. This is consistent with the repository's 2026-07-25
research, and the caveat travels with it: a universal negative cannot be
proven.

### Where the composer goes past them, precisely

**1. No account, and this is the only genuinely new thing.** None of the four
lets a stranger produce a finished, downloadable, event-specific asset set
without an account. Luma needs a host account and a created event. Humanitix
needs the console. Canva and PosterMyWall need an account to download, and
PosterMyWall additionally gates resolution.

**Downgraded after the roast, because I overstated it.** I did not drive an
anonymous flow on any of the four this session. "Requires an account" is read
from their own documentation describing logged-in paths, not observed. That is
the **strongest claim in this document resting on the weakest evidence.**

Restated at the strength the evidence actually supports: *no primary
documentation I found describes an anonymous path to a finished asset set.*
That is not the same sentence as "none of them lets you", and until someone
signs out and tries all four, the stronger sentence must not be repeated,
briefed to the founder as fact, or go anywhere near public copy. **Driving that
test takes about twenty minutes and should happen before the build starts.**

**2. Attribution to revenue rather than registrations or clicks.** Luma's
Insights rank **top referrers by registration** and UTM measures **traffic**.
Ours attributes **orders and tickets**. This is the differentiated claim and
the moat analysis was right to isolate it.

**3. Six per-channel captions, written.** Luma generates a poster; it does not
write the words. PosterMyWall gives a template to fill in. Canva gives a
canvas. On this axis nothing in the set competes.

**4. One code across every artefact.** Poster QR, story card, caption link and
share intent resolve to the same tracked code and land in one view.

### Where we are behind, stated plainly

- **Creative ceiling: permanently, decisively behind.** Two million templates
  against one designed system. We should never claim otherwise, and the honest
  position is that a promoter will use both.
- **Editability: behind.** They can change everything; we can change nothing.
- **Referral granularity: level at best.** Luma tracks per guest today. Ours is
  per channel, and only becomes per person once THE BILL ships.
- **Scheduling and the three-week campaign: absent on our side.**
- **Marketplace demand: Eventbrite and Luma have audiences. We have none.**
  No promo kit substitutes for that, and 0.5 is written so the product never
  implies otherwise.

---

## 0.5 THE FLOW

### The principle that answers "a promoter AND someone who has never sold a ticket"

**Never ask which they are, and never branch on it. Branch on what they
wrote.**

The composer opens with one field. The promoter types a dense line and gets
eight fields filled. The parent types a plain sentence and gets four. Neither is
asked a question they cannot answer; neither is shown a form full of blanks.

Three rules make this hold:

1. **The composer only shows fields the organiser's own words earned.** No
   lineup field unless names were found. No capacity field unless a number was
   found. A blank field is a question we failed to answer, and the deterministic
   floor exists precisely so there are almost none.
2. **No industry vocabulary anywhere on this surface.** Banned as labels:
   lineup, doors, presale, GA, tier, capacity, on-sale, allocation, comp.
   Plain replacements: "Who else is on?", "What time does it start?", "What
   does it cost?", "How many can come?". A promoter reads plain language as
   confident; a parent reads jargon as a locked door. Plain language is the
   only choice that serves both.
3. **Nothing explains itself unprompted.** Explanation appears on focus or on a
   quiet control, never as standing body copy. Over-explaining is how the
   promoter is insulted.

### The screens

**Screen 1, the promise.** `.hero-marketing` scale, licensed photography, gold
eyebrow, the homepage display scale. One field: "Describe your event the way
you'd tell a mate." One secondary control: "or fill it in yourself." No pricing
table, no feature grid, no second CTA. Hero content staggers per the Motion law;
the raster never animates.

**Screen 2, the composer.** Two columns inside `max-w-7xl`, stacked at 390.
Left: only the earned fields, each pre-filled, the organiser's job being
subtraction. Right: the live preview assembling as they type. Draft saves
server-side, debounced, per PHASE-C 4.2.

**Screen 3, the reveal.** The choreography in PHASE-C 4.3 stands and I would
not change its timings. Every artefact is genuine renderer output. Two
amendments:

- The card that leads is chosen by what they are running, not fixed. A DJ leads
  with the story; a market leads with the square; a workshop leads with the
  page. Same renderers, different order.
- **THE BILL appears here**, as a row of per-person cards, only when names were
  found.

**Screen 4, what is next.** The kit link with a copy control, the optional
"send it to myself" field, and the honest boundary line from 0.2a. The reach
panel appears as its designed empty state, never as four zeros (that state was
built and walked on `feat/launch-kit-artefacts`, per the walk document's B2
section).

### Every failure path

| Failure | What the stranger sees |
|---|---|
| No AI key configured | A complete kit, from the deterministic floor. **They never learn there was an AI.** No apology, no degraded badge, no "limited mode". |
| Monthly budget exhausted, or daily ceiling hit | Identical to the above. |
| Rate limited | Identical to the above. |
| Model returns an unusable draft | Identical. `buildDeterministicDraft` is the floor under every branch. |
| Copy pass fails but extraction succeeded | Extraction prose stands (already the shipped behaviour). |
| A field is still telling after one regeneration | Field ships blank and flagged, and the composer asks one plain question for it. Never a tell. |
| Description too thin ("party saturday") | A real kit with the found facts, and **only** the unresolved fields shown, each as one plain question. Never a blank form, never "we could not understand that". |
| Venue cannot be resolved | Suburb-level fallback; the card shows the suburb. **The composer never depends on a map** (an empty `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` has already caused a live map failure on this platform once). |
| No cover image uploaded | The branded typographic composition that already exists. Law 6 holds: we never generate an image. |
| Cover upload fails or is oversized | Existing client compression and 4.5MB cap; on failure, the typographic composition, with the upload still offered. |
| Draft expired (past 72h) | The kit link explains it in one line and offers to rebuild from the same description, which is still in the URL-independent payload until the sweep runs. After the sweep: one field, pre-filled with nothing, no dead end. |

No blank fields. No apologetic copy. No dead ends. No empty state that shows
nothing where it could show a beginning.

---

## 0.5b THE SIX ARRIVALS

Walked screen by screen. **Three defects found, one of them serious.**

| Arrival | What they type | Fit | Defect |
|---|---|---|---|
| **DJ** | "Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th, doors 10, $25 presale" | Good. Story card leads. THE BILL fires on two names. | none |
| **Comedian** | "Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door" | Good after D1. THE BILL fires as an invitation to name the five. | **D1 recurring** |
| **Market organiser** | "Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm, Johnstone Park" | Strong. THE BILL is at its best here. | **D1 recurring**, **D2 free-event framing** |
| **Workshop host** | "Pottery workshop, 6 places, $85, Saturday 27th 10am, my studio in Newtown" | Good. No BILL, correctly. Capacity captured. | **D3 home address** |
| **Charity fundraiser** | "Trivia night for Geelong Animal Rescue, Sat 12th, $30 a head, tables of 8, at the RSL" | Good. Group buying exists (`squad-checkout`). | fee clarity, below |
| **Kids birthday** | "Ruby's 16th, Saturday 20th, 6pm at our place in Belmont, about 40 kids, no charge" | **BREAKS** on two screens as currently designed. | **D3 home address**, **D4 public listing** |

### D1. Recurring events are not built, and three of six arrivals say a recurring phrase

"First Tuesday every month", "third Sunday" and their variants are the normal
way these organisers describe their event. Recurrence is not built
(founder-supplied, recorded in the moat analysis as gap 9).

**This does not require building recurrence.** It requires the composer to
answer honestly instead of silently picking a date:

> You said every month. This sets up the first one, Tuesday 2 September. You
> can copy it for the next one in a couple of taps.

Silently picking one date is the defect. A designed sentence is the fix, and it
costs a string plus a detection rule the deterministic layer can already carry
(it is the same shape as `weekdayDisagrees`, which exists).

### D2. A free event cannot be told a revenue story

The market organiser and the birthday are free. Free events are free (locked fee
structure), so there is no order, no revenue, and nothing for revenue
attribution to attribute. The whole "tickets sold, attributed to the channel
that sold them" positioning is **meaningless to them and must not be shown.**

Fix: the reach framing is chosen by the event, not fixed. Paid events lead with
tickets sold. Free events lead with **who is coming**. The measurement is real
in both cases; only the noun changes.

### D3. A private residence must never be published

The workshop host says "my studio", the birthday says "our place in Belmont".
Publishing a home address on an indexable page is a safety problem, not a
preference.

Fix: when the venue resolves to a private residence or the organiser's own
words say so, the composer defaults to showing the **suburb only** until
someone books, and says so in one line. High precision, low recall, exactly the
posture `detectCommunitiesFallback` already takes for community ticks.

### D4. The kids birthday must not be publicly listed, and today it would be

**This is the serious one.** A 16th birthday at a home address with 40 minors
would, on the current design, be published to the discovery feed and surface on
city and community pages by query. That is a child-safety failure, not a design
nit.

**Good news, verified this session:** the schema already supports it. READ,
`origin/main:src/types/database.ts:4586` -
`event_visibility: "public" | "private" | "unlisted"`. So the fix is composer
behaviour, **not a migration.**

Fix, in three parts:

1. **Infer and default.** A person's name plus an age, "our place", a private
   residence, "no charge", a guest count rather than a capacity: the composer
   defaults to **unlisted** and says so plainly ("This one stays off the public
   listings. Only people with your link can see it.").
2. **Confirm, do not ask cold.** The visibility control is visible and
   one-tap reversible, never a modal question the parent has to have an opinion
   about.
3. **Change the kit.** For an unlisted event, the discovery promise is removed
   entirely, the reach panel becomes an RSVP count, and the artefact set narrows
   to the page, the invite card and the link. THE BILL does not fire.

**Inference:** this arrival is also the one that most resembles a product with
an existing large market, and serving it properly costs very little because
every piece already exists. But it must never be served by accident.

### The fee point, which is not a defect but is a trap

The charity fundraiser will care about fees more than any other arrival. The
ACCC all-in display law already requires the true total shown clearly and early
on the ticket-selection surface. On the composer the risk is the opposite one:
turning the reveal into a pricing page. The resolution is one line, once, at the
boundary in 0.2a, showing what the buyer pays and what the organiser receives,
using the live value from `getPricingRule` and never a hardcoded number.

---

## THE TWO DECISIONS I AM NOT MAKING

Per the brief, 0.2 and 0.3 are founder rulings. My recommendations are above;
these are the two where I would most want to be overruled if the founder
disagrees, because they are judgement rather than evidence:

1. **Free, unwatermarked downloads for anonymous strangers** (0.2a). Every
   benchmarked product gates the export. My argument is that our artefacts are
   not our product, so the usual reason to gate does not apply. If the founder
   reads that as giving away the surprise for nothing, the fallback that costs
   least is: cards and captions free, **the print-ready A4 PDF** on claim,
   since it is the artefact with the clearest standalone value and the weakest
   link to our checkout.

2. **THE BILL as the spread mechanic** (0.3). It fires for four of six
   arrivals and depends on a human pressing send. If the founder wants a
   mechanic that fires for all six without a human in the loop, I do not have
   one, and I would rather say so than invent one.

## THE CLAIM THIS DESIGN RESTS ON, AND WHY IT IS NOT PROVEN

The whole design turns on one sentence: **seeing the kit is the surprise.**
The roast forced me to check whether I had earned it. I had not, and I am not
going to bury that.

**What I did verify about the artefacts.** I opened the real rendered poster
from `feat/launch-kit-artefacts` (`docs/roast/walk-2026-08-08/artefacts/light-poster.pdf`,
125,490 bytes). It embeds a JPEG cover (`DCTDecode` present), carries **four
images** (cover, QR, organiser mark, wordmark) and **33 text-show operators**,
so the type is real vector text and not a rasterised picture of text. It is
structurally a genuine print-ready artefact.

**What I could not verify.** I could not look at it. Rendering a PDF page needs
poppler, which is not installed in this environment. **And the card images and
screenshots the walk document cites are not in the repository at all** - the
walk references `shots/w10-kit-1440.png` and `shots/w5-poster-band-AFTER-fix.png`,
but the only committed evidence under `docs/roast/walk-2026-08-08/` is the two
PDFs and two JSON files. So the visual proof that branch reports does not
currently exist anywhere a reviewer can see it.

**Three reasons to doubt the surprise, stated against my own design:**

1. **At the recommended budget, most strangers get the deterministic floor, not
   the model.** I derived that myself in 0.2b and then designed a flow whose
   promise is quality. Deterministic prose from parsed facts is competent. The
   moat analysis already judged the poster "willing, not pleased", and nothing
   here fixes the artefact. **A better door on a merely good room is not a
   surprise.**
2. **The competitor evidence argues against it.** Two million templates at
   PosterMyWall; a free Canva editor. A promoter who has used either is not
   surprised by one designed template rendered quickly.
3. **"Completeness is surprising" is an untested opinion.** I asserted the
   surprise comes from completeness plus attribution rather than from craft. I
   have no evidence for that, and presenting it as a design foundation is the
   exact failure the roast's Phase 5 forbids.

**So the honest verdict: this design maximises the chance of surprise and does
not establish it.**

## FOUR PREREQUISITES, EACH CHEAP, BEFORE A LINE OF THE COMPOSER IS WRITTEN

1. **Put a rendered kit in front of five real promoters and watch.** Count how
   many ask how it was made. This settles the central claim and costs an
   afternoon. If none of them react, the composer is the wrong build and the
   artefacts are the right one.
2. **Blind-compare the deterministic floor against the AI output** with real
   organisers. The floor will be the normal path most of the month; nobody has
   ever judged it as the product.
3. **Sign out and drive Luma, PosterMyWall, Canva and Humanitix**, to convert
   the no-account claim from documentary to observed. Twenty minutes.
4. **Run `count_tokens` against the real prompt** once a key is available, to
   replace the stated 3.6 characters-per-token divisor with a measurement.
   Every figure in 0.2b depends on it.

## WHAT I HAVE NOT DONE

- No product code. `src/app/launch` does not exist.
- No migration, no RLS change, no touch to `src/proxy.ts` or the payment engine.
- No branch other than `feat/public-composer` modified.
- I did not drive an anonymous flow on Luma, PosterMyWall, Canva or Humanitix.
- I could not measure exact token counts (no API key in this tree), so every
  cost figure in 0.2b is DERIVED at a stated 3.6 characters per token.
- I did not visually inspect any rendered artefact, only its structure.
- **I did not capture competitor create-flow evidence at 1440 and 390.** Law 2
  requires Phase A to be built from captured evidence, and the screen design in
  0.5 is therefore reasoned rather than evidence-derived. That capture is owed
  before the build, not after.
- I did not verify Canva's **event templates** specifically (only its gating
  mechanic), and I checked only Humanitix among Australian ticketing platforms;
  TryBooking, Oztix and Moshtix are carried second-hand from the moat analysis.
