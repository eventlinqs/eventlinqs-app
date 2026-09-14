-- ACCESSIBILITY: the fields an organiser and a venue can fill, so the page can
-- say what a disabled person needs to know before they buy.
--
-- ============================================================================
-- WHY (close-out SEO5, step 4)
-- ============================================================================
--
-- The owner's instruction: "Add an accessibility section to the event page and
-- the venue page, populated from fields the organiser and venue can fill, and
-- show it only when filled. A blank section is worse than none."
--
-- Queried on TEST on 14 September 2026 before a line of this was written:
-- public.events and public.venues carry NO column matching %access%,
-- %wheelchair%, %companion% or %auslan%. Zero rows. So there was nothing to
-- show and nothing for an organiser to fill in, and the audit's finding that
-- neither page carries accessibility information was correct at the root rather
-- than at the template.
--
-- ============================================================================
-- WHERE THE FIELD LIST COMES FROM. IT IS NOT A GUESS AND IT IS NOT GENERIC.
-- ============================================================================
--
-- Law 3 (Australia-smart) and Law 7 (research before recommending). Two
-- Australian primary sources were read on 14 September 2026 and every column
-- below traces to one of them or to the thing they both assume:
--
--   AFL, "Accessible Ticketing" (https://www.afl.com.au/tickets/accessible-ticketing)
--     "Wheelchair bay tickets for wheelchair users who will remain in their
--      wheelchair (or mobility aid) during the match."        -> wheelchair_accessible
--     "Easy access seating is typically up or down a few steps
--      and/or at the end of an aisle."                        -> step_free_access
--     "We welcome visitors with trained or accredited
--      assistance animals (such as guide dogs)."              -> assistance_animals_welcome
--     "The AFL is a National Affiliate of the Companion Card
--      program and we agree to provide an admission ticket for
--      the cardholder's companion at no charge."              -> companion_card_accepted
--
--   ICC Sydney, "Accessibility and inclusion for visitors, live events"
--   (https://iccsydney.com.au/about/venue-information/accessibility-and-inclusion-for-visitors/live-events/)
--     "Accessible Seating Areas"                              -> wheelchair_accessible
--     "Quiet Rooms ... low-stimulation spaces for guests
--      experiencing overwhelm or sensory sensitivity"         -> quiet_space
--     "Companion Card Tickets"                                -> companion_card_accepted
--     a published accessibility phone number (1300 665 915)   -> accessibility_contact
--
-- THE COMPANION CARD IS THE AUSTRALIAN ONE. It is a state and territory scheme
-- accepted by affiliated businesses, which is exactly why it must be a FIELD
-- and not an assumption: an organiser is an affiliate or they are not, and a
-- cardholder needs to know which before they book. No overseas ticketing
-- platform models it, and that is a small, real, Australia-smart edge.
--
-- THE REMAINING FOUR are the facilities both sources assume a venue either has
-- or does not, and which a person planning a night out asks about first:
-- accessible_toilets, accessible_parking, hearing_loop, and (event-only)
-- auslan_interpreted and audio_described.
--
-- ============================================================================
-- WHY EVENT-LEVEL AND VENUE-LEVEL ARE DIFFERENT SETS
-- ============================================================================
--
-- A venue's ramp is a property of the building. An Auslan interpreter is a
-- property of one performance. So the physical facilities are on BOTH tables
-- (public.events carries a free-text venue_name/venue_address and a NULLABLE
-- venue_id, so a large share of events have no venue row to inherit from), and
-- the per-performance services (auslan_interpreted, audio_described) are on
-- events alone, because a building cannot be interpreted.
--
-- NOTHING INHERITS. The event page shows the EVENT's fields and the venue page
-- shows the VENUE's. Silently presenting a venue's ramp as an event's promise
-- would be the platform making a claim no organiser made, which is the failure
-- mode this whole item exists to avoid.
--
-- ============================================================================
-- WHY `false` IS SAFE AS A DEFAULT, AND THE RULE THAT MAKES IT SAFE
-- ============================================================================
--
-- `false` here means NOT STATED, not "no". Those are different claims and the
-- difference matters: telling a wheelchair user a venue is not accessible when
-- nobody was ever asked is worse than saying nothing.
--
-- So the rendering rule, enforced in code and by a registered guard, is that
-- the section renders ONLY the true values and NEVER a negative, and renders
-- nothing at all when every value is false and both text fields are empty.
-- That is the owner's "show it only when filled", and it is why a NOT NULL
-- DEFAULT false is the right column rather than a three-state nullable boolean:
-- the third state and the false state are displayed identically, so encoding
-- them separately would buy nothing and invite somebody to display it.
--
-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
--
-- It adds no index. Nothing filters or sorts by these columns today; the event
-- page reads one row by id and the venue page reads one row by id. An index
-- added "for later" on eleven boolean columns is eleven structures to maintain
-- on every write for a query nobody makes. When a future "accessible events"
-- filter lands it brings its own index and its own measurement.
--
-- It changes no RLS policy. Both tables already have policies that decide who
-- may read a row, and an accessibility column is public information on a public
-- page: it belongs to the row it describes and inherits that row's visibility
-- exactly.

-- ---------------------------------------------------------------------------
-- EVENTS
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists wheelchair_accessible       boolean not null default false,
  add column if not exists step_free_access            boolean not null default false,
  add column if not exists accessible_toilets          boolean not null default false,
  add column if not exists accessible_parking          boolean not null default false,
  add column if not exists hearing_loop                boolean not null default false,
  add column if not exists quiet_space                 boolean not null default false,
  add column if not exists assistance_animals_welcome  boolean not null default false,
  add column if not exists companion_card_accepted     boolean not null default false,
  add column if not exists auslan_interpreted          boolean not null default false,
  add column if not exists audio_described             boolean not null default false,
  add column if not exists accessibility_notes         text,
  add column if not exists accessibility_contact       text;

comment on column public.events.companion_card_accepted is
  'The organiser is an affiliate of the Australian Companion Card scheme for this event and admits the cardholder''s companion at no charge. Rendered on the event page only when true; false means NOT STATED and is never rendered as a negative.';
comment on column public.events.accessibility_notes is
  'Free text the organiser writes for attendees with access needs. Rendered verbatim on the event page when non-empty.';
comment on column public.events.accessibility_contact is
  'A phone number or email an attendee with access needs can use to reach the organiser before booking.';

-- ---------------------------------------------------------------------------
-- VENUES
-- ---------------------------------------------------------------------------
alter table public.venues
  add column if not exists wheelchair_accessible       boolean not null default false,
  add column if not exists step_free_access            boolean not null default false,
  add column if not exists accessible_toilets          boolean not null default false,
  add column if not exists accessible_parking          boolean not null default false,
  add column if not exists hearing_loop                boolean not null default false,
  add column if not exists quiet_space                 boolean not null default false,
  add column if not exists assistance_animals_welcome  boolean not null default false,
  add column if not exists companion_card_accepted     boolean not null default false,
  add column if not exists accessibility_notes         text,
  add column if not exists accessibility_contact       text;

comment on column public.venues.accessibility_notes is
  'Free text the venue writes about access. Rendered verbatim on the venue page when non-empty. Never inherited by an event: an event states its own.';

-- ---------------------------------------------------------------------------
-- THE TWO TEXT FIELDS ARE BOUNDED, BECAUSE AN UNBOUNDED TEXT FIELD ON A PUBLIC
-- PAGE IS A LAYOUT DEFECT WAITING FOR ITS FIRST ORGANISER.
-- ---------------------------------------------------------------------------
-- 2000 characters is roughly a page of prose, which is more than any of the
-- sources above publishes and enough for a venue with genuinely complicated
-- access. The contact field holds a phone number or an email address; 200 is
-- generous for both and refuses a pasted paragraph.
alter table public.events
  drop constraint if exists events_accessibility_text_bounded;
alter table public.events
  add constraint events_accessibility_text_bounded check (
    (accessibility_notes is null or char_length(accessibility_notes) <= 2000)
    and (accessibility_contact is null or char_length(accessibility_contact) <= 200)
  );

alter table public.venues
  drop constraint if exists venues_accessibility_text_bounded;
alter table public.venues
  add constraint venues_accessibility_text_bounded check (
    (accessibility_notes is null or char_length(accessibility_notes) <= 2000)
    and (accessibility_contact is null or char_length(accessibility_contact) <= 200)
  );

-- ---------------------------------------------------------------------------
-- THE GRANT ON `venues`, WITHOUT WHICH HALF OF THIS MIGRATION IS INVISIBLE.
-- ---------------------------------------------------------------------------
--
-- `public.venues` does NOT carry a table-level SELECT grant for anon. It
-- carries a COLUMN-level grant covering sixteen named columns, deliberately
-- excluding the Stripe and revenue-share columns. A column-level grant does not
-- extend to a column added later, so every column above would have been
-- readable by the service role and by nobody else, and the venue page's access
-- section would have rendered nothing with no error anywhere to explain it.
--
-- FOUND BY DRIVING IT. The event page worked immediately, because `events`
-- carries a TABLE-level grant that expands to all 92 of its columns, and the
-- venue page silently showed no section. The anon read answered
-- `42501 permission denied for table venues`, which the reader swallows by
-- design, so the only symptom was an absent section, which is also what a
-- correctly EMPTY venue looks like.
--
-- This is the same class as migration 20260808000010, which revoked five
-- columns on `organisations` and turned off ticket sales for every paid event
-- on the platform because a guard read two of them. A column privilege model is
-- correct and it is unforgiving: a new column is invisible until it is named.
--
-- `image_url` and the rest stay exactly as they are; this only ADDS.
grant select (
  wheelchair_accessible,
  step_free_access,
  accessible_toilets,
  accessible_parking,
  hearing_loop,
  quiet_space,
  assistance_animals_welcome,
  companion_card_accepted,
  accessibility_notes,
  accessibility_contact
) on public.venues to anon, authenticated;
