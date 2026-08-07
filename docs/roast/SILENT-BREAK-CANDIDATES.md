# What else might be silently broken the same way

Founder question, 8 August 2026, prompted by the 91 percent finding.

**The defect class, stated precisely.** A feature exists, is written correctly,
passes its tests, and can never fire, because something upstream never populates
the thing it selects on. It is invisible to every gate the platform has: types
pass, lint passes, unit tests pass, the route returns 200, the page renders its
designed empty state. Only a query against real data shows it. The digest read
`city_primary`; nothing wrote `city_primary`; 91 percent of the catalogue was
unreachable and no gate said a word.

**These are NAMED, not investigated.** Confidence is stated per item and earned:
CONFIRMED means I read the write side this session and it is absent. CANDIDATE
means the read side is real and the write side is unverified.

---

## CONFIRMED. The write side is absent; I read it.

### 1. Scheduled events never publish

**This is the worst one and it is not a reach defect, it is a product defect.**

`createEvent` and `updateEvent` accept `status: 'scheduled'` and write
`scheduled_publish_at`. The wizard offers it. Nothing anywhere flips a scheduled
event to published: a repository-wide search for `scheduled_publish_at` returns
the wizard, the form, the types, a dev fixture, two docs and the baseline
schema. No cron. `vercel.json` has eleven cron entries and none of them is a
publisher.

An organiser who schedules their event for Friday gets an event that never goes
live, sells nothing, and appears nowhere. They find out on Friday.

**How to check it:** `select count(*), min(scheduled_publish_at) from events
where status = 'scheduled' and scheduled_publish_at < now()`. Any row is an
event that should already be live and is not. Then set one on TEST, put its time
in the past, wait, and see whether anything moves it. I expect nothing does.

### 2. `suburb_primary` is never written

Same migration as `city_primary` (20260507000001), same wizard, same omission:
zero occurrences of `suburb_primary` in the event actions. `/city/[slug]/[suburb]`
selects on it. Every suburb page is therefore empty of organiser-created events,
permanently, and every suburb page resolves 200 to a designed empty state, which
is exactly why nobody noticed.

**How to check it:** the same verifier shape as `city_primary`. Count published
events with a non-null `suburb_primary`, then count how many have a
`venue_address` or `venue_city` that a suburb resolver could claim. The gap is
the defect. Note the fix is NOT the same as `city_primary`: a suburb cannot be
derived from a city name, so it needs either a picker in the wizard or geocoding,
and inventing one from an address is precisely what Law 6's spirit forbids.

### 3. A checkout consent with no city can never receive a digest

`resolveDigestCity` (checkout) falls back to `event.city_primary`. That column
was null for 91 percent of events, so a buyer who ticked the digest box got a
`marketing_consents` row with `city_slug = null`. `fetchDigestCities` filters
`.not('city_slug','is',null)` and `fetchDigestRecipients` filters
`.eq('city_slug', citySlug)`. **Their consent is recorded and they are
unreachable.** Consent captured, promise made, nothing delivered.

The `city_primary` fix stops this happening to new orders and the backfill fixes
the events, but **`marketing_consents` rows already written with a null city stay
orphaned**, because nothing back-fills them. TEST has only two consent rows so it
is invisible there. Production is the number that matters.

**How to check it:** `select count(*) from marketing_consents where status =
'granted' and city_slug is null`, on production. Every one of those is a person
who asked and gets nothing. The repair is a second backfill deriving their city
from the order's event, which is a migration I have not written.

### 4. `is_featured` is never written by the organiser path

Zero occurrences in the event actions. Whatever selects on `is_featured` is
selecting on a column only an admin path can set, which may be intended. Naming
it because it has the same shape and I have not checked the admin side.

**How to check it:** find every reader of `is_featured`, then
`select count(*) from events where is_featured = true`. If readers exist and the
count is zero on production, the surface is dead.

---

## CANDIDATE. The read side is real; the write side is unverified.

### 5. Share-link CONVERSIONS, which is the product's whole differentiator

Views and clicks are proven, in this session's own run. Conversions are not.
A conversion requires the `el_share_code` cookie to survive from `/s/[code]`
through the entire checkout and be read at order creation, and the link's event
must match the order's event. If any leg of that is broken, `share_link_events`
records views and clicks forever and **zero** conversions, and the reach panel
shows clicks with no revenue beside them.

That would be the quietest and most damaging one on this list, because "every
share is measured against real ticket sales" is the single claim the whole
Launch Kit positioning rests on. A panel showing clicks and no sales does not
read as broken. It reads as "your sharing did not work".

**How to check it:** `select kind, count(*) from share_link_events group by
kind` on production and TEST. If `conversion` is zero while `click` is not,
drive one purchase through a tracked link end to end and watch for the row.

### 6. Community pages depend on `events.tags` carrying community slugs

The community landing selects live events with an `or(tagOr)` over
`events.tags`. The wizard does write `tags`. Whether it ever OFFERS the 21
community slugs, or leaves the organiser typing free text, is unverified. If it
does not offer them, every community page's live-events rail is empty by
construction while the code is perfect. The file's own comment records that this
already happened once ("live events carry generic categories, which emptied
every community landing"), which is evidence the failure mode is real here, not
theoretical.

Note this is also an outstanding launch-blocker in CLAUDE.md ("Community into
event creation"), so it may be known-unbuilt rather than silently broken.

**How to check it:** `select count(*) from events where status='published' and
tags && <the 21 community slugs>`. Then open the wizard and look at what the tag
control actually offers.

### 7. Category taxonomy divergence (the predecessor's R1, still open)

`event_categories` has no Comedy row. The homepage offers a `comedy` tile and a
`comedy` rail. Both can never match anything. `arts-community` likewise, against
a table holding `arts-culture`. Confirmed by the predecessor, unfixed, and the
migration is unwritten.

**How to check it:** already checked. It needs the migration, not another check.

### 8. The discovery feed's taste graph

`/feed` reads `src/lib/events/affinity.ts`. What writes the signals it scores
on, and whether anything does, is unverified. A feed with no signal falls back
to something generic, which looks like a working feed.

**How to check it:** find the write side of whatever `affinity.ts` reads, then
count rows on production. Zero rows with a live feed surface is the tell.

### 9. Web push subscribers

`/api/push/subscribe` exists and `dispatch.ts` reads `push_subscriptions`. Web
push is stated as the primary alert channel at about 5x email conversion. If the
browser permission prompt is never surfaced, or is behind a flag that is off,
the table is empty and every push alert silently becomes an email fallback.

**How to check it:** `select count(*) from push_subscriptions` on production,
and load the site as a new visitor to see whether anything ever asks.

### 10. Follows: `saved_organisers` versus the generic follows table

`notify-just-announced` reads `saved_organisers`. My memory of this codebase says
the follow UI writes a generic `follows` table keyed `user_id` /
`followable_type` / `followable_id`. If the button writes one table and the cron
reads the other, following an organiser produces no alerts at all, and it would
look identical to "you have no followers yet".

**How to check it:** read `FollowButton`'s write target, compare it to the cron's
read target. One grep each. If they differ, that is a confirmed break.

### 11. Flags that are off, hiding features that may also be broken

On TEST, `broadcast_digest` was off (now on, per R8), `broadcast_follow` is off,
`community_giving`, `gig_board` and `artist_showcase` are off. A flag that is off
means the code behind it has never run against real data, so any defect of this
class inside it is undiscovered rather than absent. Turning one on is not a
release decision, it is an inspection.

**How to check it:** for each flag, turn it on in TEST only and run the surface
against real data before ever considering production.

### 12. The sitemap, which is the SEO engine

The growth doctrine calls organic search the quiet compounding engine, resting
on city and community intersection pages. If the sitemap enumerates those pages
from a query that filters on a column like `city_primary`, then until today it
was emitting a fraction of the catalogue and Google was told those pages do not
matter. Unverified, and it is the one item on this list where the damage
compounds over months rather than showing up immediately.

**How to check it:** fetch `/sitemap.xml` on production, count the URLs, compare
to the real published-event and intersection-page counts.

---

## What I would actually do about this

Checking these one at a time is how the 91 percent survived: each is invisible
until someone queries real data with the specific question in mind.

**Build the harness, not the twelve checks.** A `reach-integrity` verifier that
takes the pattern directly, one row per feature: what does this feature SELECT
on, how many rows in production actually satisfy it, and what percentage of the
relevant catalogue is that. Every line where a feature's addressable population
is zero, or is a small fraction of what it should be, is a silent break. Run it
in CI against TEST and by hand against production.

That converts "somebody has to remember to ask" into a gate, which is the only
thing that would have caught `city_primary` before you did.

I have not built it. It is not in Parts A to G and I am not starting it without
you saying so. My estimate is 6 to 10 hours for the harness plus the twelve
checks wired into it.

**One thing I would not wait on:** item 1, scheduled events never publishing.
That is an organiser whose event does not happen, and it is not a reach defect.
