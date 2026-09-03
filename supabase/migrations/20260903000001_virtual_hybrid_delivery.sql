-- ============================================================================
-- VIRTUAL AND HYBRID DELIVERY (Scope v5, 3.11), 3 September 2026
--
-- THE DEFECT THIS CLOSES. events.virtual_url was captured by the organiser
-- form and saved, and was never shown to a single ticket holder: nothing under
-- src/app/tickets, src/app/orders, src/app/events or the ticket components read
-- it. An organiser could sell a virtual ticket and the buyer had no way to reach
-- the stream. The scope audit of 3 September 2026 called it "broken in
-- practice" and it blocked launch the moment one virtual event was sold.
--
-- Scope 3.11, in the scope's own words, and what each clause needs from the
-- schema:
--
--   "Link is only revealed to ticket holders after purchase."
--     -> no schema change; the reveal is the bearer-gated watch surface.
--   "Hybrid events: separate ticket tiers for in-person attendance and
--    livestream-only access, each with independent pricing and capacity."
--     -> ticket_tiers.access_mode. Price and capacity already live per tier.
--   "Geo-based access restrictions: organisers can restrict livestream tickets
--    to specific countries or regions."
--     -> events.stream_geo_allow, ISO 3166-1 alpha-2 codes, NULL = anywhere.
--   "Virtual attendee experience: chat, Q&A, and reaction features accessible
--    to livestream ticket holders during the event."
--     -> stream_messages, reachable by attendees ONLY through the service-role
--        route behind the bearer gate, and by the organiser through RLS.
--
-- THE INVARIANT, held in the database and mirrored in the form: an in-person
-- event sells only in-person tiers, a virtual event sells only livestream tiers,
-- a hybrid event may sell both. The tier side RAISES on a mismatch (a livestream
-- tier on an in-person event is an authoring error and must not be stored). The
-- event side COERCES: when an organiser changes the event type, every tier is
-- moved with it, because the update action writes the event row and then
-- replaces the tiers in a separate request, so a raising trigger on the event
-- row would refuse the very change the tiers are about to follow.
-- ============================================================================

-- 1. Per-tier access mode ----------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tier_access_mode') THEN
    CREATE TYPE public.tier_access_mode AS ENUM ('in_person', 'virtual');
  END IF;
END $$;

ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS access_mode public.tier_access_mode NOT NULL DEFAULT 'in_person';

COMMENT ON COLUMN public.ticket_tiers.access_mode IS
  'What this tier admits: in_person (the door) or virtual (the livestream). A hybrid '
  'event sells both kinds side by side with independent price and capacity (Scope v5 '
  '3.11). Held consistent with events.event_type by tier_access_mode_matches_event() '
  'and event_type_coerces_tier_access_modes().';

-- Every tier on an already-virtual event is a livestream tier by definition.
UPDATE public.ticket_tiers t
   SET access_mode = 'virtual'
  FROM public.events e
 WHERE e.id = t.event_id
   AND e.event_type = 'virtual'
   AND t.access_mode <> 'virtual';

-- 2. Geo restriction on the livestream ----------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS stream_geo_allow text[] NULL;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_stream_geo_allow_iso2;
ALTER TABLE public.events
  ADD CONSTRAINT events_stream_geo_allow_iso2
  CHECK (
    stream_geo_allow IS NULL
    OR array_to_string(stream_geo_allow, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'
  );

COMMENT ON COLUMN public.events.stream_geo_allow IS
  'Countries the livestream may be watched from, as upper-case ISO 3166-1 alpha-2 '
  'codes (AU, NZ). NULL means anywhere. Enforced at the watch surface and the stream '
  'chat API from the request country Vercel supplies in x-vercel-ip-country '
  '(https://vercel.com/docs/headers/request-headers, fetched 2026-09-03). Never '
  'rendered on the public event page as a URL; only the sentence "streams to viewers in".';

-- 3. The invariant ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tier_access_mode_matches_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type public.event_type;
BEGIN
  SELECT e.event_type INTO v_type FROM public.events e WHERE e.id = NEW.event_id;
  IF v_type = 'in_person' AND NEW.access_mode <> 'in_person' THEN
    RAISE EXCEPTION 'tier_access_mode_mismatch: an in-person event cannot sell a livestream tier'
      USING ERRCODE = '23514';
  END IF;
  IF v_type = 'virtual' AND NEW.access_mode <> 'virtual' THEN
    RAISE EXCEPTION 'tier_access_mode_mismatch: a virtual event cannot sell an in-person tier'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tier_access_mode_matches_event ON public.ticket_tiers;
CREATE TRIGGER tier_access_mode_matches_event
  BEFORE INSERT OR UPDATE OF access_mode, event_id ON public.ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tier_access_mode_matches_event();

CREATE OR REPLACE FUNCTION public.event_type_coerces_tier_access_modes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_type = 'in_person' THEN
    UPDATE public.ticket_tiers SET access_mode = 'in_person'
     WHERE event_id = NEW.id AND access_mode <> 'in_person';
  ELSIF NEW.event_type = 'virtual' THEN
    UPDATE public.ticket_tiers SET access_mode = 'virtual'
     WHERE event_id = NEW.id AND access_mode <> 'virtual';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_type_coerces_tier_access_modes ON public.events;
CREATE TRIGGER event_type_coerces_tier_access_modes
  AFTER UPDATE OF event_type ON public.events
  FOR EACH ROW
  WHEN (OLD.event_type IS DISTINCT FROM NEW.event_type)
  EXECUTE FUNCTION public.event_type_coerces_tier_access_modes();

-- 4. The room: chat, Q&A and reactions ----------------------------------------

CREATE TABLE IF NOT EXISTS public.stream_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- NULL for a message the organiser posts; the ticket for an attendee's.
  ticket_id     uuid NULL REFERENCES public.tickets(id) ON DELETE SET NULL,
  author_kind   text NOT NULL CHECK (author_kind IN ('attendee', 'organiser')),
  author_name   text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  kind          text NOT NULL CHECK (kind IN ('chat', 'question', 'reaction')),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  answer_body   text NULL CHECK (answer_body IS NULL OR char_length(answer_body) BETWEEN 1 AND 1000),
  answered_at   timestamptz NULL,
  answered_by   uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  hidden_at     timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stream_messages_attendee_has_ticket
    CHECK (author_kind = 'organiser' OR ticket_id IS NOT NULL),
  CONSTRAINT stream_messages_answer_only_on_question
    CHECK (answer_body IS NULL OR kind = 'question')
);

CREATE INDEX IF NOT EXISTS stream_messages_event_created_idx
  ON public.stream_messages (event_id, created_at);

COMMENT ON TABLE public.stream_messages IS
  'The livestream room for a virtual or hybrid event (Scope v5 3.11): chat, questions '
  'the organiser can answer, and reactions. Attendees never touch this table directly: '
  'a livestream ticket holder has no session, only the bearer (ticket_code, secret) '
  'pair, so they read and write through /api/stream/[code]/messages, which verifies '
  'that pair, the tier access mode, the ticket status and the geo allow-list on every '
  'call and then uses the service role. Organisers reach it through RLS.';

ALTER TABLE public.stream_messages ENABLE ROW LEVEL SECURITY;

-- The anon key sits in every page's source. It gets nothing here.
REVOKE ALL ON public.stream_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.stream_messages TO authenticated;

DROP POLICY IF EXISTS "Organisers read their stream room" ON public.stream_messages;
CREATE POLICY "Organisers read their stream room" ON public.stream_messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT el_ev.id FROM public.events el_ev
       WHERE el_ev.organisation_id IN (SELECT public.el_owned_organisation_ids())
          OR el_ev.organisation_id IN (SELECT public.el_member_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Organisers moderate their stream room" ON public.stream_messages;
CREATE POLICY "Organisers moderate their stream room" ON public.stream_messages
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    event_id IN (
      SELECT el_ev.id FROM public.events el_ev
       WHERE el_ev.organisation_id IN (SELECT public.el_owned_organisation_ids())
          OR el_ev.organisation_id IN (SELECT public.el_member_organisation_ids())
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT el_ev.id FROM public.events el_ev
       WHERE el_ev.organisation_id IN (SELECT public.el_owned_organisation_ids())
          OR el_ev.organisation_id IN (SELECT public.el_member_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Organisers post to their stream room" ON public.stream_messages;
CREATE POLICY "Organisers post to their stream room" ON public.stream_messages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    author_kind = 'organiser'
    AND ticket_id IS NULL
    AND event_id IN (
      SELECT el_ev.id FROM public.events el_ev
       WHERE el_ev.organisation_id IN (SELECT public.el_owned_organisation_ids())
          OR el_ev.organisation_id IN (SELECT public.el_member_organisation_ids())
    )
  );
