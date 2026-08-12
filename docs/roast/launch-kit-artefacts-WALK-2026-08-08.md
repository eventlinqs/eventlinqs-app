# THE BROWSER WALK: feat/launch-kit-artefacts

Walked 8 August 2026 on the **deployed preview** against the **TEST** project.

Preview: `https://eventlinqs-app-git-feat-launch-ef8ee0-lawals-projects-c20c0be8.vercel.app`
Commit: `9109b5e` (branch pushed; nothing merged)
Instrument: `scripts/verify/launch-kit-walk.mjs`, real Chromium, real clicks.
Raw evidence: `docs/roast/walk-2026-08-08/walk-evidence.json` plus `shots/` and
`artefacts/`.

The preview is bound to TEST and this is proven rather than assumed: sign-in
succeeded with a password that was written into the TEST auth database minutes
earlier and exists nowhere else.

---

## 1. WHAT I COULD NOT WALK

**W6, the QR scanned with a real phone camera. NOT WALKED.** I have no camera.
A code-level decode is explicitly not what was asked for and I have not
substituted one.

*What a user experiences until it is walked:* unknown. The QR encodes the right
string (the poster and card routes pass `shortUrl` straight into `QRCode`, and
that same URL is proven to resolve, below), and the printed module pattern looks
well-formed at A4. What is unproven is the physical read: contrast on paper,
quiet-zone margin at print size, and whether a phone camera locks on at arm's
length. The failure mode if it is wrong is total and silent, because a poster in
a venue window gets no error message.

*The 60-second check, for the founder:* open
`docs/roast/walk-2026-08-08/artefacts/light-poster.pdf`, print it at A4 with no
scaling, and point a phone camera at the QR from about 40 cm. It must open the
event page. Then repeat from the screen at 100 percent zoom.

---

## 2. WHAT THE WALK PROVED

Every one of these was driven in a browser and is backed by pasted evidence in
`walk-evidence.json`.

| Step | Verdict | Evidence |
|---|---|---|
| Sign in as an organiser on the preview | **PASS** | lands on `/dashboard` |
| **Ruling 1**, readable codes minted | **PASS** | `marketplace-gate-ig`, `-fb`, `-wa`, `-x`, `-li`, `-em`, `-cp`, `-qr` |
| **Ruling 2**, `/e/[code]` renders on ONE request | **PASS** | `GET /e/marketplace-gate-ig` -> **200**, `redirectedFrom: null`, final URL unchanged, `h1` = "Marketplace Gate Night, Geelong" |
| Cookie set by the proxy | **PASS** | `el_share_code = marketplace-gate-ig`, path `/`, SameSite Lax, httpOnly false |
| Click booked in `share_link_events` | **PASS** | link `marketplace-gate-fb` 0 -> 1; row `2cb85dd1` on `-ig` at 06:10:57Z |
| **Ruling 4**, crawler books no click | **PASS** | `facebookexternalhit` -> 200, 187,814 bytes served, clicks 1 -> 1 |
| Real browser on the same link books one | **PASS** | same link, real Chrome UA, 0 -> 1 |
| **Ruling 3b**, legacy `/s/[code]` resolves | **PASS** | `/s/b7HGCxANds` -> 200 at `/events/marketplace-gate-night-geelong/with/marlo-reyes-lojdor` |
| Caption on the clipboard | **PASS** | 369 chars, identical to the on-screen caption after newline normalisation, carries the tracked `/e/` link, button confirms "Caption copied" |
| Logo control, light mark | **PASS** | panel: "reads clearly on the navy, so it sits straight on the artwork" |
| Logo control, dark mark | **PASS** | panel: "your mark is dark ... we put it on a white tile" |
| Artefacts downloaded as real files | **PASS** | 8 files, story 1080x1920, square 1080x1080, feed 1440x1800, A4 PDFs |
| Kit at 390 | **PASS** | no sideways scroll, `scrollWidth - clientWidth = 0` |
| Kit at 1440 | **PASS** | `shots/w10-kit-1440.png` |

The crawler pair is the cleanest result here: **the same link**, fetched by
Meta's own published user agent, was served the page in full and booked nothing;
then a real browser on that link booked exactly one click. A second visit inside
the hour booked nothing, which is the de-duplication window working.

An incidental confirmation: my first walk booked no clicks at all, because
Playwright's default user agent contains `HeadlessChrome` and the filter
correctly classified it as a robot. The filter is doing its job on traffic it
was never explicitly aimed at.

---

## 3. WHAT THE WALK BROKE: three defects, none of them caught by 1452 tests

### D1. The ticket bar overflows its own bar. **A2 is NOT done.**

Opening the artefacts is what found this. `fitTicketBar` steps the type down and
then, when nothing fits, **returns the minimum size anyway and lets the text
run**. Nothing truncates and nothing wraps, so the line is simply drawn past the
gold bar, across the QR code and off the edge of the card.

**This is not a preview-host artefact. It is live on the production host.**
Measured against the real geometry:

| Case (production host) | Chars | Story bar | Square bar |
|---|---|---|---|
| This event, free entry | 56 | **overflows by 45px** | fits |
| Priced, 20-char stem | 64 | **overflows by 145px** | fits |
| Priced, dated recurring night | 59 | **overflows by 82px** | fits |
| Priced, longest legal code | 87 | **overflows by 432px** | **overflows by 185px** |

The story bar holds **52 characters** at its minimum size. `www.eventlinqs.com.au/e/`
is 24 of them on its own. So the story card, which is the shape the kit leads
with for **Instagram and WhatsApp**, overflows for most real events on
production.

On the A4 poster the same string is **clipped** mid-URL instead
("...ef8ee0-lawals" and then it stops), so the printed link is wrong rather than
merely ugly.

### D2. A dark organiser mark collides with the event title on the A4 poster.

The white readability tile is taller than the bare mark, and the band layout
does not account for it, so the tile's lower edge is drawn over the top of the
title. Confirmed by looking at both posters: the light mark sits clean, the dark
mark overlaps.

Host-independent, therefore live on production, and it only appears for
organisers who upload a dark mark, which is the case the panel explicitly tells
them is fine.

### D3. The login form puts the password in the URL. **Pre-existing on `main`, so live on production now.**

Found on the first run of this walk, before any of the kit was reached.

```
/login?email=broadcast.gate.organiser%40eventlinqs.com&password=<in clear text>
```

The form has an `onSubmit` handler, **no `action` and no `method`**, and its
submit control is gated on `loading` alone. Before React hydrates, the control
is live and a native GET fires, putting the credential into browser history, the
`Referer` header, and every access log on the path.

**Not introduced by this branch and not fixed by it.** `fix/production-sweep`
(PR #112, open) already gates it on `useHydrated()`. That branch owns the file;
a second fix here would only collide. Same reasoning the founder applied to
`src/proxy.ts`. **It is on production until #112 lands, and it is worth landing
for that reason alone.**

### Not a defect, recorded so nobody chases it

The `BASEMEN1` on the light artefacts is **the test fixture's own clipping**, not
the renderer's. `logo-fixtures/light-wordmark.png` has ink at x=899 of a 900px
canvas, a zero-pixel right margin. The renderer is faithfully drawing a clipped
source. The predecessor's own logo proofs were validated against this fixture.

---

## 3a. D1 AND D2 ARE FIXED, AND THE FIX WAS RE-WALKED

Commit `e85a0f4`, redeployed, artefacts downloaded again and opened again.

**D1.** The story bar now reads, inside its own bar and clear of the QR:

```
Free entry · eventlinqs-app-g...el.app/e/marketplace-gate-ig
```

Width is now MEASURED with the shipped Hanken Grotesk SemiBold file rather than
estimated at `characters x 0.52`. The measured ratio is nearer 0.46, so the old
estimate was also shrinking type that had room: the free case now sets at 27px
where it used to set at 24. The fit is guaranteed, so where no permitted size
holds the line it is ellipsised from the middle, keeping the price at one end
and the whole code at the other. **On the production host the line fits with no
ellipsis at all** for every realistic event.

**D2.** `shots/w5-poster-band-AFTER-fix.png`. The white tile now sits clear
above the title with air between them, and the A4 gold bar carries the whole
line inside the gold: `Free entry · eventlinqs-app-git-fea...8.vercel.app/e/marketplace-gate-qr`.

**The tests that missed it asserted the bug.** "never returns a size below the
floor" is precisely the behaviour that let the line escape its bar. Replaced
with the real invariant, measured against the shipped font across every host,
price and code the platform can mint: 120 combinations, drawn width never
exceeds the bar. Drilled against `origin/main`'s algorithm, where **61 of those
120 are drawn outside their bar**, worst case 986px over. The test is not
vacuous.

Gates after the fix: tsc clean, eslint 42 problems 0 errors (baseline 48), 9
guards pass, **1454 tests across 132 files**.

---

## 4. STATE OF THE LEDGER AFTER THE WALK

| Item | Was | Now |
|---|---|---|
| Ruling 1, 2, 3b, 4, 5 | asserted in tests | **PROVEN IN A BROWSER** |
| Ruling 3d attribution | MET in code, unproven | **PROVEN IN A BROWSER** |
| Ruling 3c codes never released | BLOCKED | **still BLOCKED**, migration `20260808000006` unapplied by founder ruling R-C |
| A2 cards and captions | built, unproven | **D1 FIXED AND RE-WALKED**. Proven in a browser |
| B1 organiser logo | built, unproven | **D2 FIXED AND RE-WALKED**. Both placements proven, light and dark |
| R-A our mark subordinate | awaiting ruling | **RULED SUBORDINATE, and it is what renders**: "Ticketing by EVENTLINQS." muted, organiser's mark dominant |
| W6 phone-camera QR | not walked | **STILL NOT WALKED** |
| B2 the four zeros | not started | **BUILT AND WALKED**, 1440 and 390, both surfaces |
| A4 positioning | not started | **SWEPT**: reach leads with tickets sold everywhere |
| E2 images and video | not started | **WALKED**, one accessibility defect found and fixed, stale spec reconciled |

---

## 4a. B2, A4 AND E2, ALSO WALKED

Evidence: `docs/roast/walk-2026-08-08/b2-e2-evidence.json`, shots `b2-*` and `e2-*`.
Driven against a genuinely zero-reach event
(`marketplace-regression-comedy-free-night-at-waterf-q5758z`).

### B2, the four zeros. **ALL PASS**

| Step | Verdict |
|---|---|
| Kit at true zero shows the empty state, not four zeros | **PASS** (`bigNumberTiles: []`) |
| It teaches which measures are hard and which are estimates | **PASS** |
| It offers a next step | **PASS** ("Send it everywhere", "Download your QR poster") |
| Full reach panel shows ONE empty state, not two | **PASS** (the table's own empty row is gone) |
| At 390, no sideways scroll | **PASS** (`overflow=0px`) |

### A4, positioning to measurement. Shipped

Reach now runs **tickets, orders, clicks, views**, hardest first, with the two
estimates labelled and the two hard numbers set in gold, on the kit panel, the
full reach panel and the per-channel table. `/organisers` sells "Tickets sold,
attributed to the exact channel that sold them" instead of "every click and
sale", and states the differentiator plainly: two of those numbers are payments
and two are estimates, and we say which.

### E2, images and video. **ALL PASS, and one defect found and fixed**

| Step | Verdict |
|---|---|
| The video field is programmatically labelled | **PASS, after the fix below** |
| The form confirms the link was understood | **PASS** ("Youtube video linked") |
| A pasted link is parsed to a canonical embed and stored | **PASS** `youtube.com/watch?v=X` -> `youtube-nocookie.com/embed/X`, provider `youtube` |
| No provider iframe before the visitor asks | **PASS** (`iframesOnFirstPaint: 0`) |
| Clicking play loads the canonical embed | **PASS** |

**The defect.** The Event video input carried **no `id` and no `name`**, and its
label neither wrapped it nor pointed at it, so the field was programmatically
unlabelled: a screen reader announced an anonymous text box. The multi-file
image input had the same gap. Both fixed; the parse result is now wired as
`aria-describedby` with `role="alert"` on the rejection.

**One observation, not called a defect.** The provider iframe carries no
`sandbox` attribute, though a comment in `video-embed.ts` describes the URL as
"sandbox-able". Sandboxing a provider player needs `allow-scripts` plus
`allow-same-origin`, which gives most of it back, and the real vector (raw HTML
and iframes pasted by an organiser) is closed at the parser. Flagged for a
founder view rather than changed unasked.

**A stale document, reported under Law 0.** `docs/design/MEDIA-UPLOAD-SPEC.md`
proposed self-hosted video at 50 MB through Mux or Cloudflare Stream. The code
says the opposite and the code is the authority: "EventLinqs never self-hosts
the file." The document now carries that correction at the top rather than
being left to mislead the next reader.

**My own walk did something it should not have.** The first pass matched "Save
as Draft" as well as "Save Changes" and unpublished a published TEST event
mid-walk. Restored to `published` in the same session, the selector narrowed so
it cannot happen again, and the walk video cleared. TEST is left as it was
found. Recorded rather than quietly corrected.

---

## 5. PRE-EXISTING DEFECT FOUND ON THE WAY, ROUTED NOT FIXED

`/dashboard/organisation` selects the organisation with
`.eq('owner_id', user.id).single()`. An organiser who owns **more than one**
organisation gets a PostgREST "more than one row" error, `org` comes back null,
and the page renders **"No Organisation Yet"** with a Create Organisation button.

The seeded `seed@eventlinqs.app` owns 26 organisations and sees exactly that.
The whole organisation page, including the new logo control, is unreachable for
them.

Present on `main` verbatim, so this branch did not cause it. It does block B1
for multi-org organisers, which is why the walk was run as a single-org
organiser instead. Reported, not fixed here.
