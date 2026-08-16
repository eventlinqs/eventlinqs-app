# Production sweep, continued: A to E

Branch `fix/production-sweep`, worktree `C:/Users/61416/OneDrive/Desktop/EventLinqs/el-prod-sweep`.
Started from `ffe2f0f` (32 commits on `main`). Item 1, the platform-wide timezone
class, was already landed at `acee679`.

Progress is written after every item. Anything not finished is named here as NOT
DONE with what a user experiences until it is fixed.

---

## Working-environment findings (recorded because they invalidated an instrument)

**The worktree had no `node_modules` at all.** The entry existed as a dangling
junction, so `ls -d node_modules` succeeded while `ls node_modules` failed. A
first `npx tsc --noEmit` returned exit 0 against that, and it was NOT evidence:
there was no local TypeScript for it to use. That green was withdrawn rather
than reported. This is the D7 pattern exactly, caught on the instrument rather
than the code, and it is why the checklist in D7 exists.

**A second false green, from the same family, one hour later.** `npm ci` was run
as `npm ci ... 2>&1 | tail -15`. It FAILED with `ECONNRESET` and the harness
reported **exit code 0**, because a pipe reports the exit code of the LAST
command, which was `tail`. Every `npm`/`tsc`/`vitest` invocation in this session
now writes to a file and echoes `$?` directly. Two instruments lied inside one
hour, neither about the code, both about whether a check had run at all.

Second-order finding: junctioning the worktree at the main repo's `node_modules`
gets vitest and tsc running, but that store is missing four packages this branch
needs (`@anthropic-ai/sdk`, `@googlemaps/js-api-loader`,
`@googlemaps/markerclusterer`, `@axe-core/playwright`), which produce 16 tsc
errors (8 x TS2307 plus implicit-any knock-ons) that belong to the store and not
to the branch. A real `npm ci` in the worktree is the only trustworthy base for
the build and the browser walks. The missing maps loader is directly relevant to
C4.

---

## A. THE LAUNCH BLOCKER

### A1. Why organiser signup actually failed. ROOT CAUSE FOUND AND REPRODUCED.

The founder saw, in a clean incognito window at `/signup?role=organiser`:

> Something went wrong on our side. Please try again, and contact us if it keeps happening.

**Root cause: a substring match defeated by one word.**

`src/app/api/auth/signup/route.ts` called
`admin.auth.admin.generateLink({ type: 'signup' })` and, on error, decided
whether the address was already taken by testing `error.message` for three
substrings: `already registered`, `already exists`, `user already`.

Reproduced against the TEST project (`vkapkibzokmfaxqogypq`) on 2026-08-09 by
creating a confirmed user and re-running the route's exact call. GoTrue answers:

```
error.status  : 422
error.code    : "email_exists"
error.message : "A user with this email address has already been registered"
```

The real string is "already **been** registered". It contains none of the three
substrings tested. Every duplicate signup therefore fell past the helpful branch
into `authMessage('unknown')`, which is the founder's sentence verbatim.

The founder's own account of the workaround confirms the shape: he recovered by
running a password reset **on an existing account**, so the address he typed was
already registered and confirmed. That is the reproduced case.

A second reproduction established a related fact worth recording: for an
already-registered but **unconfirmed** address, `generateLink` does not error at
all. It returns the same user id and a fresh token, so that path is a silent
re-send and never reached the "account exists" branch either.

**Every condition that produces the generic message, and whether production can
reach it today.**

| # | Condition | Reachable on production | Notes |
|---|---|---|---|
| 1 | Duplicate confirmed address (`email_exists`, 422) | **YES. This is the founder's case.** | Proven by reproduction |
| 2 | Supabase project unreachable, paused, or bad service-role key | YES | Falls to `unknown` |
| 3 | GoTrue password policy stricter than our 8-char rule (`weak_password`) | YES if policy tightened in the dashboard | Client checks length only |
| 4 | Address Zod accepts but GoTrue refuses (`email_address_invalid`) | YES | Blocked domains, stricter parser |
| 5 | GoTrue's own auth rate limit | YES | Distinct from our limiter |
| 6 | `handle_new_user` trigger failure (`unexpected_failure`) | YES | Any DB error creating the profile row |
| 7 | Platform 500 / proxy page / gateway timeout, no JSON body | YES | `payload.error` undefined, form fell to `unknown` |

**A separate defect found in the same path, and arguably worse.** The signup form
rendered `payload.error`, the class TOKEN, where its three sibling forms
(`login-form`, `forgot-password-form`, `resend-verification-button`) all render
`payload.message`, the sentence. The rate limiter's 429 body is
`{ ok:false, error:'rate_limited', message:'Too many requests...' }`. So a
rate-limited signup printed the literal string **`rate_limited`** into the red
box. Signup was the only one of the four endpoints on the wrong contract, on
both the sending and the receiving side.

That path is not hypothetical: `auth-signup` is `failClosed: true`, so an Upstash
outage returns 429 to **every** signup, and every one of them would have shown
the word `rate_limited`.

### A2. The message. FIXED.

**Research (Law 7, primary sources only).**

- OWASP Authentication Cheat Sheet, "Incorrect and correct response examples":
  lists **"This user ID is already in use."** as an INCORRECT registration
  response and **"A link to activate your account has been emailed to the
  address provided."** as the correct one. OWASP's registration pattern is to
  answer duplicate and fresh addresses identically and disambiguate by email.
- OWASP Forgot Password Cheat Sheet: "Return a consistent message for both
  existent and non-existent accounts."
- Eventbrite Help Centre, "Troubleshooting guide: Logging in to Eventbrite":
  "For security, your account is temporarily locked after 10 incorrect log in
  attempts. **Wait six minutes** to try again, or reset your password." A named
  wait and a named alternative.
- Eventbrite Help Centre, "Transfer Eventbrite account ownership": "If the email
  you want to change to is **already in use**, the account owner will need to
  either change their account email address or close their account." Eventbrite
  discloses existence.
- Humanitix: no published page found stating duplicate-signup behaviour.
  **UNSOURCED** rather than guessed.
- Ticketmaster, DICE, TryBooking, Moshtix, Oztix: no published page found
  stating duplicate-signup behaviour. **UNSOURCED.**

**The enumeration tension, and how it is resolved rather than picked silently.**

The two pulls are real and they point opposite ways. OWASP says do not confirm
an address is registered. The founder's requirement is that a person must know
whether to try a different email, a different password, wait, or contact us,
and "we emailed you something" does not answer that at the moment it is asked.

Resolved by **splitting on surface, because the risk is not uniform across
them**, and recording the decision in the copy deck itself so it reads as a
decision and not an oversight:

- **Sign-in, password recovery, magic link and verification resend keep the
  generic response.** That is where OWASP's rule bites hardest and where the
  existing code was already correct. Unchanged by this pass.
- **Registration names the duplicate.** What it costs, stated plainly: an
  attacker gains an email-existence oracle at the signup endpoint. What bounds
  it: the `auth-signup` limiter, 5 per IP per 10 minutes, unchanged. What it is
  not: a credential oracle, because sign-in and recovery still answer
  generically, so learning that an address is registered yields nothing
  further. Why it is worth it: on a public ticketing platform an organiser's
  contact address is routinely printed on their own event page, so the fact is
  of low sensitivity, and a stranded signup at the top of the acquisition funnel
  is not. Eventbrite, the benchmark, discloses the same fact.

This is a founder-visible product decision, so it is flagged rather than buried.
If the founder prefers OWASP's stricter pattern, the change is small and local:
answer 200 for a duplicate and send a "you already have an account" email
instead. Say the word and it flips.

**What each case now shows.**

| Case | Before | After |
|---|---|---|
| Email already registered | "Something went wrong on our side..." | "An account already uses that email address. Sign in instead, or reset your password if you have forgotten it." plus **Sign in** and **Reset your password** links |
| Password fails policy | "Please check your details and try again." | "Password must be at least 8 characters." |
| Rate limiter fired | the literal token **`rate_limited`** | "Too many attempts from this connection. Wait 10 minutes and try again." (the real wait, from the server) |
| Verification email could not send | (correct already) | "We could not send that email just now. This is a problem on our side, not with your account. Please try again in a few minutes." |
| Address GoTrue refuses | "Something went wrong on our side..." | "That email address was not accepted. Check it for a typo, or try another address." |
| Full name missing | "Please check your details and try again." | "Enter your full name." |
| Confirmation link could not be generated | "Could not generate confirmation link. Please try again." | "We could not start the email confirmation for that account. Nothing was saved, so please try again in a moment." |
| Supabase unreachable / anything unclassified | "...contact us if it keeps happening." with no route | "Something went wrong on our side, and no account was created. Please try again in a moment. If it keeps happening, contact us and we will sort it out." plus a **Contact us** link |

**How the fix works.** Classification moved off `error.message` and onto
`error.code`, via the `classifyAuthError` table this codebase already had and
this route was not using. `email_exists` and `user_already_exists` map to a new
`email_exists` class; `email_address_invalid` maps to a new `email_invalid`
class. A message fallback remains for the case where GoTrue sends no code, but
it is now a gap-tolerant pattern (`/already\b.{0,20}\b(registered|exists|in
use|taken)/`) rather than three fixed substrings, because one extra word is
exactly what broke the last one.

The route now answers on the house contract (`{ ok, error, message }`) that the
other three auth endpoints already used, with a real status per class (409 for a
duplicate, 429 rate limited, 502 mail transport). The form reads `message` like
its siblings, and uses the limiter's own `retryAfterSeconds` to name the wait,
to the Eventbrite standard.

**Guard hole closed while here.** `tests/unit/auth/auth-errors.test.ts` iterated
a hand-maintained array of failure classes, so a newly added class was exempt
from every copy rule the gate enforces (length, banned punctuation, no leaked
internals) while the suite stayed green. It now derives from
`ALL_FAILURE_CLASSES`, read back off the `MESSAGES` table, which the compiler
already forces to be exhaustive. Same shape of hole as the two in B.

**Tests: 37 passing, and drilled in both directions.** With the fix removed
(code map keys renamed, regex neutered), 5 tests fail with
`AssertionError: expected 'unknown' to be 'email_exists'`, which is the
founder's bug restated by the suite. Restored, all 37 pass.

**NOT DONE on A: the browser walk.** The cases above are proven by reproduction
against TEST and by unit test. They have NOT yet been triggered in a real
browser at 390 and 1440 with screenshots, because the worktree had no usable
toolchain until the install now running. Until that is done, A is not finished
to the standard of this brief.

---

## B. THE FOUR RATCHETED TIMEZONE SITES. LIST CLEARED.

`KNOWN_UNFIXED` is now empty. Each needed `events.timezone` threaded through a
different chain, and each chain had a different missing link.

| Site | What was wrong | The chain that now carries the zone |
|---|---|---|
| `ticket-selector.tsx` (done first) | "Sale opens" formatted with `toLocaleString` and no zone | `events/[slug]/page.tsx` -> `TicketPanelClient` -> `TicketSelector` (new `eventTimezone` prop) |
| `trending-events-bento.tsx` | `formatDateBadge` bare `toLocaleDateString` | `EVENT_SELECT` (timezone added to the column list) -> `RawRow` -> `toBentoEvent` -> `BentoEvent` |
| `surprise-me-modal.tsx` | `s.startDate` bare | `/api/home/surprise` select -> `Suggestion` payload -> modal (and `InitialSuggestion` on the button) |
| `artists/[slug]/page.tsx` | `credit.startDate` bare | `fetchArtistCredits` select -> `ArtistCredit` |

Two of those queries were explicit column lists that did not select `timezone`
at all (`EVENT_SELECT`, `fetchArtistCredits`), so the prop could not have been
threaded without touching the query. `/api/home/surprise` was a third.

Formatting goes through `src/lib/dates/event-time.ts`, the module that already
owns this. Two helpers were added to it rather than re-rolling options inline:
`formatEventDateTimeCompact` (the ticket picker's medium/short pairing, kept to
the character so the fix changes no layout) and `formatEventMonthYear` (the
artist credit).

Why the ticket picker was first, and it was the right call: the "Sale opens"
line is the only one of the four where a wrong time costs a sale directly. A
sale opening at 6pm Perth read as 8pm to a buyer in Sydney, so they came back
after it had started.

### The two guard holes: CONFIRMED CLOSED, and a THIRD one found

Not taken on the comments' word. Three drill files were planted under `src`, the
guard was run, and it caught all three; they were then deleted and the guard went
green again.

1. **The `use client` hole: CLOSED.** The guard no longer skips a file for the
   directive. Only `useHydrated` exempts, which is the deliberate pattern.
   Drilled with a `'use client'` file carrying a bare `toLocaleDateString`:
   caught.
2. **The `toLocaleString`-only hole: CLOSED.** `TO_LOCALE` now matches
   `new Intl.DateTimeFormat(` as well. Drilled: caught.
3. **NEW, THE THIRD HOLE: the walk collected only `.tsx`.** 345 of the 788
   TypeScript files under `src` were never scanned, and the guard reported clean
   over all of them. So the answer to "does the guard now walk all of src" was
   NO until this pass. Now `/\.tsx?$/`. Drilled with a `.ts` file: caught.

**What the third hole was actually hiding: two files, not the alarm I first
raised.** Extending the walk surfaced `src/components/payouts/format.ts` (two
formatters) and `src/lib/payouts/email.ts` (one). Payout dates are not an
event's, so per the module's own rule they now take `PLATFORM_TIME_ZONE`. The
harm was real: "when do I get paid" rendered in UTC on the server and in the
organiser's zone in the browser, so it both mismatched on hydration and could
read as the wrong day; the emailed version was simply UTC and could be a day off.

**A correction to my own earlier claim in this document.** While probing the
third hole I reported that the order confirmation email, the city digest, the
poster route and the attendee export all formatted an event date with no
`timeZone`. That was WRONG, and it was my own false positive: I grepped
line-by-line and excluded lines containing `timeZone`, but these are multi-line
option objects whose `timeZone` sits several lines below the call. All four
pass one correctly. The instrument was mine and it lied in exactly the way D7
describes, which is why it is written down here rather than quietly dropped.

**Verification.** Guard green with the empty ratchet and `.ts` scanning. Full
unit suite green: **136 files, 1479 tests, exit 0**, with the exit code captured
directly rather than through a pipe (see the npm footgun below). `tsc --noEmit`
exit 0, zero errors.

**NOT DONE on B: the browser walk.** Proven by guard, type system and unit
suite. Not yet walked at 390 and 1440 with screenshots.

---

## C1. THE IMAGE LIMIT. FIXED.

The founder was refused with "Image is too large in pixels: 3625 x 4961. The
maximum is 4000 x 4000." That is ordinary phone and camera output.

**Research (primary sources only).**

- **Humanitix help centre**, "How to style your event page": "**Event banner
  specifications:** 2:1 Ratio. Recommended min **3200px by 1600px**. JPEG, PNG,
  SVG, GIF (Static image). **Max size 10MB**." No pixel ceiling is published at
  all, and note they RECOMMEND a 3200px minimum, so an organiser following
  Humanitix's own advice could be refused by our old rule after a modest crop.
- **Humanitix help centre**, ticket/package images: "Image aspect ratio = 2:1 ...
  **Max size = 10mb**". Again a byte cap, no pixel cap.
- **Eventbrite help centre**, "How to choose a great event image": "If your
  image is not 2:1 (twice as wide as it is tall), your **focus point will be
  used to crop your image** for your event listing." Eventbrite PROCESSES
  server-side rather than refusing. (Their numeric requirements sit behind a JS
  tab on that page and did not render in the scrape, so they are not quoted.)
- **Eventbrite**, own blog, "Easily upload your main event image": "As of July
  2015, we've increased the size limit to **10MB**."
- Ticketmaster, DICE, TryBooking, Moshtix, Oztix: no published organiser image
  specification found. **UNSOURCED.**

The founder's expectation is confirmed by the evidence: the market caps by FILE
SIZE and resizes, and EventLinqs was the outlier in refusing on pixels.

**The fix.** `MAX_IMAGE_DIMENSION` (a hard reject) is replaced by
`MAX_STORED_IMAGE_DIMENSION` (a downscale target, still 4000). The pipeline now
resizes with `fit: 'inside', withoutEnlargement: true`, so aspect is preserved,
a small image is passed through untouched, and nothing is refused for being big.
The only pixel limit that still refuses is a new decompression-bomb guard,
`MAX_SOURCE_IMAGE_PIXELS = 80_000_000`, enforced both as a friendly check and
inside sharp via `limitInputPixels` so it cannot be talked past.

`MAX_IMAGE_BYTES` stays at 10MB, which is exactly where both benchmarks sit.

**A correctness bug fixed with it.** The pipeline returned the SOURCE width and
height. Now that images are resized, that would have recorded a 4961px height
for a 4000px file, and every consumer of those numbers (aspect ratios, srcset
hints, the media components) would have been wrong. Dimensions are now read back
off the encoder via `toBuffer({ resolveWithObject: true })`.

**Why the client-side compressor did not save him.** `prepareImageForUpload`
returns early when the file is already under the transport cap
(`if (file.size <= TRANSPORT_SAFE_BYTES) return file`). A well-compressed 18MP
photo is under that cap, so it was passed through at full dimensions and the
server rejected it on pixels. That is exactly the shape of his report.

**Cost, measured, at `scripts/verify/image-ceiling-proof.mjs`** (sharp 0.34.5 /
libvips 8.17.3). Timings exclude generating the test source and use a NOISE
raster, which is the worst case for the JPEG encoder; a real photograph is
faster and compresses better.

| Case | Source | Result | Time | RSS delta |
|---|---|---|---|---|
| **the founder's image** | 3625 x 4961, 18.0MP | **2923 x 4000** | 3414ms | +5MB |
| typical 12MP phone | 4032 x 3024 | 4000 x 3000 | 3808ms | -13MB |
| 48MP phone | 8000 x 6000 | 4000 x 3000 | 3299ms | -11MB |
| **50MP camera** | 8660 x 5773 | 4000 x 2667 | 2822ms | -35MB |
| already within bounds | 2160 x 1080 | unchanged | 803ms | -38MB |
| decompression bomb | 12000 x 9000, 108MP | REFUSED | n/a | n/a |

**What happens to a 50 megapixel upload on a slow mobile connection**, asked
directly in the brief: the pixels are not the binding constraint, the bytes are.
A 50MP photo is normally well over the 10MB cap, so it is refused at the client
before a single byte is sent, which is the right place to refuse. If it IS under
10MB, the upload takes as long as 10MB takes on that connection (roughly 80
seconds at 1Mbps) and then about 2.8 seconds of server processing. RSS was flat
or negative in every measured case because libvips streams rather than holding a
full RGBA bitmap, so the 80MP guard is a ceiling on pathological input rather
than a description of normal cost.

**Tests: 14 passing against the REAL pipeline**, not a reimplementation. My
first proof script mirrored the sharp chain rather than importing
`processEventImage`, which would only have proven that sharp works; the vitest
suite drives the actual exported function. The pre-existing test
`rejects an over-size image (> 4000px)` asserted the DEFECT as if it were a
requirement, so it was replaced rather than relaxed.

Drilled in both directions: with `MAX_STORED_IMAGE_DIMENSION` raised so no
downscale occurs, two tests fail with `expected 4961 to be 4000` and
`expected 8000 to be 4000`.

**NOT DONE on C1: the browser upload.** Proven end to end through the real
server pipeline at the founder's exact dimensions, and by measurement. NOT yet
uploaded through the organiser wizard in a browser, which is what the brief asks
for. That is the first action in the handover below.

---

## C4. THE MAP. DIAGNOSED, NOT FIXED, AND BLOCKED ON A FOUNDER ACTION.

**What it is.** The platform calls the deprecated `new google.maps.Marker(...)`
in four places, one of which is the event page:

| File | Line |
|---|---|
| `src/components/features/events/venue-map.tsx` (the event page) | 125 |
| `src/components/features/city/city-map.tsx` | 116 |
| `src/components/features/events/m5-events-map.tsx` | 121, 187 |

**Why it appears.** Google, own documentation, "Advanced Markers migration":
"As of February 21st, 2024 (v3.56), `google.maps.Marker` is deprecated. We
encourage you to transition to the new `google.maps.marker.AdvancedMarkerElement`
class." Our loader pins `v: 'weekly'`, so the deployment tracks Google's newest
weekly release and sees deprecation surfacing soonest.

**Honest limit on this diagnosis.** Google's migration page documents the
deprecation but does NOT state that a notice is shown to end users, so I have
confirmed the deprecated call and the deprecation, but I have NOT confirmed that
this specific deprecation is the notice the founder saw. Confirming that needs
the event page opened in a browser with the console read. The other candidates
that render an on-map notice are a billing-disabled watermark ("For development
purposes only") and an API-key error dialog ("This page can't load Google Maps
correctly"), both of which are account configuration rather than code. The first
action on this item is to look, not to assume.

**Why it is not fixed in this pass: it is blocked on the founder.**
`AdvancedMarkerElement` REQUIRES a Map ID ("you must include `mapId`"). There is
no Google Maps Map ID anywhere in this repo. `src/lib/env/manifest.mjs` declares
only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY`. So the
migration needs, in order:

1. Lawal creates a Map ID (vector, JS) in the Google Cloud console.
2. It is declared in `src/lib/env/manifest.mjs` as
   `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` per `docs/ENV-DOCTRINE.md` and set in both
   stores.
3. Only then can the four call sites migrate, because a map without a Map ID
   silently renders no advanced markers at all, which would be a worse defect
   than the notice.

Guessing a Map ID or hardcoding Google's `DEMO_MAP_ID` would ship a map whose
pins vanish in production. Not done rather than done wrong.

---

## C2, C3, D1 to D7, E: NOT STARTED

Nothing was begun on these. See the handover.

---

# HANDOVER, in order

Context ran out with A, B and C1 landed and committed. Nothing below is
half-finished: each item is either fully done and committed, or untouched.

**Landed and committed on `fix/production-sweep`:**

| Commit | Item |
|---|---|
| `5155f83` | A1 + A2, the signup blocker |
| `e966654` | B, the four timezone sites + the third guard hole |
| `80efdf9` | C1, the image ceiling |

**The environment first, before any other work.** The worktree at
`C:/Users/61416/OneDrive/Desktop/EventLinqs/el-prod-sweep` now has a real
`node_modules` (664 packages, `npm ci` exit 0 verified directly). Do not junction
it at the main repo's store: that store is missing four packages this branch
needs and produces 16 phantom tsc errors. NEVER pipe a gate command to `tail` or
`head`; redirect to a file and echo `$?`, because a pipe reports the exit code of
the LAST command and this session had `npm ci` fail with ECONNRESET while
reporting exit 0.

**Next actions, in order:**

1. **The browser walks owed on A, B and C1.** All three are proven by
   reproduction, type system and unit suite, and NONE has been walked in a
   browser at 390 and 1440 with screenshots, which this brief requires before
   anything is called done. For A the cases to trigger are listed in the A2
   table; the error box now carries `data-auth-error="<class>"`, so assert on
   that attribute rather than matching the sentence (D7). For C1, upload a real
   3625 x 4961 file through the organiser wizard.
2. **C4, look before touching.** Open a live event page, read the console, and
   identify the actual notice. Then either raise the Map ID request with Lawal
   (if it is the marker deprecation) or fix billing/key (if it is the watermark
   or the key dialog).
3. **C2**, wizard validation on the step it lives on. Untouched.
4. **C3**, ticket tier Name versus Type. Untouched.
5. **D2 before D3**, since D3 is blocked on it. Note that `auth-login` is
   `limit: 10, windowSec: 600, failClosed: true` in
   `src/lib/rate-limit/policies.ts`; `applyRateLimit` in
   `src/lib/rate-limit/middleware.ts` is the single choke point, so a
   non-production bypass belongs there and nowhere else.
6. **D1**, the four lifecycle dispatchers. Untouched and the largest remaining
   item.
7. **D4, D5, D6, D7.** D6 and D7 are pure documentation and cheap; do not let
   them fall off the end again. This session produced fresh material for both:
   two instruments lied within one hour (a dangling-junction `npx tsc` returning
   exit 0 with no TypeScript installed, and `npm ci | tail` masking an
   ECONNRESET failure as exit 0), and one of my own greps produced a false
   positive about four email files by matching line-by-line against a
   multi-line options object.
8. **E**, gates, both roast rounds, PR.

**A founder decision is waiting** in A2: registration now names an existing
account, which is a deliberate departure from OWASP's stricter registration
pattern. The reasoning, the cost and the one-line way to reverse it are recorded
in `src/lib/auth/auth-errors.ts`.
