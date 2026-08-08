-- The last of the banned word in event tags, and the one place it stays.
--
-- 20260808000004 merged the `arts-culture` tag into `arts-community`. The
-- taxonomy verifier then found four published events still carrying the banned
-- word in tags, in two values that are NOT the same kind of thing:
--
--   3 events tagged `cultural`      <- OUR taxonomy. A descriptive tag the
--                                      seeder wrote. This migration renames it.
--   1 event  tagged `africultures`  <- A PROPER NOUN. "Africultures Festival"
--                                      is a real Sydney festival and that is
--                                      its actual name. LEFT ALONE.
--
-- WHY africultures IS NOT TOUCHED. The constitution bans the word "in every
-- form" across slugs, identifiers and data, and the purpose of that law is that
-- EventLinqs never describes communities in the language it has rejected.
-- It is not a licence to rewrite the registered name of somebody else's event.
-- Renaming it would corrupt a real organiser's identity, break the search term
-- their audience actually types, and the event slug
-- (`africultures-festival-sydney-2027`) would still carry it anyway, so the
-- edit would achieve nothing except damage.
--
-- That is a judgement, so it is recorded rather than made silently: the
-- taxonomy verifier reports proper nouns separately from our own taxonomy and
-- names this one explicitly, so the founder can overrule it in one place.
--
-- `cultural` becomes `community`, which is the tag the platform already uses
-- for exactly this meaning (61 published events carry it).
--
-- SAFETY. One column, one tag value, idempotent, no row deleted, nothing else
-- read or written.

begin;

update public.events e
   set tags = (
        select jsonb_agg(distinct
                 case when tag = '"cultural"'::jsonb
                      then '"community"'::jsonb
                      else tag end)
          from jsonb_array_elements(e.tags) as tag
       )
 where e.tags @> '["cultural"]'::jsonb;

commit;
