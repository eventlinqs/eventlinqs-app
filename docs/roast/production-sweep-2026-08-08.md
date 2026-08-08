# Production defect sweep, 8 August 2026

Branch `fix/production-sweep`, cut from `origin/main` at `bbe6fd7`. PR #112 (draft, not for merge).

Written to after each journey so a crash costs nothing. Every claim carries
pasted output or a screenshot path. Nothing here is a plan; it is a record of
what was observed.

## Standing constraints for this pass

- The sweep runs against the **TEST** Supabase project (`vkapkibzokmfaxqogypq`)
  through the deployed preview
  `eventlinqs-app-git-fix-producti-9ed7fe-lawals-projects-c20c0be8.vercel.app`.
- `.env.local`, which points at production (`gndnldyfudbytbboxesk`), was
  **deleted from this worktree** before anything ran, so there is no path by
  which this session can write to the live database.
  `scripts/sweep/db.mjs` additionally hard-exits if pointed at the production ref.
- The funds-holding payment engine is not modified.
- Another session holds `feat/launch-kit-moat` in the primary working tree. This
  sweep runs in a separate worktree and never checks out that branch.

## Already fixed by the other session. NOT duplicated.

Checked before starting, per the brief. Three of the seven Part 3 items are
already done on `feat/launch-kit-moat`, with tests:

| Part 3 item | Their commit |
|---|---|
| 1. Newsletter subscribe writes nothing, says "Subscribed" | `483870c` |
| 6. Scheduled events never publish | `4ef556c` |
| 3. Category landings filter after taking six events | `2a701db` |

Re-implementing them here would have produced conflicts on the same files for
no gain. They are **not** carried on this branch, so they ship only if that
branch ships.

## Environment facts established before walking

| Fact | Value | How |
|---|---|---|
| Branch base | `bbe6fd7` | `git log --oneline -1 origin/main` |
| Supabase target | `vkapkibzokmfaxqogypq` (TEST) | `grep NEXT_PUBLIC_SUPABASE_URL .env.test` |
| Published events on TEST | 362 (195 future) | `scripts/sweep/db.mjs statuses` |
| `city_primary` populated | 32 of 362 | `scripts/sweep/db.mjs events` |
| `suburb_primary` populated | **0 of 362** | same |
| `is_featured` true | **0 of 362** | same |
| Categories present | 21, **no `comedy`**, **no `arts-community`** | `db.mjs categories` |
| Free disk | 6.4 GB | `df -h /c` |

## The instrument

`scripts/sweep/walk.mjs` walks a surface the way a person does, at 1440 and 390,
and records what a person would see: dead links, dead-end tiles, broken image
slots, inert anchors, sideways scroll, touch targets under 44px, console and
page errors, failed same-origin requests, banned copy, and the tells of a field
that never got its value. 62 targets built from real TEST slugs by
`make-targets.mjs`, including the deliberately empty cases.

Two of its heuristics cried wolf and were corrected rather than reported:

- **Dead tiles.** The first version flagged all five marketing feature bands on
  `/organisers` and `/for-organisers`. Law 4 REQUIRES alternating image-and-text
  bands and those photos are not tiles. Candidates are now grouped by container
  and only a group of three or more comparable images counts.
- **Touch targets.** It reported the visually-hidden skip link and every inline
  text link. WCAG 2.5.8 exempts inline text; only controls small in BOTH
  directions are reported now.

---

# Journey A, the stranger: verdicts

62 surfaces walked at both viewports, 124 records:
`docs/roast/sweep-evidence/report.json`, screenshots under
`docs/roast/sweep-evidence/{desktop,mobile}/`.

Verdicts state only what was measured. The walker loads a page and follows its
links; it does not press anything, so "renders clean" is the strongest claim
these rows can carry. Pressing is Journey B, below.

| Step | Verdict | Evidence |
|---|---|---|
| Land on the homepage | Renders clean: 200, 45 cards, 0 dead links, 0 broken images, 0 console errors | `desktop/home.png` |
| Browse events | Renders clean: 195 available | `desktop/events-browse.png` |
| Open a city page | Renders clean: 65 to 81 cards | `desktop/city-sydney.png` |
| Open a community page | Renders clean: 31 to 40 cards | `desktop/community-african.png` |
| Search, multi-word phrase | **BROKEN, fixed** | see D1 |
| Search, Sounds tile | **BROKEN, fixed** | see D1 |
| Header search tabs | **BROKEN, fixed** | see D2 |
| Category page | orphaned route, see O1 | `desktop/categories-music.png` |
| Open an event | Renders clean | `desktop/event-paid.png` |
| Buy a free ticket | see Journey B | |
| Buy a paid ticket | see Journey B | |

---

# Defects found and fixed

## D1. Search matched the title and nothing else

**What a person hit.** The search box is in the header of every page.

Measured through the deployed preview against database truth:

```
term                    found   should find
Melbourne                  10            29     a city name
Geelong                     4            27     the founder's wedge city
Harbourline Live            0            16     an organiser's own name
jazz soul                   1             3     a Sounds tile phrase
```

It looked healthy on TEST only because the seeder writes the genre into the
title ("Electronic Dance Live at The Espy"). Real organiser titles do not.

**Fixed** (`36e2682`). Every token must match somewhere across title, summary,
description, venue name, venue city, tags, or the organiser's name. AND across
tokens, OR across fields.

**Proof, same preview, after:**

```
path                                     cards   count line
/events                                     44   195 events available
/events?q=Geelong                           36    27 events available
/events?q=Melbourne                         36    29 events available
/events?q=Harbourline%20Live                28    16 events available
/events?q=jazz%20soul                       15     3 events available
/events?q=zzzzqqq                           12     0 events available
```

Every figure now equals the database truth exactly, and a nonsense query still
returns nothing, so the widening did not become a leak.

## D2. Six URL filters appeared in real hrefs and none was parsed

**What a person hit.** `/events?city=sydney` rendered **44 cards, identical to
unfiltered `/events`**. So did `&date=weekend` and `&event_type=concert`. Every
one of those links looked like a filter and was the national list.

`event_type` had nothing behind it at all: `events.event_type` is the
online/in-person axis and is the literal string `in_person` on all 362 published
events.

**Fixed** (`36e2682`). Proof:

```
/events?city=sydney                         36    26 events available
/events?city=sydney&date=weekend            12     0 events available
/events?city=sydney&event_type=concert      15     3 events available
/events?tab=cities&q=melbourne              36    27 events available
/events?tab=organisers&q=harbourline        28    16 events available
/events?venue=the-espy                      13     1 event available
```

The zero was checked rather than assumed: Sydney has 0 events in the next three
days, and the whole platform has 3, so `date=weekend` returning 0 is correct.

## D3. The sitemap advertised organiser pages that 404

Two queries disagreed. `sitemap.ts` selected organisations with no status
filter; `/organisers/[handle]` resolves with `.eq('status','active')` and calls
`notFound()` otherwise. **8 of 42 organiser URLs in the live sitemap returned
404**, every one a `pending` organisation.

**Fixed** (`603eeff`). After: 34 organiser URLs, zero `test-org` entries,
`sitemap-check.mjs` reports `sampled failures: 0` across all 935 URLs and 16
shapes.

## D4. Clicks and views were counted by different rules

Views were de-duplicated per (link, visitor, day); clicks were not. The reach
panel put the two side by side, so production's "57 clicks, 3 views" reads to an
organiser as "your sharing did not work".

**Settled with data, which is what the brief asked for.** On TEST: 32 clicks, 19
views, 10 conversions. The beacon fires fine and the conversion leg works. 32
click rows came from only 24 distinct (link, visitor) pairs. The 19-to-1
production gap is dominated by link scanners, which follow the `/s/` redirect
server side (recording a click) and never run the JavaScript that fires the view
beacon.

**Fixed** (`b96490f`): clicks are de-duplicated the same way. This reports fewer
clicks than before; the previous number was not a count of people.

**Withdrawn, recorded because it was nearly committed as a fix:** I read that
`/events/[slug]/with/[artist]` never renders `ShareViewBeacon` and concluded
artist-tagged links can never register a view. It carries `RedirectNow` to the
event page, which does render the beacon. Not a defect. No change made.

## D5. The banned word is on public surfaces, and two homepage tiles match nothing

`event_categories` holds slug `arts-culture`, name `Arts & Culture`. It renders
as "ARTS & CULTURE" on the browse filter chips, on city landing highlight cards,
and on event detail. The walker found it on **19 of 62 surfaces at both
viewports**. The constitution's gate for this is a grep across `src`, which a
database value can never trip.

The same row is why two homepage tiles are dead: `category-nav-rail.tsx` offers
`arts-community` and `comedy`, and neither slug exists, so `fetchers.ts` hits its
deliberate empty-result guard and both tiles resolve 200 to a permanently empty
page. `/events?category=comedy` rendered only the 12 footer links.

**Migration written** (`913a1d9`), **NOT APPLIED**. See the NOT FIXED section.

---

# Observations that are not defects

- **O1. `/categories/[slug]` is orphaned.** It 404s for `music`, `comedy` and
  `nightlife` because it keys on scene slugs, but no rendered surface links to
  it and it is absent from the sitemap, so no user can reach it. Recorded, not
  fixed; the other session has that file open.
- **O2. `/artists` and `/gigs` 404** with their flags off, and nothing a signed-out
  user can see links to them. Correct behaviour, not a dead link.
- **O3. `/feed` redirects a signed-out visitor to `/login`.** Auth-gated by
  design; it does not explain why, which is a polish item, not a break.

---

# Journey B, the buyer, walked as a person

`scripts/sweep/journey-buyer.mjs`, run at 1440 and 390 against the preview.
Evidence: `docs/roast/sweep-evidence/journey-b-{1440,390}/`.

| Step | Verdict | What the screen actually said |
|---|---|---|
| Sign up: open the form | PASS | Form renders, email field present |
| Sign up: fill and submit | PASS | Lands on `/verify-email-sent?email=...` |
| Sign up: the next step is explained | PASS | "Check your inbox. We sent a verification link to ... Open it to activate your account." |
| Sign in: wrong password | PASS | "That email address and password combination did not match. Check them and try again." Field keeps what was typed |
| Sign in: unverified account | PASS | "This account still needs its email confirmed. Open the verification link we sent you, or request a new one." |
| Forgot password: submit | PASS | Confirmation shown |
| Sign in with Google | PASS, and informative | No Google button is offered; the page says "Google sign-in is unavailable right now. You can sign in with your email address and password below, and Google will be back short(ly)." |
| Buy: press the ticket control on a free event | PASS | Scrolls to `#tickets`, picker in view |
| Buy: a picker is reachable | PASS | 3 quantity controls |
| My tickets while signed out | PASS | Redirects to `/login?redirect=/tickets` |

**No product defect was found in Journey B at either viewport.** Four failures
this script reported were its own, and all four are recorded in the file:
a 3.5s login wait that read the page before the message arrived, and three
locator picks that grabbed a "Get tickets" copy inside sticky chrome
(y = -53 in the header at 1440; y = 857 in the bottom bar at 390) instead of
the one in the page body.

# The checkout gate, and the 27 failures that were not failures

`scripts/verify/checkout-integrity.mjs` drove all 362 published events.
First run: **29 failed, 27 of them seated**, every one timing out on
`svg[aria-label="Seat map"]`.

None of the 27 is broken. Verified directly on
`winter-gala-concert-at-the-regent`: zero page errors and a 970x654 **canvas**
labelled "Seat map. Arrow keys move seat to seat, Enter selects, plus and minus
zoom, Escape rests." The seating renderer moved to a Canvas scene graph on
2026-07-26 and this selector has matched nothing since.

Rebuilt to drive the keyboard interface the canvas advertises. Three previously
"failing" events, by hand:

```
REACHED CHECKOUT  winter-gala-concert-at-the-regent
REACHED CHECKOUT  play-house-proof-a-seated-evening
REACHED CHECKOUT  seat-proof-fifty-nwltxi
```

The two genuine non-seated failures:

- `lineup-loop-proof-night-3z7osn` **is a real dead end.** The page reads
  "Get tickets. From AUD $25. Secure checkout" and renders **zero** quantity
  controls. Both its tiers have `total_capacity = 0`, and one has an empty
  name and a price of 0. Nothing says sold out. Screenshot:
  `sweep-evidence/checkout-fail-lineup-loop-proof-night-.png`. NOT FIXED.
- `cat-esports-arena-finals-sydney` starts 30 June 2026, which is in the past.
  It does render a stepper. Refusing checkout on a finished event is correct.

# Final instrument state, after the corrections

Re-walk of all 62 surfaces at both viewports
(`sweep-evidence/final/report.json`):

```
dead links                0
dead-end tiles            0
broken images             0
inert anchors             0
horizontal overflow       0
page errors               0
touch targets under 44px  8   (was 62 before the heuristic was corrected)
banned word               38  (19 surfaces x 2 viewports, migration pending)
HTTP 404                  16  (8 surfaces x 2: orphaned or flag-gated routes,
                               plus the two deliberate not-found probes)
```

# Verification

```
vitest      131 files, 1427 tests, all passed
eslint      43 problems, 0 errors   (baseline on main is 48)
tsc         clean
copy gate   clean (dashes, banned word, phrase tells, competitor names)
guards      all 7 PASS
CI          lint / typecheck / build  PASS
            test (vitest)             PASS
            types-drift guard         PASS
            Vercel preview            PASS
            Lighthouse mobile gate    the standing pre-existing failure
```
