-- ============================================================================
-- EXTERNAL TICKETING SUPPORT. Founder ruling, 15 August 2026.
--
-- WHY. The Launch Kit is the magnet, and its job is to reach people who have
-- never heard of EventLinqs. Until now it could only serve an organiser who had
-- ALREADY moved their ticketing here, which made the hook conditional on the
-- conversion it exists to cause. The 450-plus Melbourne Fringe artists six weeks
-- from their season cannot move their ticketing: it is locked inside a
-- centralised festival box office. We were never going to get that ticketing.
-- We can still give them the kit.
--
-- TWO INDEPENDENT CHANGES, because there are two distinct cases.
--
--   1. share_links can point at an EXTERNAL DESTINATION instead of an event.
--      This is the ANONYMOUS DRAFT case: a cold stranger composing a kit has no
--      event row at all, so there is nothing for event_id to reference. The link
--      carries the destination itself and is grouped by the kit draft code, so
--      per-channel click attribution still works with no event in existence.
--
--   2. events can declare that TICKETING IS ELSEWHERE, via external_ticket_url.
--      This is the SIGNED-IN ORGANISER case: a real event row that sells nothing
--      here. The sale gate reads the column and refuses by construction, so the
--      event can never render a checkout surface.
--
-- WHY THE CHECK IS "EXACTLY ONE" RATHER THAN "AT LEAST ONE". A link is either an
-- internal event link or an external redirect. Allowing both would create a row
-- with two possible destinations and no rule saying which wins, which is the
-- kind of ambiguity that gets resolved differently by each call site. For an
-- EVENT that is externally ticketed the destination is NOT stored on the link:
-- it is read from events.external_ticket_url at resolve time, so changing where
-- an event sells does not require rewriting every link ever minted for it.
--
-- ORDERING AND PRODUCTION. Additive and backwards compatible. Every existing
-- share_links row keeps its event_id and satisfies the new CHECK unchanged, and
-- external_ticket_url defaults to NULL so every existing event stays internal
-- and behaves exactly as it does today. There is no backfill and no destructive
-- step.
--
-- A PRODUCTION MIGRATION WILL BE NEEDED, and it is NOT urgent and NOT ordered.
-- Unlike 20260808000010, this takes nothing off sale in either direction: the
-- columns are unread until the code that reads them is deployed, and the code
-- treats their absence as "internal", which is the current behaviour. So it can
-- be applied before or after the deploy, and the honest answer to "when" is: at
-- the same time as the next production migration batch, not on its own and not
-- under launch pressure.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. share_links: an external destination, or an event, never both
-- ---------------------------------------------------------------------------

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS destination_url TEXT;

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS draft_code TEXT;

COMMENT ON COLUMN public.share_links.destination_url IS
  'External ticketing URL this short link 302s to. NULL for an ordinary internal event link. Exactly one of event_id and destination_url is non-null (share_links_target_exactly_one).';

COMMENT ON COLUMN public.share_links.draft_code IS
  'The Launch Kit draft code this external link belongs to. Only set alongside destination_url: an anonymous draft has no event row, so this is what groups a drafts per-channel links together for click attribution.';

-- event_id must become nullable for an external link to exist at all.
ALTER TABLE public.share_links
  ALTER COLUMN event_id DROP NOT NULL;

-- The safety property, in the database rather than in every call site.
ALTER TABLE public.share_links
  DROP CONSTRAINT IF EXISTS share_links_target_exactly_one;

ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_target_exactly_one
  CHECK (
    (event_id IS NOT NULL AND destination_url IS NULL)
    OR
    (event_id IS NULL AND destination_url IS NOT NULL)
  );

-- https only, and never a javascript: or data: payload dressed as a URL. The
-- application validates before writing; this refuses anything that got past it.
ALTER TABLE public.share_links
  DROP CONSTRAINT IF EXISTS share_links_destination_https_only;

ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_destination_https_only
  CHECK (destination_url IS NULL OR destination_url ~* '^https://[^[:space:]]+$');

-- A draft code only ever accompanies an external destination.
ALTER TABLE public.share_links
  DROP CONSTRAINT IF EXISTS share_links_draft_code_requires_destination;

ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_draft_code_requires_destination
  CHECK (draft_code IS NULL OR destination_url IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_share_links_draft_code
  ON public.share_links (draft_code)
  WHERE draft_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. events: ticketing is elsewhere
-- ---------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_ticket_url TEXT;

COMMENT ON COLUMN public.events.external_ticket_url IS
  'When set, ticketing for this event happens on ANOTHER platform and EventLinqs sells nothing for it: no ticket selector, no price, no reservation, no charge, and no fee. The sale gate refuses it by construction. NULL means an ordinary internal ticketed event.';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_external_ticket_url_https_only;

ALTER TABLE public.events
  ADD CONSTRAINT events_external_ticket_url_https_only
  CHECK (external_ticket_url IS NULL OR external_ticket_url ~* '^https://[^[:space:]]+$');

-- Discovery surfaces exclude external events, so the partial index is the shape
-- those queries actually filter on.
CREATE INDEX IF NOT EXISTS idx_events_internal_ticketing
  ON public.events (start_date)
  WHERE external_ticket_url IS NULL;
