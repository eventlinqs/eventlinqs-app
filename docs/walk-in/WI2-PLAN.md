# WI2 plan: the city guide, venue pages and weekly nights. 21 October 2026.

Written by Window 4 on the project manager's order of 21 October 2026, 21:30,
from `C:\dev\design\amcf-21oct\locked\WI2-ITEM.md` (approved by Lawal Adams,
12:11, extended 14:08). This is a plan only. No WI2 code is written until WI1
is finished under the completion law (Definition of Done). Questions are in
section 12, written in full; nothing below waits on them except where marked.

## 1. Order and slices

Ruling b of 14:08 fixes the order, each part finished before the next starts:

1. **Part 1, the founder only import.** Hosts (venues) and their nights load from
   a checked CSV and go live as walk-in event pages (WI1). Two slices:
   - 1a. Migration (section 5), the import script with its dry run, the
     occurrence generator, the import's own tests.
   - 1b. What an EventLinqs listing shows on its occurrence page: "Hosted by",
     the provenance line, "Last checked", the removal link and its request
     form, the category image, the 21-day rule, the guard (section 10).
   Every page Part 1 makes live is an unclaimed listing, so the provenance line,
   the removal link and the 21-day rule ship in Part 1, not later.
2. **Part 2, the city "this week" pages**, `/free/<city>/this-week`, one slice.
3. **Part 3, venue pages and the claim flow.** Three slices: 3a the venue page,
   3b the claim and the owner's removal, 3c the Instagram embed.

Operating rule 1 (ship small and daily) holds: each slice is its own pull
request, stacked, none carrying more than two days of unmerged work.

## 2. Governing laws (Law 0)

Law 0, Definition of Done, Law 1, Law 2 (the venue page and the city guide are
page builds: capture first), Law 3 (Australian cities and copy), Law 5 (every
date, venue, claim and removal link resolves), Law 6 (we render, never
generate; the share card is a rendering), Law 7 (section 3), Law 8, Law 10
(section 11), the Design system and Motion (inherit `/this-weekend`, the venue
page and the WI1 walk-in page; no new colour, size or type), Copy and banned
content, the Growth plan's SEO engine (structured data, sitemap), Verification
and gates: Migrations, including the 21 October grant rule; operating rules 1,
3, 4 and 6 of 25 September (small daily, production guards before merge,
production writes by script with APPLY, legal wording versioned).

## 3. Law 7 reading

Read on 21 October 2026. Every page is saved for re-checking under the WI2
scratch folder (`wi2-law7`), and the quotes below were matched against those
files. Quotes are verbatim; dates are the page's own.

**Google Search Central, Event structured data**,
https://developers.google.com/search/docs/appearance/structured-data/event
("Last updated 2026-09-08 UTC").

> "Each event MUST have a unique URL (a leaf page) and markup on that URL."
> "We recommend focusing on adding markup to your event posting pages instead of pages that list schedules or multiple events."
> "If there are several different performances across different days, each with individual tickets, add a separate Event element for each performance."
> "Don't mark business hours as events, such as: "Adventure park open 8 AM to 5PM.""
> "Don't mark coupons or vouchers as events, such as: "5% off your first order.""
> "Set the @type to Place. Add the location.address and location.name properties."
> organizer: "The person or organization that is hosting the event."

Decided: every dated occurrence is its own page carrying its own Event; the
venue page and the city pages carry an ItemList, never Event markup (the
house rule already in the venue page). Each occurrence's `location` carries
the host's name and address, and its `organizer` is the host, never the
listings organisation. The import refuses a row that is opening hours, a
happy hour, a special or a discount (section 6). The page says nothing about
recurring series: how to mark a series is UNSOURCED, so WI2 marks dates only.

**Google Business Profile help** (no dates on the pages):
https://support.google.com/business/answer/2911778,
https://support.google.com/business/answer/4566671,
https://support.google.com/business/answer/7107242,
https://support.google.com/business/answer/16043467.

> "If an unverified Business Profile for your business already exists, you can claim the Business Profile"
> "You can add or claim your business at no charge."
> "Select Request Access." "The current profile owner is then notified by email and has 3 days to respond."
> Verification methods listed: "Phone or text", "Email", "Live video call", "Mail".
> "You can request a business to be removed, even if you don't own the Business Profile."

Decided: Google lists businesses nobody has claimed and lets the business
claim, free; an emailed code is one of its methods; a venue already claimed
gets "Request access", which emails the current owner with 3 days to answer;
and anyone may ask for a removal. WI2's claim and removal follow that shape.

**Eventfinda**, venue page
https://www.eventfinda.com.au/venue/the-motley-bauhaus-melbourne2 and a
repeating event https://www.eventfinda.com.au/2025/the-big-hoo-haa/melbourne/carlton
(no dates shown); help centre articles
https://support.eventfinda.com.au/hc/en-gb/articles/360038662952 (updated
2024-08-22) and 201839789 (updated 2020-01-23); https://www.eventfinda.com.au/about/help.

> "Eventfinda is a website that allows the general public to both search for and list events"
> "If you are a venue owner or are the representative of the venue, please feel free to claim the listing on our site."
> "After claiming your venue, a moderator will review your request."
> "we insist on each day being displayed individually and not as a date range."

The venue page shows name, address, "Official Website", a map, then
"Upcoming events at" and "Past events at". The repeating event lists each
session as its own dated line, with a "Cancelled" badge and "Add session to
calendar" per session, and past sessions folded away. No "Every Friday" label
appears except in the organiser's own words.

Decided: third-party listing with a venue claim is market practice
(Eventfinda); one dated row per occurrence, each with its own calendar add and
its own cancelled state, is parity (WI1 gives each occurrence both). Showing
the rule in words beside the dates ("Every Wednesday, 7pm") is EventLinqs' own
addition: no competitor page read shows it, so it is a Phase B choice, not a
mirrored one.

**City of Melbourne What's On** (no dates on the pages):
https://whatson.melbourne.vic.gov.au/tags/free,
https://whatson.melbourne.vic.gov.au/things-to-do/library-cinema-at-narrm-ngarrgu,
https://whatson.melbourne.vic.gov.au/disclaimer, and the listing help read from
the file its help page loads, https://whatson.melbourne.vic.gov.au/pages/faq.json
(the page itself returned a bot challenge).

> "This is a free event" / "Booking not required"
> Events must be "available for individual bookings and submitted by the organiser or authorised agent."
> Excluded: "Menu specials, degustation menus or happy hours"
> "hospitality events must fall outside a venue's regular activities"
> "We may ask for proof of ownership or relationship and will be able to transfer ownership of a listing once confirmed."

Decided: What's On takes listings only from the organiser and excludes a
venue's regular activities, so EventLinqs listing a venue's regular nights is
a deliberate difference, made by Lawal's ruling of 12:11, not market parity.
The line WI2 holds is Google's: a night with a name and a start is an event;
opening hours, a happy hour or a special is not. Claims are transferred on
proof, as What's On does by hand; WI2 proves by code and keeps the by-hand
path for venues with no email.

**Meta and Instagram.** https://developers.facebook.com/docs/instagram-platform/oembed
("Updated : May 15, 2026");
https://developers.facebook.com/docs/features-reference/meta-oembed-read/ (no
date); https://help.instagram.com/620154495870484 (no date).

> "Posts on private, inactive, and age-restricted Instagram accounts are not supported."
> "This prohibition encompasses consuming, manipulating, extracting, or persisting the metadata and content"
> "The embed HTML contains a reference to the Instagram embed.js JavaScript library."
> Meta oEmbed Read: "Requires App Review." "This permission or feature is only available with business verification."
> "If your Instagram account is public, anyone can embed your posts, reels, guides, or profile directly on their website, blog, or news article."
> "The embed code will now be copied to your clipboard and can be pasted into your HTML editor."

Decided: the API route needs a Meta app with business verification and App
Review, which only Lawal can obtain (Law 10, IMPOSSIBLE for a machine). The
help centre's own embed, which anyone may use for a public post, needs no app.
Either way nothing from the post is stored: only the post's address. Which
route: question 6. Access to the API with no token answered once on test
(HTTP 200) but Meta does not document it, so it is UNSOURCED and not relied on.

**ABS, Census 2021 Urban Centres and Localities**, read through the ABS Data
API dataflow `C21_G01_UCL` because QuickStats answered 503 ("We'll be back
online on 22 October 2026"). Melbourne 4,585,537, Geelong 180,239, Ballarat
105,348, Bendigo 100,649: each matches ruling a exactly, on the Urban Centre
geography (the Significant Urban Area figures differ). No other Victorian
Urban Centre is over 100,000; the next is Melton at 76,346. QuickStats is to
be re-read and quoted after 22 October.

**Spam Act 2003**, https://www.legislation.gov.au/C2004A01214/latest/text
(compilation dated 10 March 2016), and ACMA,
https://www.acma.gov.au/avoid-sending-spam ("Last updated: 29 November 2024").

> Schedule 2, clause 4(1): "the consent of the relevant electronic account-holder may not be inferred from the mere fact that the relevant electronic address has been published."
> Schedule 1, clause 2: "the message consists of no more than factual information (with or without directly-related comment)"
> ACMA: "You cannot send an electronic message to ask for consent, because this is a marketing message."

Decided: the claim code email goes only because the claimant asked for it, and
says only what happened: who asked, the code, and "if this was not you,
ignore this email". It invites nothing and promotes nothing, so it is never
the consent request ACMA forbids. The first contact with a venue stays the
Instagram tag Lawal ruled, never an email. (The text of the law, read; not
legal advice.)

## 4. What the code holds today

Read from source in this worktree on 21 October 2026.

- `public.venues` (baseline): `organisation_id NOT NULL`, name, address, city,
  state, postcode, latitude, longitude, `image_url`, `is_active`. No slug: the
  route `/venues/[handle]` resolves a slug made from the name
  (`src/lib/venues/resolver.ts`), so two venues with one name collide. Anon and
  authenticated read it through a COLUMN grant list
  (`20260818000001_column_lockdown_stage1_no_policy_dependency.sql`), so every
  new public column must be added to that list or the public client cannot see it.
- `/venues/[handle]` exists with a hero, address, directions, upcoming and past
  events, organisers, similar venues, accessibility and an ItemList (never Event
  markup on a list page: SEO1 v2, fault three, in the page's own comment).
- `public.cities` (`20260507000001_city_taxonomy.sql`) holds Melbourne, Geelong,
  Ballarat and Bendigo already, anon readable, with no timezone column. Its
  `population` values (Melbourne 5,078,000, Geelong 290,000, Ballarat 109,000,
  Bendigo 100,000) are not the ABS Urban Centre figures ruling a cites (section
  3 confirms those). Reported, not changed: the guide list is set by the
  ruling, not computed from that column.
- `events`: `organisation_id NOT NULL`, `start_date` and `end_date NOT NULL` with
  `end_date > start_date`, `venue_id`, `city_primary`, `category_id`,
  `age_restriction_min`, `parent_event_id`, `is_recurring`, `recurrence_rule`
  (the organiser form offers only `FREQ=DAILY|WEEKLY|MONTHLY` and nothing
  expands or renders it), `external_ticket_url`, and from WI1 `entry_mode` and
  `listing_source`.
- WI1 gives each occurrence its page, Remind me, calendar, share, follow, the
  free structured data, the numbers (`readWalkInNumbers`: views, Remind me,
  calendar adds, shares, follows), and `eventlinqsListingProblems` for words
  EventLinqs writes.
- `/this-weekend` and `src/lib/events/weekend-surface.ts` are the pattern a
  week page inherits: one module owns the window, the page, the sitemap and the
  indexing rule (`discoveryIndexingFor`).
- `event_categories` holds 17 live slugs. EventLinqs' own category images are
  the licensed spine's `categories` slots (`src/lib/images/spine.ts`), not the
  Pexels pipeline in `category-photo.ts`, which is not our own set. One live
  category slug still carries the banned word (the arts one); reported, not
  WI2's to change.
- `follows` takes artists and scenes; organisers are followed through
  `saved_organisers`. There is no venue follow.

## 5. Schema: one migration for Part 1, one for Part 3, each with its grants

Both follow the grant rule: every new public table revokes all from anon,
authenticated and service_role, then grants exactly what its policies serve.
Every write from a signed in person goes through a server action that proves
authority first and then writes with the service role, exactly as WI1 does, so
no new table grants a write to anon or authenticated.

**Part 1, `<date>000010_city_guide_listings.sql`**

1. `cities`: add `free_guide boolean not null default false` and
   `timezone text not null`, backfilled from `state` (VIC Australia/Melbourne,
   NSW and ACT Australia/Sydney, QLD Australia/Brisbane, SA Australia/Adelaide,
   WA Australia/Perth, TAS Australia/Hobart, NT Australia/Darwin). Set
   `free_guide` on melbourne, geelong, ballarat and bendigo. Adding a city or a
   state is then a row.
2. `venues`: add `slug` (unique where not null), `suburb`, `city_slug`
   (references cities), `website_url`, `instagram_handle` (WI1's link-safe
   check), `published_email`, `listing_source` (`organiser` default, or
   `eventlinqs`), `claimed_at`, `removed_at`. Extend the anon and authenticated
   column grants with slug, suburb, city_slug, website_url, instagram_handle,
   listing_source, claimed_at. `published_email` and `removed_at` stay service
   role only.
3. New `event_series`: what a host runs, stored once with its rule. `venue_id`,
   `organisation_id` (follows the venue on claim), `name`, `category_id`,
   `rule` (`once`, `weekly`, `fortnightly`, `monthly:1..4|last`, checked),
   `anchor_date`, `day` (checked against the anchor), `starts_at time`,
   `ends_at time` (null only if question 1 says so), `timezone`,
   `age_restriction_min` (null, 0, 16 or 18), `summary`, `instagram_post_url`
   (checked shape), `skip_dates date[]`, `listing_source`, `status` (`active`,
   `paused`, `removed`), `last_checked_at`, unique (venue, name, rule, anchor).
   A one-off is a series of one, so every EventLinqs listing has one home for
   its source, its last check and its removal.
   RLS: anon and authenticated SELECT where `status = 'active'`. Grants: anon
   SELECT, authenticated SELECT, service_role SELECT, INSERT, UPDATE, DELETE.
4. New `listing_checks`, append-only history: `series_id`, `checked_at`,
   `source_url`, `source_date`, `import_file`, `outcome` (`confirmed`,
   `changed`, `removed`). A trigger keeps `event_series.last_checked_at` and the
   series' events' `listing_fresh_until` (item 5) in step, so the 21-day rule
   reads one source. RLS on, no policy. Grants: service_role SELECT, INSERT.
5. `events`: add `series_id` (references event_series, on delete set null),
   `occurrence_date`, unique (series_id, occurrence_date), a check that both
   are null or both set, and `listing_fresh_until timestamptz` (null for
   everything not listed by EventLinqs).

Migration post-condition (as WI1's): the file raises if any new table lacks its
exact grants or RLS. Proved on TEST by `replay-under-new-default.mjs`, red (no
grants: anon and authenticated refused) then green, then the database proof.

**Part 3, `<date>000010_venue_claims.sql`**

6. New `venue_claims`: venue, claimant user, name, role, email used, method
   (`published_email`, `domain_email`, `manual`), code hash, expiry, attempts,
   status, target organisation, verified time. RLS on, no policy. Grants:
   service_role SELECT, INSERT, UPDATE.
7. New `removal_requests`: venue or series, requester name and email, reason,
   status (`open`, `actioned`, `declined`), times, note. RLS on, no policy.
   Grants: service_role SELECT, INSERT, UPDATE.

Both hold personal information, so Part 3 rides a new dated privacy version
(operating rule 6), approved by Lawal before Part 3 reaches production.

## 6. The import (Part 1)

`scripts/ops/import-city-listings.mjs "<file.csv>"`. Dry run by default: it
prints every row's verdict and writes nothing. `--apply` asks for APPLY, writes,
logs to `C:\dev\PRODUCTION-WRITES.txt` and re-reads what it wrote. It never
edits the file, never invents a value, and refuses a whole file whose header
differs from the one below. Re-importing a row with a newer `source_date`
records a fresh check; re-importing the same file changes nothing. On TEST I run
it; every production run waits for Lawal's yes to that run.

**The columns (fixed by this plan; to be told to Lawal).** The project
manager's three files in `C:\dev\design\listings` already carry 19 of them in
this order. Three are new: `city`, `frequency`, `instagram_post`, and one is
optional: `venue_email`.

| Column | Required | Accepted values |
|---|---|---|
| city | yes | a slug from `cities` with `free_guide` on: melbourne, geelong, ballarat, bendigo |
| date | yes | `YYYY-MM-DD`. For `once`, the date. For a repeating night, the first date the source confirms |
| day | yes | Mon to Sun, and must be `date`'s weekday |
| start | yes | `7pm` or `7:30pm` form, as the files write it now |
| finish | see question 1 | same form; earlier than start means past midnight |
| frequency | yes | `once`, `weekly`, `fortnightly`, `monthly-1st`, `monthly-2nd`, `monthly-3rd`, `monthly-4th`, `monthly-last` |
| name | yes | the night's own name, 80 characters at most |
| host | yes | who runs it, whose page it is: "Hosted by [host]" |
| address | yes | street address |
| suburb | yes | suburb or town |
| category | yes | one of the 17 live `event_categories` slugs (`--categories` prints them) |
| entry | yes | `free`: walk in, nothing to book or register. Anything else is refused (questions 2 and 5) |
| age_limit | no | blank (not stated), `all ages`, `16+`, `18+`. Audience lines ("children aged 0 to 5") belong in what_happens |
| what_happens | yes | one line in EventLinqs' words, judged by `eventlinqsListingProblems`: no ticket or book word, no dollar sign |
| website | no | the host's own `https://` address |
| instagram | no | the host's handle, no @ |
| instagram_post | no | the `https://www.instagram.com/p/...` or `/reel/...` address of a public post about this night, for the official embed (Part 3) |
| venue_email | no | the host's email exactly as published on its own site; the claim code goes there |
| facebook | no | kept in the file, not imported |
| source_url | yes | the page that confirms the night |
| source_date | yes | `YYYY-MM-DD`, the day we confirmed it against that page; never in the future, never older than 21 days |
| freshness | yes | only `CURRENT` imports; any other value is refused as not confirmed |
| notes | no | the project manager's own, never imported |

**What else it refuses.** A row whose name or what_happens is opening hours, a
happy hour, a special or a discount (Google: "Don't mark business hours as
events", "Don't mark coupons or vouchers as events"), caught by a short word
list ("happy hour", "% off", "open from") and named in the report. The project
manager's own check remains the judge; the list only stops the plain cases.

**What the import makes from one row.** It finds or makes the host's venue
(matched on name and address, owned by the EventLinqs listings organisation
until claimed), makes or updates one `event_series`, records one
`listing_checks` row, and runs the occurrence generator for that series.

**What the three current files would do under these columns**, counted on
21 October from the files as they stand (not edited): Melbourne 43 rows, of
which 21 are free, CURRENT, with a start time and no booking word; Ballarat 35,
of which 22; Bendigo 29, of which 16. The rest need a booking or registration
(13, 12 and 13), are not CURRENT (2, 1, 1), lack a start (3, 0, 0), name a price
or donation (3, 0, 0), or carry a ticket, book or dollar word in what_happens
(3, 0, 1). Every file also lacks the three new columns. These files cover 22 to
28 October, and WI2's import cannot exist before WI1 is finished, so they will
have passed: the first file that can go live is the one for the week the import
lands, and the repeating nights (the Geelong nights file, once checked) are the
lasting content.

## 7. The occurrence generator (Part 1)

One pure function, `nextOccurrences(series, from, count = 8)`, tested on every
rule, every skip date, a Daylight Saving change in each direction (dates
taken from the IANA zone the series carries, never typed), and nights past
midnight. A daily cron (and a call after every import
or edit) makes sure each active series has an event row for each of its next 8
dates: walk-in entry, free, the series' venue, category, age limit and words,
one guide day with its hours, status published, through the same WI1 publish
gate an organiser's walk-in event passes (never around it). It updates future
occurrences when the series changes, never touches a past one, and takes a
skipped or removed date off sale through `docs/EVENT-LIFECYCLE.md` (cancelled
when anyone asked to be reminded, deleted when nobody has). No person ever
types a row per date.

## 8. Part 2: `/free/<city>/this-week`

Inherits `/this-weekend`: one module (`week-surface.ts`) owns the window (today
and the next 6 days in the city's own timezone), the events, the count, the
sitemap entry and `discoveryIndexingFor`. Events: free events dated in the
window in that city (which free events: question 3), grouped by day, a category
filter whose filtered views canonicalise to the page, share (counted as WI1
counts it) and save (the existing save button on each card). Each occurrence's
own page carries its Event markup (WI1); the city page carries an ItemList of
those pages, the venue page's rule. Its share card is rendered from the page's
own events by the same renderer the Launch Kit uses for its story and square
cards (Law 6). Every guide city gets it from its row; Melbourne, Geelong,
Ballarat and Bendigo on day one.

## 9. Part 3: venue pages, photos, the claim, removal

- **The venue page** extends `/venues/[handle]`: its regular nights, each with
  its rule in words ("Every Wednesday, 7pm to 10pm"), its next 8 dates as links,
  and "Last checked 18 October"; links to the host's website and Instagram; the
  existing map and directions. On an unclaimed venue: "Hosted by [venue]. Listed
  by EventLinqs from public information. Is this your venue? Claim it free." and
  "Request removal". The listings organisation is never shown anywhere: on an
  EventLinqs listing the host takes the organiser's place, and that
  organisation's own page answers 404.
- **Photos.** An unclaimed listing shows Instagram's own embed of the post in
  `instagram_post` when there is one (the route is question 6), and otherwise
  the spine image for its category. Only the post's address is stored, never
  the post, its picture or the embed response (Meta: "persisting the metadata
  and content" is prohibited). The embed loads only as its box nears the
  screen, so Instagram's script never sits in the LCP window, and the content
  security policy gains Instagram's script and frame origins for that one
  component. Instagram's script is a third party on the page, so the Part 3
  privacy version names it. A claimed venue uploads its own photos through the
  existing upload pipeline.
- **The claim**, `/venues/[handle]/claim`, signed in: name and role, then a
  6-digit code (15 minutes, 5 tries, a rate-limit policy in `policies.ts`) sent
  to the venue's published email on record, or to an address at the venue
  website's own domain. The email holds only who asked, the code, and "if this
  was not you, ignore this email": no invitation, no promotion (section 3,
  Spam Act). With neither address, "Ask us to check" files a manual claim for
  Lawal. A venue someone has already claimed shows "Request access" instead,
  which emails its owner, who has 3 days to answer before it goes to Lawal
  (Google's own window). The code's 15 minutes is our choice, not a market
  figure. On a correct code the venue, its series and their future occurrences
  move to the claimant's organisation (made for them if they have none), the
  series' words become theirs (`listing_source` organiser), and the venue shows
  the Founding Venue badge. The badge is a mark only; the fee offer stays in its
  one module (`offer-is-one-rule`), restated nowhere.
- **Their numbers**: views, Remind me, calendar adds, shares and follows, summed
  over the venue's occurrences from `readWalkInNumbers`.
- **Removal.** The claimed owner's one button stops every series and takes
  future dates down through the lifecycle law. Anyone's "Request removal" files a
  `removal_requests` row and emails Lawal at once; he actions it the same day
  with one command (section 11).

## 10. The guard and its drills

`scripts/guards/listed-hosts-show-their-source.mjs`, registered and blocking.
Everything an EventLinqs listing renders lives in `src/components/listings/`,
and the guard fails when:

1. a file there renders an image other than `InstagramEmbed` or the spine
   category image component;
2. the unclaimed venue page or an unclaimed occurrence page renders without
   `ListingProvenance` (which holds the exact line and the removal link), or that
   component loses the line or the link;
3. any guide or discovery read of events skips the freshness predicate
   (`listing_fresh_until`) in `public-visibility.ts`.

A drill for every occurrence each rule asserts (red then green), and a TEST
proof that a series checked 22 days ago appears on no guide page.

## 11. Verification stated before code, and Law 10 verdicts

Each part: typecheck, lint, the full suite, every guard, the drills; the import
dry run then apply on TEST against the project manager's file; the generator on
TEST; the drive at 390, 768 and 1440 (a venue page, a weekly night's next
occurrence, the claim end to end with a test venue, a removal, every guide
city's page); axe 0; the link crawler 0 non-200; the affordance scan; benchmark
verdicts against the competitor captures; Lighthouse on the Vercel preview.

| Step | Verdict |
|---|---|
| Production migrations (two) | RESERVED, Lawal: `npm run migrate:production` |
| Production import, each file | SCRIPTED, waits for Lawal's yes: `node scripts/ops/import-city-listings.mjs "<file>" --apply`, APPLY typed, logged |
| Removal request actioned | SCRIPTED: `node scripts/ops/action-removal.mjs <request id> --apply` |
| Manual claim approved | SCRIPTED: `node scripts/ops/approve-venue-claim.mjs <claim id> --apply` |
| The Meta app for the oEmbed API (only if question 6 picks it) | IMPOSSIBLE for a machine: business verification and App Review sit in Lawal's Meta account. The token's environment entry, health check and expiry record are scripted |
| Part 3 privacy version | RESERVED, Lawal approves the wording |

## 12. Questions, in full

1. **A night with no finish time.** 11 of 43 Melbourne rows, 7 of 35 Ballarat,
   1 of 29 Bendigo and 41 of 74 Geelong rows give none, and an event row must
   end after it starts. (a) The import refuses such a row until a finish is
   found. (b) The page says "From 6:30pm", the structured data carries no end
   time, and the event counts as ended at the end of that day for its own state,
   never shown. (b) changes one WI1 module (a guide day's closing time becomes
   optional). Recommended: (b).
2. **A free event that needs a booking, registration or RSVP elsewhere**
   (TryBooking, Humanitix, Meetup, Eventbrite, "booking required"): 38 rows
   across the three files. A walk-in page promises no ticket, so these are not
   walk-in. Recommended: the WI2 import refuses them, and WI3 (external events)
   decides how they are listed.
3. **What fills `/free/<city>/this-week`:** walk-in events only, or also
   organiser events whose every ticket is free (a free ticket still needed)?
   Recommended: both, each labelled as it is: "Free entry, no ticket needed"
   or "Free, ticket needed".
4. **Which towns belong to each city's page.** The Geelong file includes
   Torquay, Barwon Heads, Ocean Grove, Anglesea and Aireys Inlet, outside
   Greater Geelong. Recommended: the `city` column decides each row, set by the
   project manager.
5. **Donations.** "Gold coin donation" and "pay as you feel": refuse in WI2, or
   add a fourth entry phrase such as "Free entry, donations welcome"?
   Recommended: refuse until ruled.
6. **Which Instagram embed.** (a) Meta's oEmbed API: needs a Meta app with
   business verification and App Review in Lawal's account, then a token we
   keep and health-check. (b) Instagram's own embed, which its help centre says
   anyone may use for a public post: no app, no token, the same embed script.
   Both credit and link the post by themselves. Recommended: (b) now, and (a)
   only if Meta's own embed ever stops working without it.
7. **Listing regular nights at all.** What's On excludes "a venue's regular
   activities" (https://whatson.melbourne.vic.gov.au/pages/faq.json); Google
   (https://developers.google.com/search/docs/appearance/structured-data/event)
   and Eventfinda (https://www.eventfinda.com.au/venue/the-motley-bauhaus-melbourne2)
   list them, as section 3 quotes. Lawal's 12:11 ruling decides
   this already; it is recorded here so the difference is a choice on record,
   not an oversight. No answer needed unless Lawal wants to change it.

## 13. Reversal

As WI2-ITEM.md: if 30 days after the Geelong guide goes live fewer than 3 of the
first 15 venues have claimed, the claim wording and the Instagram first-contact
post are redrawn three ways before anything else changes. Any venue's objection
removes it the same day.
