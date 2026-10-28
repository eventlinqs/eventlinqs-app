# Item 19: the weekly collection run, with its source register (window 3, 27 October 2026)

The foundation (START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md, locked 27 October 2026): "A source register, each
source with its page, how often it changes and when it was last checked" (item 4's register) and "Weekly collection run
that only reads sources whose terms allow it; everything reviewed before publishing" (item 19). Done when: "One run
lands new events for review." Its danger row: "Read only sources whose terms allow it; ask the rest to submit or claim."

Governing laws (CLAUDE.md Law 0): Definition of Done, Law 7 (sources read and quoted), Law 5 (no dead links), the 21
October grant rule, Law 8.

## Sources (Law 7), read 27 October 2026

- RFC 9309, https://www.rfc-editor.org/rfc/rfc9309.html: "Crawlers MUST use case-insensitive matching to find the group
  that matches the product token"; "If no matching group exists, crawlers MUST obey the group with a user-agent line with
  the "*" value"; "The most specific match found MUST be used."; "If an "allow" rule and a "disallow" rule are
  equivalent, then the "allow" rule SHOULD be used."; on a 4xx "the crawler MAY access any resources on the server"; on a
  5xx "the crawler MUST assume complete disallow"; "*" "Designates 0 or more instances of any character", "$"
  "Designates the end of the match pattern". It says nothing of 429: we read a 429 as disallowed (its 4xx rule only
  permits).
- Google, https://developers.google.com/search/docs/appearance/structured-data/event (updated 2026-09-08): the Event
  data a site publishes, offers' url, price "including service charges and fees", availability InStock, SoldOut,
  PreOrder. This is the only part of a page the run reads.
- schema.org, https://schema.org/Event: Event and its more specific types (MusicEvent, ComedyEvent, TheaterEvent,
  Festival and the rest), all read as events.
- ATDW, https://www.atdw.com.au/distributors/: "more than 50,000 quality-assured business and event profiles", "Access
  rich Australian tourism content with one API", "Start with a free 30-day trial," then "Choose the plan that fits your
  content strategy." A paid plan: a founder step, not built around.

## Decided three ways, criteria first

Criteria: (1) nothing is read that a source's terms or robots.txt do not allow; (2) nothing is published without a
person's yes; (3) a second source adds a link, never a card (the 12:30 (1)); (4) one source failing never stops the
rest; (5) staff only, granted by the 21 October rule.

A. A register table, a candidates table, a weekly cron reading each permitted page's own Event data, and an admin
   review screen. Meets 1 to 5. Chosen.
B. The run writes a checked file for the import, reviewed by reading it. Loses on 2 in practice: a file has no record
   of who reviewed what, and refused finds come back every week.
C. Candidates as draft events. Loses on 5 and on the lifecycle: drafts are the organiser's editor's, and a curated
   draft would reach organiser surfaces.

## Built

- `supabase/migrations/20261027140001_listing_sources_and_candidates.sql`: `listing_sources` (the register; a source is
  'read' only with its terms' address, the line quoted and the day read, which the database holds) and
  `listing_candidates` (waiting, accepted or refused; a refusal says why; a review carries its moment). Staff only.
- `src/lib/listings/collect.ts`: robots.txt by RFC 9309, the page's own Event data, the register's pace, and the plan
  (WI3's `sameEvent`: a second source adds a link).
- `src/lib/listings/collect-run.ts` and `collect-store.ts`: one run, robots.txt before the page, one page per source,
  each outcome on the source's row, a budget inside Vercel's 300 seconds.
- `src/app/api/cron/collection-run`: daily from the engine plan of 28 October 2026, 19:00 UTC (6 am in Melbourne in
  daylight time); each source is still read only on its own pace (daily, weekly, monthly or rarely).
- `/admin/collected`: what waits, each Accept or Refuse with a reason, and the register with each source's last
  outcome. Accepting an `adds_links` find writes its links to the event as curated links (WI3); accepting a new
  listing marks it for the import, which publishes every listing.

## Proved

- `tests/unit/listings/collect.test.ts` and `collect-run.test.ts`, 16 of 16; three planted faults (a 5xx read as
  allowed, an equal allow losing, a second source landing as its own card) each turned them red, and the file was put
  back byte for byte.
- `scripts/verify/collection-run-drive.mts` on TEST, with the pages served by a stand in: "DRIVE PASSED", 10 checks
  (robots.txt first, the 'ask' source never fetched, two events land waiting, the Humanitix link and price kept, the
  source's outcome written, a second run lands nothing and keeps the review, the database's refusals, every row
  removed).

## What the real sources showed (scripts/verify/collection-probe.mts, read only, 27 October 2026)

Of twelve pages probed with the run's own agent and rules (What's On Melbourne, Visit Geelong Bellarine, Bendigo's
council events, The Barwon Club, Corner Hotel, Northcote Social Club, Forum Melbourne, The Capital Bendigo, and four
gig pages of theirs), none publishes Event data in its page as served: the tourism boards build their lists in the
browser, and the venues' gig pages carry a breadcrumb at most. Three robots.txt files did not answer (The Toff in Town,
Her Majesty's Ballarat, GPAC), so the run reads nothing there; Visit Ballarat answered 429 behind a bot check.

So the run is right and the register is the work: each source is entered after its terms are read and quoted, and the
sources that publish Event data (ticketing pages publish it for Google, but their terms are read first) are where it
lands events. The licensed feed for Victoria's tourism boards is ATDW, a paid plan: Lawal's step.

## Open, each named

- The register's rows: entered one by one with their terms quoted (window 4's import names its sources as it goes).
- The review screen is not driven at 390, 768 and 1440: the admin harness needs a session with Lawal's 2FA
  (tests/admin-proof/README.md); `/admin/collected` is added to its surfaces so the next capture includes it.
- ATDW: a founder step (a plan and a key).

Reversal condition: if a source's robots.txt or terms change against reading, its row is set to 'ask' and the next run
reads nothing there; if a week's refusals for one source pass half of what it landed, its row is reviewed.

## The register's fields and the licensed run (28 October 2026, the release checklist's D2 to D5 and item 19)

The checklist (START-16OCT/EVENTLINQS-RELEASE-CHECKLIST-28OCT.md): D2 "Five separate permission answers per source", D3
"listing_sources holds all eight", D4 "facts-only means the image stays blank, never copied", D5 "Acquisition order:
1 organiser submissions, 2 licensed datasets and feeds, 3 venue partnerships, 4 manual editorial discovery".

- `supabase/migrations/20261028140001_listing_sources_register_fields.sql`: `source_type` and the computed
  `acquisition_order`; five answers (`may_scrape`, `may_use_dataset`, `may_subscribe`, `may_redistribute_facts`,
  `may_reuse_media`), each yes, no or unknown, a yes or a no with its own quote, address and day; `permits_facts`,
  `permits_descriptions`, `permits_images`, `permits_links`; `verification` and `verified_on`; `last_success_at`;
  `licence_owner` and `contact`. A source is 'read' only where scraping, a feed or a dataset is answered yes, its facts
  are not forbidden and it is verified. Images and descriptions only where media reuse is yes. A trigger refuses a
  candidate carrying an image, a description or a link its source does not permit. A row that was 'read' with no
  answer is set to 'ask' with a note.
- The run (`src/lib/listings/collect-run.ts`) lands only what the source permits (`withPermittedContent`), writes
  `last_success_at` only when a read succeeds, and gives each fetch 30 seconds (Bendigo Pride Festival's feed took
  7.3 to 12.6 s). A feed's venue is the part of LOCATION before a spaced hyphen (Geelong Regional Libraries writes a
  room after it), and an event with no URL of its own is told apart by its UID.
- `/admin/collected` shows the acquisition order with a count per path, and each source's type, five answers, what we
  may use, verification, last successful collection (stale past twice its pace) and owner.
- The four licensed feeds, each answer quoted and dated: `docs/walk-in/collection-sources-28oct.json`, registered and
  run on TEST by `scripts/verify/collection-licensed-run.mts` (`--dry-run` writes nothing; TEST only without
  `--production`). The database's rules on TEST: `scripts/verify/listing-sources-register-proof.sql`, rolled back.

Venue partnership asks (D7), drafts for Lawal only: C:\dev\EVIDENCE\COLLECT-28OCT\venue-asks.md.

## The horizon, the run log and the exception queue (engine plan parts A and E, window 4, 28 October 2026)

- `supabase/migrations/20261028204001_supply_horizon_and_exceptions.sql`: a daily pace; `listing_source_runs` (one
  row per source per run, insert only); `organisation_id` and `venue_id` on a source (a partner's own feed);
  `changes_facts`, `confidence`, `reasons` and `decided_by` on a candidate, the partner rule held by the database;
  `public.listing_horizon`.
- `src/lib/listings/horizon.ts`: publish 0 to 14 days, acquire 15 to 45, relationships 46 to 90, in Melbourne
  calendar days, computed and never stored. `horizon-twin-on-test.mjs` holds the SQL copy to it on 200 nights.
- `src/lib/listings/judge.ts`: high confidence only when nothing needs a person; every reason stated. A changed time
  or venue on a listed night is `changes_facts`, never a second card and never accepted by rule.
- The partner rule (`collect-run.ts`): a high confidence new night or added link from a partner's own verified feed
  (an organiser submission or venue partnership source naming a real organiser or a claimed venue) is accepted
  without a person; everything else waits on `/admin/collected`, which shows the horizon, why each row waits, and
  each source's last five runs, flagged after three failures in a row. `collect-accept.ts` is the one link writer.
- Councils (`council-sources-28oct.json`, read 28 October 2026, research in `C:\dev\EVIDENCE\SUPPLY-28OCT`): every
  council and regional tourism what's on page is registered as ASK, never read. Melbourne
  (https://whatson.melbourne.vic.gov.au/disclaimer: "no part may be reproduced or reused for any commercial purposes
  whatsoever") and Geelong
  (https://www.geelongcity.vic.gov.au/council/council-and-organisation/using-website/terms-and-conditions: "No part of
  any such content may be reproduced, modified, adapted, published or used in any way for any commercial purpose
  whatsoever") forbid it; Ballarat, Bendigo and the tourism boards are silent, and silence is never read as yes. None
  publishes an events feed or dataset.
- Proved: `horizon.test.ts`, `judge.test.ts`, the run tests (drilled red with the rule off and the partner check off),
  `supply-horizon-proof.sql` on TEST rolled back (run 1 found a NULL hole in a CHECK, fixed; run 2 PASSED, 21 checks).
