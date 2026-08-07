# DISCOVERY SURFACE INVENTORY

Date: 8 August 2026.
Audit base: `origin/main` at `1888ece`.
INTERNAL DOCUMENT. Competitor names appear as research context only.

**Scope.** Every discovery surface on the platform: does it exist, is it wired,
what feeds it, what happens when that source is empty, can a newly published
event reach a stranger through it, and what it looks like with zero users.

**Method and its limits.** Every claim about the code is verified by opening the
file and is cited to `path:line`. Claims are labelled EVIDENCE (read in the
source) or INFERENCE (a conclusion drawn from evidence, stated as such). I did
NOT query the production or TEST database, so no claim is made here about live
row counts, live feature-flag values, or live data volume. Where the answer
depends on live data I say so rather than guessing.

**Read path.** The audit was run in the `el-auth-hardening` working tree, which
is 19 commits ahead of `origin/main`. Those 19 commits touch auth, email
plumbing, env manifest, rate-limit policy, CI and `vercel.json` only
(`git diff --name-only origin/main...HEAD`). No discovery surface file differs.
For the files that DO differ and are cited here (`vercel.json`,
`src/lib/waitlist/promote.ts`, `src/app/api/auth/signup/route.ts`) I read the
`origin/main` version via `git show origin/main:<path>`.

**Prior work not repeated.** `docs/strategy/LAUNCH-KIT-MOAT-ANALYSIS.md`,
`docs/strategy/LAUNCH-KIT-REACH-AND-TIE.md` and
`docs/roast/launch-kit-moat-HANDOVER-2026-08-08.md` (all on `feat/launch-kit-moat`,
read via `git show`). Their Part G reach inventory is the starting point. This
document extends it, and corrects it in two places, both flagged in section 4.

---

# PART 1: EXECUTIVE SUMMARY

## If you read nothing else

1. The weekly city digest **cannot include any event an organiser creates**,
   because `city_primary` is never written on create or update and the digest
   query filters on it. 2 to 4 hours to fix.
2. Every "get {City}'s best events weekly" capture on every city page, every
   community-by-city page and every organiser profile **throws the email away**
   and then says "Subscribed". 4 to 6 hours to fix.
3. Search matches the **event title only**, so nine of twelve homepage Sounds
   tiles and three of four header search tabs lead to an empty page.
4. **Category landing pages are structurally almost always empty**, because the
   query takes the six soonest events on the platform and only then filters by
   category. One hour to fix.
5. What genuinely works today: event pages built for Google, the browse
   surfaces, community pages, and the **buyer share loop with tracked
   attribution**. On day one the platform does not supply an audience; it
   supplies a page worth finding and a link worth measuring.

## The one-line answer

Discovery is BUILT almost everywhere and WIRED in fewer places than the code
reads as. Three severed links, each a single unpopulated column or a stub
endpoint, break the chain between "an organiser publishes" and "a stranger sees
it", and the most valuable of the three sits inside the one mechanism the
previous session identified as genuine day-one reach.

## The five findings that change what to do

**1. The weekly city digest cannot include any organiser-created event.**
`fetchDigestEvents` selects on `.eq('city_primary', citySlug)`
(`src/lib/broadcast/digest.ts:82`). `city_primary` is written by exactly one
thing in the repository: a one-off backfill in migration
`20260507000001_city_taxonomy.sql:204-212` that ran against events already in the
table. Neither `createEvent` nor `updateEvent` sets it
(`src/app/(dashboard)/dashboard/events/actions.ts:196`, `:379` write `venue_city`
and stop), and the only trigger on `public.events` is `set_updated_at`
(`supabase/migrations/20260101000001_baseline_schema.sql:357`). Every event
created through the organiser dashboard therefore carries `city_primary = NULL`
forever, and the digest query excludes it. The mechanism the prior analysis
called the one thing that genuinely reaches strangers is severed on the supply
side as well as the demand side. Fixing it is one line in the create and update
payloads plus a backfill.

**2. Every "keep me posted" capture on a city page throws the email away and
says it did not.** `/api/newsletter/subscribe` validates the address, writes a
redacted `console.log`, and returns `{ ok: true }`
(`src/app/api/newsletter/subscribe/route.ts:37-49`). Nothing is stored. The
component that posts to it renders "Subscribed. We'll be in your inbox by next
Friday." on success (`src/components/features/city/city-newsletter-capture.tsx:65-67`).
It is rendered on every city landing page
(`src/components/templates/CityLandingPage.tsx:365`), every community-by-city
page (`src/components/templates/CommunityCityLandingPage.tsx:424`) and every
organiser profile (`src/app/organisers/[handle]/page.tsx:357`). This is the
single largest audience leak on the platform and it is also a false statement to
a user.

**3. Search is a substring match on the event title and nothing else.**
`query.ilike('title', '%' + filters.q + '%')`
(`src/lib/events/fetchers.ts:234`, and again at `:415` on the cached path). Not
description, not venue, not city, not organiser, not category, not tags. The
header search overlay offers four tabs, Communities, Cities, Events and
Organisers, and all four route to `/events?q=...` with a `tab=` parameter that
`parseEventsSearchParams` does not read
(`src/components/layout/header-search-overlay.tsx:43-46`,
`src/lib/events/search-params.ts:8-23`). Three of the four tabs are cosmetic. All
12 homepage Sounds tiles route into the same title search with multi-word
phrases such as `electronic dance` and `afrobeats amapiano`
(`src/components/features/home/sounds-rail.tsx:31-42`), which will match only a
title containing that literal string.

**4. Six URL filters are emitted in real hrefs and none of them is parsed.**
`city`, `date`, `suburb`, `event_type`, `venue` and `tab` all appear in links the
user can click, and `parseEventsSearchParams` handles none of them
(`src/lib/events/search-params.ts:66-101`). The consequence a visitor sees: the
"Open in browse view" link on a city page
(`src/components/templates/CityLandingPage.tsx:275`) and the "View all" links on
its This Week and This Weekend rails (`:128`, `:147`) all land on the unfiltered
national events list. The city filter is only reachable through
`/events/browse/[city]`, which sets it explicitly
(`src/app/events/browse/[city]/page.tsx:100`).

**5. The category landing pages are structurally almost always empty.**
`/categories/[slug]` fetches the six soonest events **platform-wide** with no
category filter in the query, then filters that list of six by category in
JavaScript (`src/app/categories/[slug]/page.tsx:68-84`). A category page shows an
event only when that event happens to be in the six soonest events on the entire
platform. INFERENCE, and a strong one: with any real catalogue every category
landing falls through to the shared empty state regardless of how many events
that category has.

## What actually works today, with no qualifications

- `/events` browse and its filters that ARE parsed: `q`, `preset`, `category`,
  `community`, `sub_community`, `country`, price, date range, distance, sort
  (`src/lib/events/search-params.ts:66-101`). A published event appears here
  immediately.
- City landing pages, fed by `venue_city ILIKE` so they need no new column
  (`src/app/city/[slug]/page.tsx:90`).
- Community landing pages and the `/communities` index, fed by the tag bridge
  from the community multi-select in the event form
  (`src/lib/communities/tag-bridge.ts:158-169`,
  `src/components/features/events/event-form.tsx:439-441`,
  `src/lib/communities/index-page-data.ts:49-56`).
- Schema.org Event structured data on every event page
  (`src/components/features/events/event-schema-jsonld.tsx`, used at
  `src/app/events/[slug]/page.tsx:546`), plus breadcrumbs at `:554`.
- A designed per-event Open Graph share card
  (`src/app/events/[slug]/opengraph-image.tsx`).
- The sitemap, which lists every published event, all 20 cities, 24 suburbs, 21
  communities and all 420 community-by-city intersections
  (`src/app/sitemap.ts`).
- Tracked share links and the `/s/[code]` redirect, seeded default on
  (`broadcast_share: true`, `src/lib/flags/broadcast.ts:48`; the live DB row is
  the authority and was not queried, same caveat as every other flag here).
- **The full buyer acquisition loop on the order confirmation page**: tracked
  share bar, seated share-your-seat invite, and the invite-an-organiser prompt
  with its own attribution parameter (section 2.13).
- Founding invites, organiser to organiser (`src/app/join/[code]/page.tsx:26-73`).

## The honest shape of day one

For a stranger in Geelong with zero platform users and near zero content, the
only genuine encounter paths are: a search engine that has crawled a page,
a link an organiser shared themselves, and someone typing the domain. Everything
else on this list is a surface a person has to already be on the site to reach.
That is normal for a launching marketplace and it is not a defect. What IS a
defect is that the two mechanisms built to change it, the digest and the city
email capture, are both broken in ways that are cheap to fix.

## Ranked repair list

| # | Fix | Effort (my estimate) | What it unblocks |
|---|---|---|---|
| 1 | Write `city_primary` on event create and update, plus a backfill | 2 to 4 h | The weekly digest can carry a new organiser's event at all |
| 2 | Make `/api/newsletter/subscribe` persist into `marketing_consents` with proper consent wording | 4 to 6 h | Every city page and organiser page starts building the digest list instead of discarding it |
| 3 | Parse `city` (and drop or wire `date`, `suburb`, `event_type`, `venue`, `tab`) | 3 to 5 h | Six link types stop lying about what they do |
| 4 | Fix `/categories/[slug]` to filter in the query | 1 h | Category landings stop being empty |
| 5 | Widen search beyond `title` to summary, venue, city and tags | 6 to 10 h | The Sounds rail, the search box and the four tabs stop returning nothing |
| 6 | Correct the two hardcoded `https://eventlinqs.com` JSON-LD URLs | 15 min | Guides structured data stops pointing at a non-canonical host |

Items 1 and 2 together are the whole of "make the digest real". Items 3, 4 and 5
are the whole of "stop the site looking broken to someone who clicks around".

---

# PART 2: THE FULL INVENTORY

Verdict key: **BUILT AND WIRED** (exists, connected, functions on real data),
**BUILT BUT NOT WIRED** (exists and renders, but the connection to its source or
its destination is absent or inert), **ABSENT** (does not exist).

## 2.1 Homepage

**Verdict: BUILT AND WIRED, with two structural limits.**

EVIDENCE. One query feeds everything: `loadHomeUpcoming(supabase, nowIso, 60)`
(`src/app/page.tsx:100`), which selects published, public, future events ordered
by `start_date` ascending with `.limit(limit)`
(`src/lib/events/home-queries.ts:95-103`). Every rail is a slice of that list
(`src/app/page.tsx:107-168`).

**Limit 1: the 60-event horizon.** The homepage sees only the 60 soonest events
platform-wide. An event published today for a date beyond the 60th soonest event
appears on NO homepage rail, including "Just added", because `justAdded` sorts by
`created_at` **within that same 60-row slice** (`src/app/page.tsx:165-168`).
INFERENCE: at low catalogue volume this never bites; at launch density it means
a new organiser announcing three months out gets nothing from the homepage.

**Limit 2: `RAIL_MIN = 3`.** A category rail renders only from three events
(`src/app/page.tsx:114`, and the guard on each rail, for example `:249`). With
one or two events in a category the rail is not thin, it is absent.

**Zero-event state.** Designed, not bare: a card reading "Events loading soon /
The first organisers are getting set up. Check back shortly." with a "List your
event" CTA (`src/app/page.tsx:203-225`). It renders only when
`upcoming.length === 0`.

**Category tiles.** Nine tiles under the hero, each linking to
`/events?category=<slug>` (`src/components/features/home/category-nav-rail.tsx:24-33`,
`:99`). `category` IS parsed and IS applied by slug lookup against
`event_categories` (`src/lib/events/fetchers.ts:236-246`), so these work
mechanically. Two of the nine slugs, `comedy` and `arts-community`, were proven
by the previous session to match no row in `event_categories` on TEST
(HANDOVER section 3A). I have not re-derived that and do not restate it as my own
finding; if it holds, those two tiles and the homepage Comedy rail
(`src/app/page.tsx:128`, `:331`) resolve 200 to a permanently empty result.

**Sounds rail.** BUILT BUT NOT WIRED in effect. Twelve genre tiles, each linking
to `/events?q=<phrase>` (`src/components/features/home/sounds-rail.tsx:27-43`).
Because `q` is a title substring match, `ev('electronic dance')` matches only
titles literally containing "electronic dance". EVIDENCE for the mechanism
(`src/lib/events/fetchers.ts:234`); INFERENCE, strong, that most of the twelve
resolve to the empty state on any realistic catalogue. The three single-word
tiles (`country`, `pop`, `latin`) have a materially better chance than the nine
multi-word ones.

**Community rail and value band.** BUILT AND WIRED. Both link to real
`/community/[slug]` landings, not a search
(`src/app/page.tsx:246`, `:361`).

**City rail.** BUILT AND WIRED. Links to `/city/${c.slug}`
(`src/components/features/home/city-rail-section.tsx:77`), a real landing page,
and the header link goes to `/cities` (`:66`). This is the correct pattern and
it is NOT the pattern the Sounds rail uses.

## 2.2 City pages: `/city/[slug]`

**Verdict: BUILT AND WIRED for content, BUILT BUT NOT WIRED for its own outbound
links.**

EVIDENCE. 20 cities (`CitySlug` union, `src/lib/cities/data.ts:18`).
`generateStaticParams` covers all of them (`src/app/city/[slug]/page.tsx:29-31`).
The query is published, public, future, `ilike('venue_city', '%' + city.name + '%')`,
limit 120 (`:82-94`). A newly published event surfaces with no curation step,
provided `venue_city` contains the city name. Ordering is `start_date` ascending
(`:91`); the "Popular" section is simply the first 12 of that same list
(`:109`), so it is soonest-first, not popularity.

**What breaks.** Three outbound links on this page carry parameters the events
page does not parse:
- `/events?city=${city.slug}` labelled "Open in browse view" (`CityLandingPage.tsx:275`)
- `/events?city=${city.slug}&date=weekend` labelled "View all" (`:128`)
- `/events?city=${city.slug}&date=7d` labelled "View all" (`:147`)
- `/events?city=${citySlug}&event_type=${t.slug}` on the event-type rail
  (`src/components/features/city/event-types-rail.tsx:37`)

All four resolve HTTP 200 and all four show the unfiltered national list.
EVIDENCE: `parseEventsSearchParams` builds its filter object from a fixed key
list that includes neither `city`, `date`, `suburb` nor `event_type`
(`src/lib/events/search-params.ts:81-94`); `filters.city` is only ever set by
`/events/browse/[city]` (`src/app/events/browse/[city]/page.tsx:100`).

**Empty state.** Good. `CategoryHeroEmpty` with "The first {City} event on
EventLinqs could be yours.", an organiser CTA and three trust pillars
(`CityLandingPage.tsx:288-302`). Imagery resolves through the media library with
branded fallbacks, so there is never a broken image.

**Structured data.** `City`, `ItemList` and breadcrumb JSON-LD, all emitted
(`src/app/city/[slug]/page.tsx:166-206`). `numberOfItems` correctly reports 0 on
an empty city rather than fabricating.

**The audience capture on this page is a stub. BUILT BUT NOT WIRED.** This is
exec-summary finding 2 and it lives here because the city page is where it
renders. EVIDENCE: `CityOrganiserCtaPanel` renders `CityNewsletterCapture`
(`src/components/features/city/city-organiser-cta-panel.tsx:77`), headed "Get
{City}'s best events weekly / One email a week, the events worth your time"
(`src/components/features/city/city-newsletter-capture.tsx:59-63`). It POSTs to
`/api/newsletter/subscribe` with `{ email, source: 'city', city }` (`:46-52`) and
on a 200 shows "Subscribed. We'll be in your inbox by next Friday." (`:65-67`).
The endpoint validates the body with zod, writes a `console.log` carrying only a
two-character email prefix, and returns `{ ok: true }`
(`src/app/api/newsletter/subscribe/route.ts:37-49`). Nothing is persisted. Its
own header comment calls it a "v1 stub" whose provider integration "is wired in
M9 marketing", and states the reason plainly: it returns success "so the city CTA
panel stays functional without exposing a 'feature not yet available' message on
a public marketing surface" (`:8-12`).

**Why this is the most expensive line in the audit.** The same component renders
on all 20 city landings (`CityLandingPage.tsx:365`), all 420 community-by-city
pages (`CommunityCityLandingPage.tsx:424`) and every organiser profile
(`src/app/organisers/[handle]/page.tsx:357`). INFERENCE: this is precisely the
moment a Geelong stranger volunteers to become the digest audience the platform
does not have, and it is the one moment the platform discards. The endpoint
already receives the city, and `recordPlatformDigestConsent` already exists and
already handles the Spam Act wording, versioning and unsubscribe token
(`src/lib/consent/record.ts:92-127`). The two are not connected.

## 2.3 Community pages: `/community/[community]` and `/community/[community]/[city]`

**Verdict: BUILT AND WIRED.**

EVIDENCE. 21 communities (`COMMUNITY_TO_TAGS` keys,
`src/lib/communities/tag-bridge.ts:29-111`). The page resolves events through
`buildCommunityTagOrFilter`, a PostgREST `.or()` over `tags.cs.["token"]`
(`:158-169`), applied at `src/app/community/[community]/page.tsx:82`.

**The supply side is genuinely wired.** The event creation form carries a
Communities multi-select whose selections are converted to canonical tokens and
written into `events.tags` on save
(`src/components/features/events/event-form.tsx:439-441`, using
`canonicalTokensForCommunities`, `tag-bridge.ts:144-146`). So an organiser who
ticks "African" produces an event that the African community page finds. This is
opt-in: an organiser who ticks nothing appears on no community page, which is
correct behaviour, not a defect.

**Empty state.** Shared `CategoryHeroEmpty`, same pattern as cities
(`src/components/features/community/events-by-community-grid.tsx:62-80`). The
"View all" link goes to `/events?community=${slug}`, and `community` IS parsed
and applied (`search-params.ts:85`, `fetchers.ts:247-256`), including a
deliberate force-empty on an unknown slug rather than leaking the whole
catalogue (`fetchers.ts:250-252`). This is the correct handling and it is worth
noting because the city equivalent does not do it.

**`/communities` index.** BUILT AND WIRED, and the best empty-state handling on
the platform. Real per-community counts via a `head: true` exact count through
the same tag bridge (`src/lib/communities/index-page-data.ts:49-56`), and a
community with zero events shows the label "Be the first" rather than "0 events"
or "Coming soon" (`src/app/communities/page.tsx:161-164`).

**`/cities` index.** Same pattern, counts by `venue_city ILIKE`, same "Be the
first" label (`src/lib/cities/index-page-data.ts:35-42`,
`src/app/cities/page.tsx:170-173`).

## 2.4 Category pages: `/categories/[slug]`

**Verdict: BUILT BUT NOT WIRED. This is a defect, not a design choice.**

EVIDENCE. The query selects published, public, future events ordered by
`start_date` with `.limit(6)` and **no category predicate**, then filters the
returned six in JavaScript by `e.category?.slug === slug`
(`src/app/categories/[slug]/page.tsx:68-84`). The inline comment explains the
client-side filter as a Supabase nested-WHERE limitation and calls it "Safe at
this event volume", but the limit of 6 is applied before the filter, not after.

INFERENCE: any category whose events are not among the six soonest on the whole
platform shows zero live events and falls through to `CategoryHeroEmpty`
(`src/components/templates/CategoryLandingPage.tsx:137`). At launch density that
is nearly every category, nearly always.

The fix is small: filter by `category_id` in the query the way
`fetchPublicEvents` already does (`src/lib/events/fetchers.ts:236-246`).

## 2.5 Search

**Verdict: BUILT BUT NOT WIRED to anything except the event title.**

EVIDENCE. Both query paths do the same thing:
`query.ilike('title', '%' + filters.q + '%')`
(`src/lib/events/fetchers.ts:234` uncached, `:415` cached). There is no
`textSearch`, no `or()` across columns, no full-text index in play on this path.

**What is therefore NOT searchable:** description, summary, venue name, venue
city, organiser name, category name, tags, artist name.

**And it is unindexed.** EVIDENCE: the hot-path index migration creates four
B-tree compound indexes, `idx_events_status_visibility_start`,
`idx_events_country_start`, `idx_events_category_start` and
`idx_events_is_free_start` (`supabase/migrations/20260425000001_hot_path_indexes.sql:19-31`).
A pg_trgm GIN is mentioned in the header comment at `:12` and **never created**;
no other migration defines a `tsvector`, `to_tsquery` or trigram index. INFERENCE:
a leading-wildcard `ILIKE` against an unindexed text column is a sequential scan
over the events table on every search, so this is a scaling problem as well as a
capability problem.

**Can a newly published event reach a stranger here?** Only if the stranger
types a substring of its exact title.

**The four tabs.** `header-search-overlay.tsx:43-46` defines Communities, Cities,
Events and Organisers, each producing `/events?q=<query>&tab=<id>`. `tab` is not
in `EventsSearchParams` (`src/lib/events/search-params.ts:8-23`) and is never
read. INFERENCE: a visitor who picks the Cities tab and types "Geelong" gets
events whose TITLE contains "Geelong", not events in Geelong. A visitor who picks
Organisers and types an organiser's name gets nothing unless that organiser's
name is in an event title.

**Multi-word queries.** Treated as one literal substring, so "live music
geelong" requires a title containing exactly that phrase. Nine of the twelve
Sounds tiles and nine tiles on the organisers page
(`src/components/features/organisers/community-strip.tsx:38-49`) send multi-word
phrases into this.

**Google sitelinks searchbox.** The homepage declares a `SearchAction` with
`urlTemplate: ${baseUrl}/events?q={search_term_string}`
(`src/components/features/home/home-schema-jsonld.tsx:36`). It points at the
title-only search. Not wrong, but it advertises a capability narrower than the
markup implies.

**Empty state.** Designed and honest: "No results for {query}" with a search-off
icon, a "Clear filters" and a "Browse all events" action
(`src/components/features/events/m5-events-empty-state.tsx:4-33`). Both actions
go to `/events`, so a first-time visitor is never dead-ended.

## 2.6 `/events` browse and filtering

**Verdict: BUILT AND WIRED.**

EVIDENCE. Parsed and applied: `q`, `preset` (`all`, `today`, `tomorrow`,
`weekend`, `7d`, `month`, `free`), `category`, `community`, `sub_community`,
`country`, `price_min`, `price_max`, `from`, `to`, `distance_km`, `sort`, `view`,
`page` (`src/lib/events/search-params.ts:25-101`). Distance uses a Haversine RPC
and requires an explicit origin, degrading to a no-op without one
(`src/lib/events/fetchers.ts:200-214`).

**One honest wrinkle.** Results are filtered post-query by `hasRealCover`, which
rejects null and `picsum.photos` URLs (`src/lib/events/fetchers.ts:93-97`,
applied at `:294`), while `total` comes from the database `count`. A row with a
picsum cover is counted but not shown. In practice the publish gate already
requires a real cover (`src/lib/events/publish-gate.ts:61`), so this can only
affect seed rows. Low impact, recorded for completeness.

**`/events/browse/[city]`.** BUILT AND WIRED, and it is the only surface that
actually sets the city filter (`src/app/events/browse/[city]/page.tsx:100`).

**Its empty state is a problem.** "No events in {City} yet / We're launching in
{City} soon. In the meantime, browse events across {Country} or further afield."
(`src/app/events/browse/[city]/page.tsx:210-231`). Two issues. First, it is
false: the platform is nationally available from day one, so "launching soon" in
Geelong is wrong and contradicts the constitution's display standard. Second, it
contradicts the city landing page's own empty state, which says "The first
Geelong event could be yours." Same fact, two opposite messages, on two pages
one click apart.

## 2.7 The weekly city digest

**Verdict: BUILT BUT NOT WIRED. Severed on the event side.**

EVIDENCE.

- **Schedule.** `/api/cron/weekly-digest`, `0 22 * * 3`, Wednesday 22:00 UTC
  (`vercel.json` on `origin/main`, crons array).
- **Gate.** Flag `broadcast_digest` (`src/app/api/cron/weekly-digest/route.ts:38`).
  The seeded default is **false** (`src/lib/flags/broadcast.ts:48-54`). The DB row
  is the source of truth and I did not query it, so I cannot state whether the
  digest is currently on. That is a question for the founder or an admin check at
  `/admin/flags`.
- **Audience.** `marketing_consents` where `status = 'granted'` and
  `city_slug = <city>` (`src/lib/broadcast/digest.ts:55-68`). Cities are derived
  from the consent rows themselves (`:40-51`), so with zero consents the run
  iterates zero cities and sends nothing.
- **Consent capture.** Three writers, all real: checkout
  (`src/app/actions/checkout.ts:99`), signup
  (`src/app/api/auth/signup/route.ts:217` on `origin/main`), and the account
  notifications page (`src/app/actions/consent.ts:74`). Spam Act posture is
  properly handled: express opt-in, verbatim wording recorded, per-row
  unsubscribe token, no-login withdrawal (`src/lib/consent/record.ts:92-127`).
- **Events.** `.eq('city_primary', citySlug)`, plus published, plus a start date
  inside the seven-day period, plus non-private and non-seed
  (`src/lib/broadcast/digest.ts:77-103`).
- **Idempotence.** One send per city per period via `digest_sends`
  (`route.ts:67-76`). Correct.
- **Operator tooling.** `?dry_run=1`, `?city=`, `?test_to=` all present and
  CRON_SECRET-gated (`route.ts:24-29`). Good.

**The three breaks, in order of severity.**

1. **`city_primary` is never written.** Verified three ways. (a) A repository-wide
   grep for `city_primary` in `src/` returns reads only: `checkout.ts:128`,
   `admin/events.ts:191`, `digest.ts:82`, plus `fixture-events.ts:237` which sets
   it to `null`. (b) `createEvent` and `updateEvent` write `venue_city` and never
   `city_primary` (`src/app/(dashboard)/dashboard/events/actions.ts:196`, `:379`).
   (c) The only occurrences in `supabase/migrations/` are the column definition
   and a one-off soft backfill for rows already present
   (`20260507000001_city_taxonomy.sql:204-212`), and the only trigger on
   `public.events` is `set_updated_at`
   (`20260101000001_baseline_schema.sql:357`). CONCLUSION: an event created
   through the dashboard has `city_primary = NULL` permanently, and the digest
   query cannot match it.

2. **The consent locality depends on a cookie.** `resolveDigestCity` tries the
   `el_city` cookie first and falls back to `event.city_primary`
   (`src/app/actions/checkout.ts:110-135`). Since the fallback is always null, a
   buyer who never set a city in the location picker produces a consent row with
   `city_slug = NULL`, and `fetchDigestCities` filters those out
   (`digest.ts:45`). So the same unpopulated column degrades the audience too,
   though less completely: the account notifications page lets a user pick a city
   explicitly (`src/app/actions/consent.ts:64-72`).

3. **The seven-day window.** `resolveDigestPeriod` runs from today to today plus
   seven days (`digest.ts:32-37`), and `fetchDigestEvents` bounds `start_date` to
   that window (`:84-85`). An event announced three weeks out never appears in a
   digest until the week it happens. For an organiser selling advance tickets,
   the one follower-independent channel fires only in the final week.

**Answer to "confirm what it sends, to whom, how often".** It sends a
city-scoped HTML and text email listing up to 10 events starting in the next
seven days, with a per-recipient one-tap unsubscribe link and the sender
identified, to every granted `marketing_consents` address carrying that city
slug, capped at 500 recipients per city per run, once a week on Wednesday at
22:00 UTC, only when `broadcast_digest` is enabled
(`digest.ts:131-179`, `route.ts:32`, `:120-133`). Inclusion is governed by
`city_primary` equality, the seven-day window, `status = 'published'`,
`visibility != 'private'` and `is_seed_data != true`.

## 2.8 `notify-just-announced`

**Verdict: BUILT AND WIRED, and worth zero to a new organiser. Confirmed.**

EVIDENCE. Runs every 15 minutes (`vercel.json`). Selects published, public,
future events created in the last 14 days
(`src/app/api/cron/notify-just-announced/route.ts:31-42`). Recipients are the
rows in `saved_organisers` for that organisation (`:62-72`), plus, only when
`broadcast_artists` is enabled, the followers of confirmed lineup artists
(`:79-108`). `broadcast_artists` defaults to false
(`src/lib/flags/broadcast.ts:51`). Idempotent via a unique (user, event, type)
index. Push primary, email fallback (`src/lib/notifications/dispatch.ts`).

For an organiser with no followers the recipient set is empty and the cron does
nothing. This confirms the prior session's finding.

**What it would take to make it useful to a new organiser.** The cron is not the
problem; the audience selector is. It reads a follow graph and nothing else. Three
options, cheapest first:

1. **Add a city-interest audience beside the follower audience.** The cron
   already selects `venue_city` on every event (`route.ts:36`). Adding a second
   recipient set drawn from `marketing_consents` for that city, respecting the
   same notification prefs and the same idempotence key, turns a follower-only
   alert into a city alert. This depends on repair items 1 and 2 above, because
   it needs a populated city and a non-empty consent list. INFERENCE: 6 to 10
   hours on top of those.
2. **Add a community-interest audience.** The events already carry community
   tokens in `tags` and `saved_categories` already exists as a table
   (`src/lib/events/fetchers.ts:644`). Matching a new event's tags against a
   user's saved interests is the same shape of query. INFERENCE: 8 to 12 hours.
3. **Repeat-buyer targeting.** See 2.10. Needs purchase history, so it is worth
   nothing until there are buyers.

Also worth noting: **five of the six defined notification types are never
dispatched.** `NOTIFICATION_TYPES` declares `just_announced`, `on_sale`,
`going_fast`, `last_chance`, `tonight` and `waitlist_available` with per-type copy
written for all six (`src/lib/notifications/policy.ts:10-17`, `:97`). The only
call to `dispatchAlert` anywhere in `src/` is the just-announced cron
(`route.ts:120`). The alert engine is one sixth wired.

## 2.9 Squads, waitlists, founding invites

Every verdict in this section was reached by opening the file, not by reading the
route or cron name. Round 1 of the self-roast caught three assertions here that
were made from filenames; they are replaced below with line-cited reads.

**City waitlist (`/waitlist`): BUILT AND WIRED, but as a manual concierge
pipeline, not an audience.** It is discovery-adjacent, not discovery. **Can a
newly published event reach a stranger here? No: nothing about the waitlist
references an event.**

EVIDENCE. `/waitlist` upserts into `city_waitlist_signups` with role, consent
text, consent version, a founding-candidate flag and an unsubscribe token, and
sends a transactional confirmation email
(`src/app/waitlist/actions.ts:87-133`). The table IS read: by the admin demand
signal view (`src/lib/admin/demand-signal.ts:47`,
`src/app/admin/(authed)/network/page.tsx:35`) and by `inviteWaitlistEntry`, which
mints a founding invite and emails the person a warm link
(`src/app/admin/(authed)/network/actions.ts:22-70`). That action is manual,
admin-only, RBAC-gated, and restricted to Geelong and Melbourne by
`isFoundingCity`.

**Correction to the prior analysis.** `LAUNCH-KIT-REACH-AND-TIE.md` states the
waitlist reaches "**Nobody**" and that "a repo-wide search for any read of
`city_waitlist_signups` that sends anything returns nothing". That is not
accurate: `inviteWaitlistEntry` reads the table and calls `sendEmail`
(`src/app/admin/(authed)/network/actions.ts:29`, and the send later in the same
function). The correct statement is narrower and still important: **nothing
automatic reads it, and it is not part of any recurring outbound audience.** The
bridge-into-the-digest recommendation stands; the "dead for outbound" framing
does not.

**Discoverability.** `/waitlist` is linked from exactly one place in the
codebase, `founding-offer.ts:37` (`ctaHref: '/waitlist'`), and appears in neither
the header nav (`src/components/layout/site-header-client.tsx:35-38`) nor the
footer (`src/components/layout/site-footer.tsx:26-69`). A stranger cannot find
it by browsing.

**Ticket waitlist: BUILT AND WIRED. Retention, not discovery.** EVIDENCE, read
from `origin/main`: a per-tier sold-out waitlist where `promote_waitlist` creates
`waitlist_notifications` rows with an expiry window
(`src/lib/waitlist/promote.ts:21-26`), the promoter skips any row already marked
`email_sent` (`:86-87`) and stamps it after sending (`:142-144`). The
`waitlist-expire` cron runs every 5 minutes (`vercel.json`) and calls the
`expire_waitlist_notifications` RPC before re-triggering promotion
(`src/app/api/cron/waitlist-expire/route.ts:10-30`). It converts existing demand
on an event the person already chose. **Can a newly published event reach a
stranger here? No.**

**Squads: BUILT AND WIRED. Acquisition, not discovery.**

EVIDENCE, read rather than inferred from the route name. `/squad/[token]`
resolves the squad through `getSquadByToken` and hard-404s an unknown token
(`src/app/squad/[token]/page.tsx:40-44`), rendering `SquadJoinPanel` for the
invitee. The `squad-expire` cron runs every 5 minutes (`vercel.json`) and calls
the `expire_stale_squads` RPC, which atomically expires forming squads past
their deadline, marks members timed out, cancels reservations and returns the
rows, after which the route issues Stripe refunds to paid members
(`src/app/api/cron/squad-expire/route.ts:11-32`).

INFERENCE on its discovery value: a squad link goes to people the buyer already
knows, about an event the buyer already chose. It brings new humans onto the
platform, so it is a genuine acquisition loop, but it surfaces an event to nobody
who was not personally invited to it. **Can a newly published event reach a
stranger here? No.**

**Founding invites: BUILT AND WIRED. Supply-side acquisition.**
`/join/[code]` renders a real invite landing with the true spots-remaining count
and drops an invite cookie (`src/app/join/[code]/page.tsx:26-73`). It is
organiser to organiser, which is the correct lever per the growth doctrine, and
it is the mechanism the waitlist feeds.

## 2.10 Repeat-buyer notification

**Verdict: ABSENT. Confirmed.**

EVIDENCE. No file under `src/lib/notifications/` or `src/lib/broadcast/` reads
`orders`. The only recommendation surface that reads purchase-adjacent signals is
`fetchForYouFeed`, which uses `saved_organisers`, `saved_categories`, follows,
`saved_events` and `profiles.preferred_city`
(`src/lib/events/fetchers.ts:706-713`), and it is a pull surface behind a login
wall, not a push. Nothing tells a past buyer about a similar new event.

## 2.11 SEO

**Sitemap: BUILT AND WIRED.** (`src/app/sitemap.ts`.) It emits the homepage,
`/events`, `/communities`, `/cities`, `/organisers`, `/pricing`, `/guides` plus
every guide, six legal pages, every picker city under `/events/browse/{slug}`,
all 21 community landings, every faith landing, all 20 city landings, all 24
suburb landings, all 21 by 20 = 420 community-by-city intersections, every
published public event, every organisation with a slug, and every venue with a
slug. It never throws: each database block is individually try-caught
(`:186-249`).

Two observations, both minor:
- The organisation and venue blocks have no activity filter
  (`:213-216`, `:234-237`), so an organisation with no events is submitted to
  Google. `/organisers/[handle]` looks up by `.eq('slug', slug)`
  (`src/app/organisers/[handle]/page.tsx:42`) so the URL is correct, and the page
  has a designed empty state (`:235`), so this is a thin-content risk, not a
  broken link.
- `/categories/[slug]`, `/artists`, `/gigs`, `/feed`, `/waitlist`, `/about`,
  `/help` and `/for-organisers` are not in the sitemap. For `/feed` that is
  correct (it is `noindex`, `src/app/feed/page.tsx:19`). For `/categories/[slug]`
  it is a gap: those are real indexable landing pages.

**Robots: BUILT AND WIRED.** `allow: '/'` with `/api/`, `/dashboard/`,
`/checkout/`, `/auth/`, `/admin/`, `/account/`, `/orders/` disallowed, and the
sitemap declared (`src/app/robots.ts:6-31`). `/dev/*` is deliberately left
crawlable with a documented rationale; it is unlinked and absent from the
sitemap.

**Structured data: BUILT AND WIRED, one defect.**
- Event: full Schema.org `Event` with sub-type mapping, `Place` and
  `PostalAddress`, `GeoCoordinates`, `Organization` organizer, `Offer` or
  `AggregateOffer` with availability, and `isAccessibleForFree`
  (`src/components/features/events/event-schema-jsonld.tsx:93-141`), rendered at
  `src/app/events/[slug]/page.tsx:546`, with breadcrumbs at `:554`.
- City, community, community-by-city, suburb, faith, organiser, venue, guides,
  the `/cities` and `/communities` indexes and the homepage all emit their own
  JSON-LD. `grep -rln "ld+json" src/` returns 14 files, of which one is the
  shared `BreadcrumbJsonLd` component and one is the event emitter above.
- **The defect.** `src/app/guides/[slug]/page.tsx:57` sets
  `mainEntityOfPage: 'https://eventlinqs.com/guides/' + guide.slug` and
  `src/app/guides/page.tsx:45` sets `url: 'https://eventlinqs.com/guides/' + guide.slug`.
  Both are hardcoded. The canonical host is `https://www.eventlinqs.com.au`
  (`src/lib/site-url.ts:37`, the founder ruling of 25 July 2026, with every other
  branded host 301-ing to it). So the guides structured data points at a
  different TLD from every other URL the platform emits. This confirms the
  previous session's finding and names the correct host. Fix: use `getSiteUrl()`,
  as every other JSON-LD emitter already does.

**Canonicals: BUILT AND WIRED.** `metadataBase` is set from `getSiteUrl()`
(`src/app/layout.tsx:49`), and every audited page sets
`alternates: { canonical: ... }`: homepage (`src/app/page.tsx:68`), `/events`
(`:40`), event detail (`:164`), city (`:44`), community (`:44`), category
(`:38`), venue (`:117`).

**Indexability of event pages.** Yes. `/events/[slug]` carries no `noindex`, is
in the sitemap, has a canonical, has Event JSON-LD and has a per-event Open Graph
card. This is the one place where the SEO compounding engine is genuinely
complete.

## 2.12 Open Graph and share previews

**Verdict: BUILT AND WIRED, with an uneven tail.**

- **Event pages: bespoke.** `src/app/events/[slug]/opengraph-image.tsx` renders a
  1200 by 630 PNG from the event's own cover under the platform's navy scrim,
  with a gold eyebrow, title, date and venue line, and a documented brand
  fallback when there is no cover. Non-published events return null from
  `fetchOgEvent` (`:34-46`).
- **Site default:** `src/app/opengraph-image.tsx`.
- **Twitter cards:** `summary_large_image` declared at the root
  (`src/app/layout.tsx:66-70`) and on the homepage (`src/app/page.tsx:77-82`).

**The sweep the brief asked for.** EVIDENCE: I tested every public route file for
the presence of a page-level `openGraph` block. Results:

| Defines its own `openGraph` | Defines none |
|---|---|
| `/` , `/about`, `/press`, `/careers`, `/cities`, `/communities`, `/city/[slug]`, `/city/[slug]/[suburb]`, `/community/[community]`, `/community/[community]/[city]`, `/categories/[slug]`, `/faith/[faith]`, `/venues/[handle]`, `/organisers/[handle]`, `/guides/[slug]`, `/events/browse/[city]`, `/events/[slug]` | `/pricing`, `/organisers`, `/guides`, `/help`, `/contact`, `/events`, `/artists/[slug]`, `/feed`, `/waitlist`, `/tickets` |

**What the second column actually gets.** The root layout defines an `openGraph`
object with `type`, `title`, `siteName`, `locale` and a generic description, and
**no `images` key** (`src/app/layout.tsx:58-64`). The root
`src/app/opengraph-image.tsx` is a file-convention image inherited by nested
segments that do not define their own. So those pages do produce Open Graph tags
and a preview image. **No public page ships a broken or missing preview.**

INFERENCE, and it is the reason this matters: a shared `/pricing` or `/organisers`
link previews with the generic platform title and the generic site card, not with
anything about pricing or organisers. `/events` is the notable one, since it is
the page the digest email's main CTA points at
(`src/lib/broadcast/digest.ts:163`). `/feed`, `/waitlist` and `/tickets` are
private or unlisted, so their generic card is correct.

**Limit on this evidence, stated rather than glossed.** I tested for the presence
of the metadata block in the source, not for the rendered `og:` tags in a
response. I did not run the app. A render capture would settle the exact merged
output, and it is a five-minute check.

**Can a newly published event reach a stranger here?** Yes, and this is the
strongest link in the chain: any share of an event URL renders as a designed,
event-specific card.

## 2.13 The buyer acquisition loop

**Verdict: BUILT AND WIRED. This is the strongest thing on the platform that
works with zero users, and it is a surface the founder's list did not name.**

EVIDENCE, all on the order confirmation page
(`src/app/orders/[order_id]/confirmation/page.tsx`):

- **Share-a-ticket.** `EventShareBar` is rendered on the confirmation
  (`:9`). It mints tracked links post-paint through
  `/api/broadcast/share-link` (`src/components/features/events/event-share-bar.tsx:69`),
  offers a WhatsApp intent carrying the tracked URL (`:100-101`) and a clipboard
  copy of a channel-tagged link (`:171`). Anonymous sharers are allowed by the
  minting route.
- **Share-your-seat.** A seated order gets a variant that puts the buyer's exact
  seat into the invite (`confirmation/page.tsx:339-340`).
- **Invite-an-organiser.** The same page carries "Run your own events on
  EventLinqs / It is free to start. List your event, reach your community, and
  keep every attendee relationship.", with the link attributed
  `via=organiser-invite` so the conversion is measurable (`:377-382`).
- **Attribution closes the loop.** A confirmed order arriving with a tracked
  share cookie credits the originating link's channel via
  `recordShareConversionForOrder` (`:76-80`,
  `src/lib/broadcast/conversion.ts`). Clicks are recorded server-side by the
  `/s/[code]` redirect and conversions server-side here, so neither can be forged
  from a browser (`src/app/api/broadcast/track/route.ts:19-25`).

**Why this matters more than its size suggests.** INFERENCE: this is the only
mechanism on the platform that grows an audience from zero without spend. Every
buyer is handed a measured invitation and an organiser pitch at the moment of
highest goodwill. It is exactly the loop the growth doctrine names as
Eventbrite's real engine, and unlike the digest it has no severed dependency.

**Its honest limit.** It fires only after a purchase. With zero buyers it reaches
nobody, so it compounds an audience rather than creating the first one. **Can a
newly published event reach a stranger here? Yes, but only through a person who
has already bought a ticket to it.**

**One gap.** The confirmation EMAIL carries no share prompt. EVIDENCE: a grep of
`src/lib/email/order-confirmation.ts` on `origin/main` for share, invite or `/s/`
returns nothing relevant. The loop lives entirely on the web page, so a buyer who
closes the tab and later opens the email gets the ticket and no invitation.

## 2.14 Every other path that could put an event in front of somebody

| Path | Verdict | Evidence and reach |
|---|---|---|
| Tracked share links `/api/broadcast/share-link` and `/s/[code]` | **BUILT AND WIRED** | Flag `broadcast_share`, seeded default **true** (`src/lib/flags/broadcast.ts:48`); as with `broadcast_digest`, the live DB row is the authority and was not queried. Anonymous sharers allowed. A forged code 302s to `/events`, never 404s (`src/app/s/[code]/route.ts:33-49`). Even with the flag off the redirect still works and only the tracking is lost (`route.ts:24-26`), so sharing cannot break |
| Web push `/api/push/subscribe` | **BUILT, sign-in only** | Returns 401 without a session (`route.ts:26`). Reaches zero strangers by construction, and only fires through `notify-just-announced` |
| `/api/newsletter/subscribe` | **BUILT BUT NOT WIRED** | Stub. Logs and discards (`route.ts:37-49`). See finding 2 |
| Organiser marketing consent + attendee export | **BUILT AND WIRED** | `organiser_marketing_consents` written at checkout, surfaced in the export (`src/lib/reporting/attendees.ts:116`). This is the data-ownership promise and it is real |
| `/feed` For You | **BUILT AND WIRED, sign-in only** | Redirects anonymous users to `/login?redirect=/feed` (`src/app/feed/page.tsx:36-38`), `noindex`. Ranks by the follow graph. Designed empty state when the graph is empty (`:68-82`) |
| `/api/home/surprise` | **BUILT AND WIRED** | Random pick from 30 upcoming events. A browse affordance |
| `/artists`, `/gigs` | **BUILT, gated OFF** | Both call `notFound()` unless `artist_showcase` / `gig_board` are enabled (`src/app/artists/page.tsx:46`, `src/app/gigs/page.tsx:34`); both default false. Not in the sitemap, so no dead links result |
| `/organisers/[handle]`, `/venues/[handle]`, `/artists/[slug]` | **BUILT AND WIRED** | Real profiles with their own JSON-LD and `CategoryHeroEmpty` empty states. Venue pages resolve by slug with a name-derived fallback (`src/lib/venues/resolver.ts:133-155`) |
| `/faith/[faith]` | **BUILT AND WIRED** | In the sitemap, own JSON-LD |
| **Ticket transfer** `src/app/actions/transfer-ticket.ts` | **BUILT AND WIRED** | Sends "You have been sent a ticket to {title}" to an arbitrary address (`:62-73`). This DOES reach a person who never transacted with us, so my earlier framing of transactional email as reaching only past buyers is wrong and is corrected here |
| **Marketplace performer alert** `src/lib/marketplace/notify.ts` | **BUILT, gated OFF** | `notifyMatchingPerformers` (`:156-173`) dispatches a gig alert to matching performers, idempotent on unique (user, type, subject). Puts a GIG in front of somebody, not a ticketed event, and rides the `gig_board` flag which defaults false |
| Publish-time notification | **ABSENT** | Confirmed. No notify, dispatch, alert, digest or push call in the publish path (`src/app/(dashboard)/dashboard/events/actions.ts`). Reach happens on a cron or not at all |

**The complete email enumeration the brief asked for.** EVIDENCE:
`grep -rn "sendEmail(" src/` returns 13 call sites outside the sender itself.
Classified:

| Call site | Class | Reaches a stranger? |
|---|---|---|
| `src/app/api/cron/weekly-digest/route.ts:114`, `:128` | **Discovery** | Yes in principle, no in practice (section 2.7) |
| `src/lib/notifications/dispatch.ts` | **Discovery** | Only followers |
| `src/app/actions/transfer-ticket.ts:62` | **Acquisition** | Yes, a non-buyer |
| `src/app/admin/(authed)/network/actions.ts` | **Acquisition, manual** | Yes, a waitlist signup, founder-triggered |
| `src/app/waitlist/actions.ts` | Retention | No, confirms a signup |
| `src/lib/email/order-confirmation.ts` (via the Stripe webhook, `src/app/api/webhooks/stripe/route.ts:7`) | Retention | No |
| `src/lib/marketplace/notify.ts` | Marketplace, gated off | Performers only |
| `src/app/(dashboard)/dashboard/events/[id]/seats/actions.ts` | Retention | No, a seat move |
| `src/lib/auth/dispatch-auth-link.ts`, `src/lib/email/auth-emails.ts` | Auth | No |
| `src/lib/ai/handoff.ts` | Support | No |
| `src/lib/health/runner.ts`, `src/app/api/cron/webhook-sentinel/route.ts`, `src/app/api/cron/auth-sentinel/route.ts` | Operations, founder only | No |

INFERENCE: of 13 email paths, **two can put an event in front of someone who has
never used the platform**, and one of those two (the digest) currently cannot
select an event to put there.

---

# PART 3: THE THREE QUESTIONS

## Q1. The day one picture

*A stranger in Geelong who has never heard of EventLinqs. What are all the ways
they could possibly encounter an event on this platform today, with zero users
and near zero content?*

**The short answer: five paths, and every one of them requires a human who
already knows about the event to do something first, except the search engine.
The platform itself introduces nobody to anybody on day one.**

Round 1 of the self-roast caught me listing three and calling it complete. Here
are all five, each with what it actually depends on.

**Path 1: organic search.** Real and correctly built. Event pages are indexable,
canonical, in the sitemap, and carry complete Schema.org `Event` markup with
offers and availability (section 2.11). City and community-by-city pages exist as
420-plus long-tail landing pages, each with its own JSON-LD. This is the quiet
compounding engine and it is the one thing on this list that is genuinely
finished. The caveat is time, not code: a new domain with a handful of pages does
not rank in weeks, and Google's event rich results need a live, dated, priced
event to surface. So Path 1 is real but slow, and it is slower still while the
catalogue is thin.

**Path 2: a link the organiser shared themselves.** Real, and today it is the
only path with any velocity. Tracked share links are on by default, work for
anonymous sharers, and never break (`src/app/s/[code]/route.ts`). The shared link
renders as a designed per-event Open Graph card, not a bare URL
(`src/app/events/[slug]/opengraph-image.tsx`). The crucial point: **the platform
is not supplying the audience here, the organiser is.** That is exactly right for
day one and it should be said out loud rather than dressed up.

**Path 3: another attendee shared it with them.** Real, and the one that
compounds. Every buyer lands on a confirmation page carrying a tracked share bar
with a WhatsApp intent, a seated share-your-seat invite, and an
invite-an-organiser prompt (section 2.13). A Geelong stranger who is in a group
chat with one buyer is reachable. This is the mechanism that turns the first
ticket into the second, and it costs nothing. Its limit is arithmetic: it needs
buyer number one before it can produce buyer number two.

**Path 4: a printed QR poster.** Real and physical, and worth naming because the
Launch Kit is the whole reason for this audit. An A4 poster with a QR pointing at
the live event page reaches somebody standing in a Geelong cafe who has never
heard of the platform, and it is the one path that does not depend on a screen at
all. EVIDENCE that the destination works: `/events/[slug]` is public with no auth
gate, uses the anon client, and renders under ISR
(`src/app/events/[slug]/page.tsx:1`, `:84`, `:111`). CAVEAT: the poster
generation itself lives in `src/lib/broadcast/poster.ts` and the launch kit
screen, which are the other session's active work area and outside this audit's
scope; I verified the destination, not the artefact.

**Path 5: direct navigation.** Someone hears the name and types it. Depends
entirely on the founder's own recruiting and word of mouth.

**What is NOT a path today, and why each one fails.**

- **The weekly city digest.** Fails twice over. There are no Geelong consent rows
  to send to, and even if there were, the event would not be selected because
  `city_primary` is null on every dashboard-created event (section 2.7).
- **Just-announced alerts.** Fails because a new organiser has zero followers
  (section 2.8).
- **Web push.** Fails because it requires a sign-in and it only ever fires from
  the just-announced cron.
- **The city page email capture.** Fails silently: it accepts the address, says
  "Subscribed", and stores nothing (section 2.2, finding 2).
- **The homepage.** Only reaches someone already on the homepage. And with a thin
  catalogue most rails self-hide below three events, so the page a stranger lands
  on is shorter than it looks in the design.
- **The `/waitlist` page.** Not in the header, not in the footer, one link in the
  entire codebase. A stranger cannot find it.

**So the honest sentence for the pitch:** on day one EventLinqs does not put your
event in front of an audience in Geelong, because there is no Geelong audience
yet. It gives your event a page that Google can rank, a link that measures every
share you make, a poster whose code opens that page, and a loop that turns each
buyer into the next invitation. The audience is built, not switched on, and the
tools for building it are the product.

## Q2. The first ten organisers

*What can this platform honestly deliver for them, today, with evidence?*

**Deliverable, today, provable by opening the code:**

1. **A published event page that works and is built to be found.** Complete
   Schema.org `Event` markup, canonical URL, in the sitemap the moment it is
   published, and a designed social card. EVIDENCE: section 2.11 and 2.12. This
   is a real competitive artefact, not a claim.
2. **Immediate presence on every browse surface, with no curation step and no
   listing fee.** `/events` (`fetchers.ts:216-291`), the city landing for their
   venue city (`city/[slug]/page.tsx:82-94`), the `/communities` index count and
   their community landing if they tick a community
   (`index-page-data.ts:49-56`), and the homepage rails when the catalogue
   supports them.
3. **Measurement of every share against real ticket sales.** Tracked links, per
   channel, minted for anonymous and signed-in sharers alike, on by default.
   EVIDENCE: `src/lib/broadcast/share-links.ts`, `src/app/s/[code]/route.ts`,
   `src/app/api/broadcast/track/route.ts`. This is genuinely differentiated.
4. **An acquisition loop that runs on every ticket sold, without them lifting a
   finger.** Every buyer gets a tracked share bar, a seated share-your-seat
   invite, and an invite-an-organiser prompt on the confirmation page, and every
   resulting order is attributed back to the channel that produced it. EVIDENCE:
   section 2.13, `src/app/orders/[order_id]/confirmation/page.tsx:9`, `:76-80`,
   `:339-340`, `:377-382`. This is the single most under-sold thing the platform
   has, and it is the mechanism the growth doctrine names as the real engine.
5. **Full attendee data ownership.** The consent table and the export are built,
   with an opted-in column. EVIDENCE: `src/lib/reporting/attendees.ts:116`,
   `src/app/(dashboard)/dashboard/events/[id]/attendees/export/route.ts`. The
   second blade of the wedge is real.
6. **Free events are free.** EVIDENCE: the fee model and its single-source
   resolver, `docs/FEE-SYSTEM.md` as the authority. I did not re-audit the fee
   engine in this pass and make no claim about it beyond what that document
   already governs.
7. **A founding invite they can pass to another organiser**, with a real
   spots-remaining count (`src/app/join/[code]/page.tsx:26-73`).

**Not deliverable, and must not be implied:**

- Any audience. See Q1.
- Any promise involving the weekly email, in any city, until repairs 1 and 2
  land. Saying "your event goes into the Geelong weekly email" is false today,
  because the digest query cannot select the event.
- Anything from the Sounds tiles, the header search tabs, or the category
  landing pages, all of which currently return empty or unfiltered results
  (sections 2.1, 2.5, 2.4).

**The shortest credible path from that to something worth telling organiser
number fifty.**

The prior analysis proposed bridging the waitlist into the digest as the cheapest
real answer. That is directionally right and it is now provably insufficient on
its own: bridging a list into an audience does nothing while the event side of
the query can never match. The corrected sequence, cheapest first, each step
useless without the one before it:

1. **Populate `city_primary` on create and update, and backfill.** 2 to 4 hours.
   Without this every later step is decoration. After this, the digest can select
   a new organiser's event.
2. **Make the city email capture persist.** 4 to 6 hours. Point
   `/api/newsletter/subscribe` at `recordPlatformDigestConsent` with proper
   consent wording and the city slug it already receives in the request body. The
   capture surface already exists on 20 city pages, 420 community-by-city pages
   and every organiser profile. This is where the audience comes from, and today
   every one of those submissions is thrown away.
3. **Bridge `city_waitlist_signups` into the digest audience** for entries whose
   `marketing_opt_in` is true, honouring the consent text already recorded.
   6 to 10 hours. This converts the existing list rather than waiting for a new
   one.
4. **Show the organiser the real number.** "Your event goes into the Geelong
   weekly email. N people get it." N comes from a count on `marketing_consents`
   for that city, which is a single query once steps 1 to 3 exist. 4 to 6 hours.
   This is the thing worth telling organiser number fifty, and it is worth
   telling precisely because it is a number and not a claim.

Total 16 to 26 hours to turn the reach story from a promise into an integer.
Everything else on this audit's repair list is about not looking broken;
these four are about having something true to say.

**What the first ten get instead of reach, and it should be said plainly:** the
founder. Concierge onboarding, the event built with them, and the founder's own
Geelong and Melbourne network pointed at their first night. The constitution's
growth doctrine already says recruit the first 25 to 50 personally. The tooling
makes that conversation shorter; it does not replace it.

## Q3. The empty state problem

*Audit what each surface actually shows when empty, and report which ones would
make a stranger leave.*

Empty states on this platform are unusually well handled in some places and
actively harmful in others. Ranked by how much damage a Geelong first impression
takes.

### Would make a stranger leave

**1. Any category landing page, on any day.** `/categories/[slug]` shows the
shared `CategoryHeroEmpty` almost always, because of the limit-6-then-filter
defect (section 2.4). The empty state itself is well designed. The problem is
that a visitor who clicks "Music" from a site that visibly has music events and
lands on "the first Music event could be yours" concludes the platform is empty
and wrong. **This is the worst one, because the page lies about the catalogue.**

**2. Any Sounds tile from the homepage.** Nine of twelve send a multi-word phrase
into a title-substring search and land on "No results for electronic dance"
(section 2.1, 2.5). Same damage: the platform looks empty when it is not, and
the visitor is one click from the homepage when it happens.

**3. `/events/browse/[city]` for a launch city.** "We're launching in Geelong
soon" (`src/app/events/browse/[city]/page.tsx:213-219`). For a Geelong stranger
this is the worst possible sentence: it says the product is not for them yet, in
the one city where the founder has actual reach, and it contradicts the city
landing page one click away which says the first Geelong event could be theirs.
**Fix the copy before any Geelong marketing runs.**

**4. The city page email capture, on success.** Not an empty state, a false one.
"Subscribed. We'll be in your inbox by next Friday." when nothing was stored
(section 2.2). A stranger who gives their address and never hears from us has
been actively misled, which is worse than an empty page. It also poisons the
exact list the digest needs.

### Would not make a stranger leave

**5. The homepage with zero events.** Designed card, honest copy, organiser CTA
(`src/app/page.tsx:203-225`). Fine. The subtler issue is the partial case: with
one or two events per category every rail self-hides at `RAIL_MIN = 3`, so the
page silently shortens rather than showing thin rails. That is the right call
visually, but it means the homepage under-represents a small catalogue.

**6. City landing with zero events.** `CategoryHeroEmpty`, "The first Geelong
event on EventLinqs could be yours", organiser CTA, three trust pillars, full
hero photography (`CityLandingPage.tsx:288-302`). This is the correct pattern
and it reads as intent, not absence.

**7. Community landing with zero events.** Same component, same quality
(`events-by-community-grid.tsx:62-80`).

**8. `/communities` and `/cities` indexes.** The best on the platform. Real
counts, and a zero-count tile reads "Be the first" rather than "0 events"
(`communities/page.tsx:161-164`, `cities/page.tsx:170-173`). No "Coming soon"
anywhere.

**9. `/events` with no results.** Designed, with two working escape hatches
(`m5-events-empty-state.tsx:4-33`). A visitor is never dead-ended.

**10. `/feed` with an empty graph.** Designed prompt to start following
(`feed/page.tsx:68-82`). Behind a login wall, so no stranger sees it.

**11. Zero-event community-by-city intersections.** All 420 render the shared
empty state with spine imagery and a branded fallback, so there is never a broken
image (`CommunityCityLandingPage.tsx:294`). Correct.

### The pattern worth naming

The empty states that were **designed as a component** are all good. The ones
that hurt are all cases where a surface is empty for a reason that has nothing to
do with content: a broken query (categories), a search that cannot match
(Sounds), copy written for a different strategy (browse-by-city), or an endpoint
that discards its input (newsletter). None of the four is an empty-state design
problem. All four are wiring problems wearing an empty state as a costume, and
fixing the wiring makes all four disappear without touching the design.

---

# PART 4: CORRECTIONS TO PRIOR WORK

Both corrections are to `docs/strategy/LAUNCH-KIT-REACH-AND-TIE.md` section G2,
and both are offered with the evidence so they can be checked.

**Correction 1. "A brand new organiser's event appears automatically" in the
weekly digest is false.** The G2 table says the digest reaches everyone in
`marketing_consents` matching the event's `city_primary`, is follower-independent,
and that a new organiser's event appears automatically. The first two clauses are
right. The third is wrong, because `city_primary` is never written on event
create or update and there is no trigger (evidence in section 2.7, finding 1).
This matters because the whole G2 conclusion rests on the digest being the one
working mechanism, and the recommended fix, bridging the waitlist into the
audience, would not have produced a single send.

**Correction 2. The city waitlist is not "dead for outbound".** G2 records the
audience as "**Nobody**" on the basis that no read of `city_waitlist_signups`
sends anything. `inviteWaitlistEntry` reads the table and sends an email
(`src/app/admin/(authed)/network/actions.ts:22-70`). It is manual, admin-only and
limited to Geelong and Melbourne, so the strategic point survives: there is no
automatic recurring channel. The factual claim as written does not.

Everything else in G2, G3 and G4 that I was able to check against the code held
up, including the follower-only nature of just-announced, the absence of a
publish-time notification, and the absence of repeat-buyer targeting.

---

# PART 5: WHAT I COULD NOT DETERMINE

Stated plainly rather than filled in.

1. **The live value of `broadcast_digest` and `broadcast_share`.** Both seeded
   defaults are in `src/lib/flags/broadcast.ts:47-54` (digest false, share true)
   but the `feature_flags` DB row is the authority and I queried no database.
   **What to do:** open `/admin/flags` and read the two rows. If
   `broadcast_digest` is OFF, the digest has never sent and finding 1 is latent
   rather than active, which lowers its urgency but not its cost to fix. If it is
   ON, the cron has been running weekly and sending nothing, which means the
   `digest_sends` table will show either no rows or rows with `event_count` 0,
   and that is direct confirmation of finding 1 without touching the code.
2. **Live row counts.** How many `marketing_consents` rows exist and in which
   cities, how many `city_waitlist_signups` are in Geelong and Melbourne, how
   many published events, and how many events still carry a non-null
   `city_primary` from the 2026-05-07 backfill. **What each answer means:** a
   non-zero `city_primary` count tells you which events the digest CAN currently
   see, and it will be exactly the pre-backfill seed set, none of the organiser
   ones. None of this changes a finding; all of it changes the severity ordering.
3. **Whether `comedy` and `arts-community` exist in `event_categories` on
   production.** The prior session verified their absence on TEST and instructed
   that it not be re-derived. I have carried their finding forward as theirs and
   not restated it as mine.
4. **Whether the two hardcoded `eventlinqs.com` guides URLs cause a measurable
   indexing problem.** The code defect is certain; the SEO consequence depends on
   what Google has already crawled.
5. **Real search behaviour at volume.** I read the query construction, not query
   plans or results. The claim that multi-word Sounds queries return nothing is
   an inference from `ilike('title', '%phrase%')`, clearly flagged as such in
   section 2.1. A five-minute check against TEST would settle it.
