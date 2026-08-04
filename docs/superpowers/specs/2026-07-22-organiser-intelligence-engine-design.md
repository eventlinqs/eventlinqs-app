# Organiser Intelligence Engine: Design Spec

Date: 2026-07-22
Status: Approved (founder, 2026-07-22)
Module: Growth, supply-side recruitment (ranked lever 1). Slice 1 of the build brief
"EventLinqs Organiser Intelligence Engine v1.0"
Branch: new sibling repo `EventLinqs/eventlinqs-organiser-engine`, branch `main`.
Spec carried in `eventlinqs-app` because that is where the spec convention lives.

## Mission

Find the humans who create and promote events in Victoria, work out how often they do it
and where they sell tickets today, and hand back a ranked contact list a solo founder can
work at fifteen conversations a day. Slice 1 proves the pipeline end to end on two sources
and stops for founder review before scaling.

The hard invariant is provenance: every claim traces to a URL and a timestamp, and no
claim is made that was not read off a public page. A row that cannot be audited is a row
that starts an argument with a real business.

## Verified environment findings (2026-07-22)

Measured, not assumed. Every design decision below rests on these.

| Finding | Evidence |
|---|---|
| Beat gig guide is server-rendered, no JS needed | `GET beat.com.au/gig-guide/` returns 200, 591KB, zero `__NEXT_DATA__` / `__NUXT__` / `data-reactroot` markers |
| One Beat fetch yields 273 events | 273 `gig-card` blocks in that single page |
| Beat card fields | `gig-date` (273), `gig-end-date` (47), `gig-title`, `gig-location` (231), `gig-ticket` (260), `gig-price` (197), `gig-genre` (202), `gig-category` (273) |
| **Beat never names a presenter** | Zero hits for presented / presenter / promoter / organiser / organizer on the guide page AND on event detail page `beat.com.au/ncm-x-pseudo-stigmergy/` |
| **Neither slice-1 source marks sold out** | Zero hits for `sold out` / `soldout` on the Beat guide, the Beat detail page, and the Geelong detail page |
| Outbound ticket links sit in Beat markup | 260 of 273 cards carry one. Platform mix measured below |
| Beat robots.txt permits this | Disallows only `/wp-admin/` and `/*?reload=`, publishes `sitemap_index.xml` |
| GigBill permits listings, forbids search | Disallows `/search/`, `/api/`, `/admin*`, `/accounts/`, `/oauth/`. Sitemap published |
| What's On Melbourne fully permissive | Only `/500.html` disallowed, gzipped sitemap |
| **Visit Victoria is bot-gated** | Cloudflare managed challenge on `/robots.txt` itself. Routed to the manual queue, never worked around |
| Geelong council is server-rendered and names the organiser | `geelongaustralia.com.au` 301s to `geelongcity.vic.gov.au`; `/whats-happening/events` returns 200, 198KB, zero SPA markers |
| Geelong exposes the presenter explicitly | Drupal field `field--name-field-event-associated-org` on event detail pages |
| Geelong exposes phone, and email | `field-event-contact-phone`, `field-event-contact-name`, and `field-event-contact-email` |
| Geelong robots.txt is absent | 404 on both hosts. Under RFC 9309 an absent robots.txt means no restrictions |
| Platform detection works on Geelong detail pages | `trybooking.com/events/landing/1563594` on the Folk Festival page. The index page carries no ticket links, so detection needs the detail hop |

## The Victorian platform mix, and what it means for outreach

Measured on one Beat gig guide page, 2026-07-22. Ticket-link domain counts:

| Platform | Count on one page |
|---|---|
| Oztix | 24 |
| Humanitix | 18 |
| TryBooking | 10 |
| Moshtix | 4 |
| Eventbrite | 3 |
| Ticketek | 1 |

**This is a targeting finding, not a config-weighting one.** The build brief's wedge leans
on the Eventbrite opening: acquired by Bending Spoons, taken private, cutting staff, free
tier reportedly at risk, organisers actively evaluating alternatives. That opening is real.
It is also, on this evidence, close to irrelevant to the Victorian live-music organisers
this engine will surface. Eventbrite is the sixth most common platform on the page, behind
Oztix by a factor of eight.

Three consequences for how the list gets worked:

1. **The Eventbrite-is-wobbling story will not open most of these conversations.** It stays
   valid for the community, market and workshop organisers the council sources surface,
   where Eventbrite genuinely is the default. It is the wrong opener for a gig promoter on
   Oztix or Humanitix.
2. **Oztix and Humanitix are the real incumbents to have an answer for.** Humanitix in
   particular is the sharpest case, because CLAUDE.md already locks the honest position:
   our headline platform fee undercuts theirs (3.5% + $0.99 against 4% + $0.99), but theirs
   includes payment processing, so all-in they are 7 to 29 cents cheaper across $15 to $35,
   and we never claim otherwise. Against Humanitix the pitch is the discovery engine and
   data ownership, never price. A rehearsed answer for each incumbent is worth more than any
   scoring refinement in this spec.
3. **The GREENFIELD bucket may be the real prize.** 13 of 273 Beat cards carry no ticket
   link at all, and council calendars skew heavily toward free and door-sales events. Those
   organisers have nothing to migrate, and section 5 of the brief already scores them
   highest on switchability. This is the bucket to size properly in slice 1.

This finding also corrects `platforms.yaml`: the seed map is ordered by the founder's market
recall, and the measured order differs. Locked decision 17 covers the correction.

Two consequences reshape the build:

1. **Beat is the volume and platform source. Geelong is the identity source.** Beat cannot
   name an organiser; the council can. They are complements, not a primary and a backup.
2. **Slice 1 yields no sell-out data at all.** The audience-reach component therefore sits
   at the neutral 4 points for every organiser in v1. This is stated plainly rather than
   engineered around.

## Architecture

Sibling repo, Python 3.11, no contact with the `eventlinqs-app` CI gates and no raw page
cache inside the app repo.

```
eventlinqs-organiser-engine/
├── config/
│   ├── sources.yaml        # per source: name, base_url, type, parser, regions, robots status
│   ├── platforms.yaml      # ticket domain -> platform name
│   ├── geography.yaml      # Victorian suburb -> region, corridor weighting
│   ├── niches.yaml         # event type keyword classification
│   └── selectors/          # per-source CSS selector maps, incl. sold-out markers
├── src/
│   ├── guards.py           # the three rails, as hard failures
│   ├── collect.py          # the ONLY module that touches the network
│   ├── parse.py            # cached bytes -> event records
│   ├── platform_detect.py  # URL -> platform. Pure string work, no network
│   ├── resolve.py          # events -> organisers
│   ├── score.py            # rank
│   ├── export.py           # write the tracker
│   └── verify_queue.py     # build the human check list
├── data/
│   ├── raw/                # cached pages + sidecar provenance json
│   ├── events.parquet
│   └── organisers.parquet
├── fixtures/               # committed golden pages for offline parser tests
├── logs/
├── tests/
└── run.py
```

The boundary that carries the design: **`collect.py` is the only module that makes a
network request.** Everything downstream operates on cached bytes, so the whole pipeline is
testable offline against committed fixtures, and the three rails only need enforcing in one
place.

## The three rails, as hard failures

Section 0 of the brief becomes code that fails the run, not documentation that hopes.

### Rail 1: no email harvesting

- `parse.py` carries a **field-level denylist**. `field-event-contact-email` and any
  equivalent is never read into an event record. The extractor cannot reach it.
- No email regex exists anywhere in `src/` except the single detector inside `guards.py`.
  A test asserts this, so a harvesting sweep cannot be added later without the suite going
  red.
- `export.py` holds a write-blocklist covering `Contact Name` and any email-bearing column.
  The code cannot address those cells.
- `guards.assert_no_addresses()` runs over engine-owned output at the end of every run and
  aborts the run on a hit.

**Scan scope, and why it is scoped (founder change 1).** The guard scans
`events.parquet`, `organisers.parquet`, and the engine-written cell ranges of the tracker.
It scans `verification_queue.xlsx` **at engine write time only**, proving the engine placed
no address in it, and never again once Cowork begins filling it. It never scans
`data/raw/`, because the cache is a verbatim copy of a public page and Geelong's markup
legitimately contains an address. Cache may contain it; extracted data never does. Without
this scoping the guard deadlocks the moment verification runs.

### Rail 2: no competitor queries

- The blocklist lives inside the fetch function itself, so `collect.py` raises rather than
  requests if a ticketing domain is ever passed to it.
- `platform_detect.py` performs no I/O. It reads the domain string off the listing.
- Shortened links: read the `Location` header off the shortener and stop, one hop maximum.
  This unwraps the link without a byte reaching the competitor. If the target is a blocked
  domain we record the domain and do not follow.

### Rail 3: robots.txt

- Fetched once per host per run, cached, consulted before every request.
- Disallowed path logs `SKIPPED_ROBOTS` and is skipped.
- **404 or 410 means no restrictions** (RFC 9309), which is the Geelong case. A 5xx,
  timeout, or bot challenge means **fail closed**: treat as disallowed, log
  `SKIPPED_BLOCKED`, and route the source to the manual queue. Visit Victoria's Cloudflare
  challenge takes this path and is never worked around.
- One request per two seconds per host, token bucket per host.
- User agent `EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)`.
- Where a source offers a sitemap, feed or API, prefer it over HTML parsing. GigBill is
  sitemap-only because its `/search/` is disallowed.

### A note on phone (founder change 3)

Collecting a phone number published for enquiries is lawful and is not what the Spam Act's
harvesting provisions cover, since those address electronic addresses. It does move
outreach under the **Do Not Call Register Act 2006**. Business numbers published for
enquiry purposes are generally callable for business-to-business contact, but the
obligation exists and the founder should be aware of it before dialling. `phone` and
`phone_source` are collected; the engine never dials anything.

## Data model

### Event record (intermediate)

Per the brief, with the fields the sources actually yield.

`event_id` (hash of title + date + venue), `title`, `date`, `end_date` (nullable, Beat has
47 of them), `venue_name`, `suburb`, `region`, `presenter_raw` (nullable, see below),
`artists`, `ticket_url`, `platform`, `platform_bucket`, `price_min`, `on_sale`,
`is_sold_out` (nullable), `source_url`, `retrieved_at`.

`source_url` and `retrieved_at` are refused at write time if absent, so an unauditable row
cannot physically reach the output.

`presenter_raw` is null for every Beat event, by evidence. It is populated for Geelong from
`field-event-associated-org`.

### Organiser record (the deliverable)

Per the brief's model, plus these additions:

| Field | Type | Notes |
|---|---|---|
| `phone` | str, nullable | founder change 3. Only where published for enquiries |
| `phone_source` | str, nullable | the URL it was read from |
| `presenter_inferred` | bool | true where the organiser is a venue rollup, not a named presenter |
| `latest_activity` | str | founder change 5. Engine-owned, refreshed each run |
| `status_lifecycle` | str | `active` or `dormant`. Never deleted, founder change 7 |
| `audience_source` | str | `unknown` for every organiser in v1 |

`instagram_followers`, `facebook_followers` and `engagement_signal` exist in the schema and
stay null in v1. No automated follower collection occurs.

## Sources, slice 1

Two sources, chosen because together they cover both halves of the deliverable.

**Beat gig guide** (`beat.com.au/gig-guide/`). One fetch, 273 events, carrying venue,
suburb, date, genre, category, price and the outbound ticket link. This is where activity,
recency, platform mix and corridor coverage come from, which is 58 of the 100 score points.
It names no presenter.

**City of Greater Geelong** (`geelongcity.vic.gov.au/whats-happening/events`). Index page
plus a detail hop per event. Carries the presenting organisation explicitly, plus contact
name and phone, plus the ticket link on the detail page. This is the only slice-1 source
that names an organiser, and it validates corridor coverage (founder change 2).

The detail hop costs one request per event at one per two seconds. Sized against the
council's typical calendar this is single-digit minutes and is acceptable.

## Platform detection

Domain to platform via `config/platforms.yaml`, then bucketed:

- `COMPETITOR`: a known ticketing platform.
- `GREENFIELD`: Facebook event, Instagram link only, a form, tickets at the door, or no
  link at all. **Highest switchability, scored highest.** No contract, no export, no
  retraining.
- `SELF_HOSTED`: their own site checkout. Technical organiser, sell on features not price.
- `UNKNOWN`: unresolved. Goes to the verification queue.

The seed map ships untested by the brief's own admission, so slice 1 runs a **domain
frequency report**: the distinct ticket-link domains actually found, sorted by count, top
50 printed for review. The measured Victorian mix already contradicts the seed weighting.
The map is corrected against that report before slice 1 is called done.

## Entity resolution

1. Normalise: lowercase, strip punctuation, strip trailing `presents`, `productions`,
   `events`, `touring`, collapse whitespace.
2. Exact match on the normalised string.
3. Fuzzy match, `rapidfuzz` token set ratio. Above 92 auto-merges. 82 to 92 goes to the
   queue as a suggested merge. Below 82 never merges.
4. Same night, same venue, different presenter strings weights toward one entity.
5. Every alias preserved.

**Venue-anchored candidates (founder decision).** A Beat event with no presenter rolls up
to its venue as an organiser candidate with `presenter_inferred = true` and
`is_venue_operator = unknown`, and generates a queue row asking who books that room.
Nothing is asserted that was not read. Geelong supplies true named presenters in parallel,
and where a named presenter resolves to a venue already held as an inferred candidate, the
named record wins and absorbs the aliases.

## Niche classification

Keyword matching on title, artists, genre badges and venue type, per `config/niches.yaml`.
`club_night`, `gig`, `comedy`, `other`. An organiser can carry several; the list is kept,
never forced to one. Beat's `gig-genre` and `gig-category` badges feed this directly and
are stronger signal than title keywords alone.

## Scoring

Per the brief, unchanged, with the breakdown stored alongside the total so every score is
explainable.

Activity 25, Recency 18, Live on sale 15, Niche match 14, Audience reach 12,
Switchability 9, Corridor 7.

**v1 reality: audience reach is 4 for every organiser.** No follower data is collected and
no sell-out data exists on either slice-1 source. The maximum achievable v1 score is
therefore 92, not 100, and the component is a constant that changes no ranking. Tier
boundaries are unchanged (A 70+, B 50 to 69, C 30 to 49, D below 30), so tiers shift down
slightly relative to a fully-populated score. The sell-out override stays in the code,
config-driven and dormant, and activates the moment a source that marks sold out is added.

## Export contract

Target: `eventlinqs-app/docs/marketing/eventlinqs-outreach-tracker.xlsx`, `Pipeline` tab,
headers on row 3, data from row 4.

**The partition rule: no column is ever both.** Every column belongs to exactly one owner
for the life of the file. Where the engine has an opinion about a human-owned column, it
does not write that column conditionally or on first insert only. It writes an engine-owned
twin, appended to the right. One flat rule, applied uniformly, with no stateful special
case for an implementer to get wrong or a reader to forget.

**Engine-owned columns**, refreshed in place every run: `Current Platform`, plus appended
`Event Type (auto)`, `Score`, `Tier`, `Events 90d`, `Last Event`, `Next Event`,
`Venues Played`, `Latest Activity`, `Source URL`, `Retrieved`, `Needs Verification`,
`Organiser ID`.

**Human-owned columns**, never addressed by the engine: `Contact Name`, `Event Type`,
`Personalisation Note`, `Status` (after first write), `Priority`, `First Touch Date`,
`Last Touch Date`, `Touches`, `Next Action Date`, `Referred By`, `Notes`.

The twins, and why they exist:

| Human-owned | Engine-owned twin | Reason |
|---|---|---|
| `Personalisation Note` | `Latest Activity` | founder change 5 |
| `Event Type` | `Event Type (auto)` | founder change 1. Niche classification stays live and visible without a silent overwrite of a hand correction |

`Personalisation Note` is human-owned and never overwritten (founder change 5). The engine
carries its factual sentence in `Latest Activity` instead:

> Ran {events_90d} events in the last 90 days across {venue_count} venues, most recently
> {title} at {venue} on {date}. Currently selling through {platform}.

Missing clauses are dropped, never padded with a guess.

Write rules:

1. **New rows land with `Status = New`** (founder change 6), which the Dashboard counts as
   backlog, separately from worked pipeline.
2. **Rows are never deleted** (founder change 7). An organiser absent from listings for a
   full run flips `status_lifecycle` to `dormant`, which is the single source of that fact.
   `Latest Activity` renders it as human-readable text ("Dormant: no listing seen since
   {last_event_date}"). The row and its history are kept. A later run that sees the
   organiser again flips it back to `active`.
3. **`Organiser ID` is visible, far right, header labelled `Organiser ID (DO NOT EDIT)`**
   (founder change 8). It is the stable merge key. Hiding it invites accidental deletion by
   someone who does not know what it is.
4. **Atomic write** (founder change 9): write to a temp file in the same directory, then
   `os.replace`. Before the first write of a run, copy the tracker to
   `backups/eventlinqs-outreach-tracker.{timestamp}.xlsx`. If the file is locked by Excel,
   fail loudly with the message "Tracker is open in Excel. Close it and re-run." and change
   nothing.
5. **Dashboard ranges widen once** from `Pipeline!A4:A220` to `A4:A5000`. Column structure,
   sheet names and the daily workflow are untouched. Without this the counts silently
   undercount past row 220 while looking correct.
6. Re-runs merge on `Organiser ID`. Same input, same output, no duplicate rows.

## Verification queue

`verification_queue.xlsx`, one row per field a human or Cowork must confirm:

- Suggested merges scoring 82 to 92.
- `UNKNOWN` platform resolutions.
- **Venue-anchored candidates: who books this room.**
- Organisers with no contact route found.
- Organisers reaching Tier B or above with no follower data, for a manual audience check
  from their own public profile, one at a time.
- Organisers whose last event is over 120 days old, which may mean they have stopped.
- Sources routed to manual because they are bot-gated (Visit Victoria).

## Locked decisions

1. Python 3.11, sibling repo `EventLinqs/eventlinqs-organiser-engine`. Never inside
   `eventlinqs-app`, so the app's CI gates and repo size are untouched.
2. `collect.py` is the sole network module. All other modules work on cached bytes.
3. The email guard scans engine-owned outputs and the queue at write time only. It never
   scans `data/raw/`, never scans human-owned columns, and never re-scans the queue after
   Cowork begins filling it.
4. `parse.py` carries a field-level denylist. Published contact-email fields are never read
   into the dataset even where trivially available.
5. The only email regex in the codebase lives in `guards.py`, enforced by test.
6. robots.txt 404 or 410 means allowed. 5xx, timeout or bot challenge means fail closed and
   route to the manual queue. Bot gates are never worked around.
7. Slice 1 is Beat plus City of Greater Geelong. Beat supplies volume and platform, Geelong
   supplies organiser identity and validates corridor coverage.
8. Beat events roll up to venue-anchored candidates with `presenter_inferred = true` and a
   queue row. No presenter is ever asserted that was not read.
9. Sell-out extraction is built config-driven but yields nothing in slice 1, because
   neither source marks sold out. v1 has no live audience signal and audience reach is a
   constant 4. Max achievable v1 score is 92.
10. No automated follower collection in v1. Tier B and above route to the queue for manual
    audience checks from public profiles, one at a time.
11. `phone` and `phone_source` are collected where published for enquiries. Phone outreach
    carries Do Not Call Register obligations; the engine never dials.
12. No tracker column is ever both engine-owned and human-owned. Where the engine has an
    opinion about a human column it writes an engine-owned twin appended to the right, never
    a conditional or first-insert-only write. `Personalisation Note` pairs with
    `Latest Activity`; `Event Type` pairs with `Event Type (auto)`.
13. New rows land `Status = New`. Rows are never deleted; absent organisers go dormant.
14. `Organiser ID` is visible, far right, labelled DO NOT EDIT.
15. Export writes temp then atomically replaces, backs up before first write, and fails
    loudly on an Excel lock.
16. Dashboard formula ranges widen to `A4:A5000`. No other change to the tracker structure.
17. The seed `platforms.yaml` is corrected against the measured domain frequency report
    before slice 1 is called done. The shipped seed map is not trusted.
18. Acceptance criterion 2 of the brief (300+ organisers) applies to the full source set,
    not to slice 1. It is not claimed here.

## Slice-1 acceptance gate (founder change 11)

Slice 1 is done when all of these hold, evidenced:

1. **Volume**: at least **60 distinct organisers** written to the tracker, of which at
   least **15 are named presenters** from Geelong rather than venue-anchored candidates.
   Target is 120 distinct. Below 60 means parsing is losing records, not that Victoria is
   empty.
2. **Platform resolution**: of events carrying a ticket link, at least **95 percent resolve
   into one of the four buckets**, so `UNKNOWN` is at most 5 percent. All four buckets count
   as resolved; only `UNKNOWN` is a miss. Measured against the 260 of 273 Beat cards that
   carry a `gig-ticket` link.
3. **Spot check**: 10 rows drawn at random, source URLs opened, organiser and platform
   confirmed correct on at least **9 of 10**. Below that, fix parsing before shipping.
4. **Provenance**: zero rows lacking `Source URL` or `Retrieved`. Enforced by test.
5. **Zero addresses**: zero email addresses in any engine-written output. Enforced by test.
6. **Idempotency**: two consecutive runs produce identical row counts, and hand-edited
   human columns survive the second run byte for byte.
7. **Politeness**: logs evidence robots.txt fetched per host and no host exceeded one
   request per two seconds.

## Testing and gates

- **Golden-file parser tests**: the Beat guide page, a Beat detail page, the Geelong index
  and a Geelong detail page committed to `fixtures/`, with expected record output. Parser
  regressions surface with zero network calls.
- **Guard tests**: the sole-email-regex assertion; the competitor-domain fetch raising; the
  robots fail-closed path; the scan-scope test proving the queue is not re-scanned after
  human edits (the deadlock case).
- **Export tests**: idempotency across two runs; human-column preservation; Excel-lock
  failure path; backup created; Dashboard range widened exactly once.
- **Resolution tests**: a known organiser appearing across several venues merges to one
  record; a 85-score pair goes to the queue rather than merging.
- **Gates**: `pytest` green, `ruff` clean, `mypy` clean, and the slice-1 acceptance gate
  above evidenced in the run log. No gate lowered or marked optional to go green.

## Out of scope for v1, stated so nobody builds it by accident

- No JS-rendering fallback (Firecrawl or a browser). Neither slice-1 source needs one. The
  fetch layer leaves a defined seam for when a council site demands it.
- No querying of any ticketing platform, ever.
- No automated email collection, in any volume, by any method.
- No message sending. Outreach is manual, by the founder.
- No Instagram automation. Third-party DM automation breaches Meta's terms and, for a brand
  with one account at launch, ends the channel.
- Tier 1 remainder, Tier 2 venue pages, Tier 3 councils and Tier 4 festivals come after
  founder review of real slice-1 rows, per section 14 of the brief.

## Known gaps carried forward

- `EventLinqs_Verified_Seed_List.xlsx` (40 corridor venues, Tier 2 seed) is not on this
  machine. Slice 1 derives the venue list from observed Beat data instead, ranked by real
  listing volume. If the file surfaces it merges in as an additional seed with no rework.
- The brief references a "section 5A" defining follower collection. No such section exists.
  Locked decision 10 stands in its place until the founder writes one.
