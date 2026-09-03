-- ============================================================================
-- THE STREAM LINK LEAVES THE EVENTS ROW (Scope v5, 3.11), 3 September 2026
--
-- WHAT WAS FOUND, measured on TEST with the anon key rather than assumed:
--
--   anon select virtual_url -> OK
--
-- events.virtual_url sat on a table the anon role can read (published events
-- are public by row policy, and no column privilege had ever been revoked on
-- events). The scope says the link "is only revealed to ticket holders after
-- purchase". A page can honour that and the database still hands the value to
-- anyone who calls PostgREST with the key that sits in every page's source. The
-- reveal rule has to hold at the API layer or it does not hold.
--
-- WHY A VAULT TABLE AND NOT A COLUMN PRIVILEGE. The repository's own scan
-- (scripts/security/rls-exposure-scan.mjs) records that narrowing events is
-- "materially riskier" because several public readers still select the whole
-- row, and a REVOKE on one column makes every one of those reads fail with
-- "permission denied for column". A separate table with no anon grant closes
-- the exposure without touching a single existing read.
--
-- THE COLUMN IS KEPT, EMPTIED AND MADE INERT. Dropping it would break whichever
-- of the code and the schema deploys second. Instead a trigger moves anything
-- written to events.virtual_url into the vault and nulls the column, so an
-- older build that still writes there cannot re-open the hole, and a newer
-- build never writes there at all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_stream_links (
  event_id   uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  url        text NOT NULL CHECK (url ~ '^(https?|rtmps?)://' AND char_length(url) <= 2048),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_stream_links IS
  'The livestream link for a virtual or hybrid event. Deliberately NOT a column on '
  'events: that row is readable by anon for published events, and this value is '
  'revealed only to a confirmed ticket holder (Scope v5 3.11). No grant to anon. '
  'Organisers reach their own row through RLS; attendees reach it only through the '
  'bearer-gated watch surface, which reads with the service role.';

ALTER TABLE public.event_stream_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_stream_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_stream_links TO authenticated;

DROP POLICY IF EXISTS "Organisers manage their stream link" ON public.event_stream_links;
CREATE POLICY "Organisers manage their stream link" ON public.event_stream_links
  AS PERMISSIVE FOR ALL TO authenticated
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

-- Move every link that already exists, then empty the column.
INSERT INTO public.event_stream_links (event_id, url)
SELECT e.id, e.virtual_url
  FROM public.events e
 WHERE e.virtual_url IS NOT NULL
   AND e.virtual_url ~ '^(https?|rtmps?)://'
   AND char_length(e.virtual_url) <= 2048
ON CONFLICT (event_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now();

UPDATE public.events SET virtual_url = NULL WHERE virtual_url IS NOT NULL;

-- Anything written to the column from now on lands in the vault instead.
CREATE OR REPLACE FUNCTION public.events_move_virtual_url_to_vault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.virtual_url IS NOT NULL AND btrim(NEW.virtual_url) <> '' THEN
    IF btrim(NEW.virtual_url) ~ '^(https?|rtmps?)://' AND char_length(btrim(NEW.virtual_url)) <= 2048 THEN
      INSERT INTO public.event_stream_links (event_id, url)
      VALUES (NEW.id, btrim(NEW.virtual_url))
      ON CONFLICT (event_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now();
    END IF;
    UPDATE public.events SET virtual_url = NULL WHERE id = NEW.id AND virtual_url IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.events_move_virtual_url_to_vault() FROM PUBLIC;

DROP TRIGGER IF EXISTS events_move_virtual_url_to_vault ON public.events;
CREATE TRIGGER events_move_virtual_url_to_vault
  AFTER INSERT OR UPDATE OF virtual_url ON public.events
  FOR EACH ROW
  WHEN (NEW.virtual_url IS NOT NULL)
  EXECUTE FUNCTION public.events_move_virtual_url_to_vault();

COMMENT ON COLUMN public.events.virtual_url IS
  'INERT since 20260903000002. Always NULL: anything written here is moved to '
  'event_stream_links by events_move_virtual_url_to_vault() and the column is '
  'emptied, because this row is anon-readable and the stream link is not public.';
