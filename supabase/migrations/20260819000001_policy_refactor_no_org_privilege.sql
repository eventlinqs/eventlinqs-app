-- ============================================================================
-- Column lockdown, STAGE 2: stop the policies needing table SELECT on organisations
-- Run by founder: supabase db push --linked
-- Proven on TEST first: scripts/verify/rls-lockdown-test-proof.mjs --stage stage2
-- GENERATED from the live policy definitions by
--   node scripts/verify/generate-policy-refactor.mjs --env .env.test --out <this file>
-- Do not hand-edit: regenerate, so the rewrite can never drift from what is live.
-- ============================================================================
--
-- THE PROBLEM THIS SOLVES. Applying 20260808000010 took every event page to 404.
-- Proven cause (scripts/verify/rls-policy-dependency-probe.mjs): a row security
-- policy is evaluated with the CALLER's privileges, and 44 policies in public
-- read organisations or organisation_members inside their own USING clause. While
-- anon held table-level SELECT on organisations those subqueries were legal. The
-- moment it was revoked, SELECT on 29 tables failed with
--
--     42501  permission denied for table organisations
--
-- including events, ticket_tiers and tickets. Every public surface, from one revoke.
--
-- WHAT THIS CHANGES, and what it deliberately does not. Each policy's predicate
-- STRUCTURE is untouched. Only the inner subquery that reads organisations or
-- organisation_members is replaced with a SECURITY DEFINER helper returning the
-- identical set of ids. Nothing gains or loses access. The helpers run as their
-- owner, so evaluating a policy no longer requires the CALLER to hold SELECT on
-- either table, and the nested RLS evaluation on organisation_members disappears
-- with it.
--
-- organisation_members is rewritten too, even though only organisations is being
-- locked down: a subquery over organisation_members is itself subject to
-- organisation_members' own policies, which read organisations, so the privilege
-- requirement survived through a second hop.
--
-- WHY THE HELPERS ARE NOT A BACK DOOR. They take no arguments and return only the
-- organisations belonging to auth.uid(). A caller cannot ask about anybody else, so
-- EXECUTE on them reveals nothing that the subquery they replace did not already
-- reveal. search_path is pinned so a mutable-path attack cannot redirect them.
--
-- APPLY ORDER: this migration is safe to apply on its own and BEFORE the
-- organisations column revoke. It only removes a privilege REQUIREMENT; it does not
-- withdraw any privilege, so on a database that still grants anon table SELECT it
-- is a no-op behaviourally.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- The two helpers. STABLE because they are called once per row per policy and
-- must not be re-evaluated per row; SECURITY DEFINER so the caller needs no
-- privilege on the tables read; search_path pinned so the bodies cannot be
-- redirected at call time.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.el_owned_organisation_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT o.id FROM public.organisations o WHERE o.owner_id = auth.uid()
$$;

COMMENT ON FUNCTION public.el_owned_organisation_ids() IS
  'Organisations owned by the calling user. Exists so a row policy can express '
  'ownership WITHOUT the caller holding SELECT on public.organisations, which is '
  'what took every event page to 404 on 2026-08-08. Returns only the caller''s own '
  'organisations, so it discloses nothing they could not already see.';

CREATE OR REPLACE FUNCTION public.el_member_organisation_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.organisation_id FROM public.organisation_members m
   WHERE m.user_id = auth.uid()
     AND m.role = ANY (ARRAY['owner'::org_member_role, 'admin'::org_member_role, 'manager'::org_member_role])
$$;

COMMENT ON FUNCTION public.el_member_organisation_ids() IS
  'Organisations the calling user owns, administers or manages, by '
  'organisation_members role. Same purpose as el_owned_organisation_ids: it removes the caller''s '
  'privilege requirement, and also removes a nested RLS evaluation on '
  'organisation_members. The role list is copied verbatim from the policies it '
  'replaces so no membership gains or loses access.';

CREATE OR REPLACE FUNCTION public.el_any_member_organisation_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.organisation_id FROM public.organisation_members m WHERE m.user_id = auth.uid()
$$;

COMMENT ON FUNCTION public.el_any_member_organisation_ids() IS
  'Organisations the calling user belongs to in ANY role. Deliberately separate '
  'from el_member_organisation_ids: events."Org members can view their events" has no role filter, '
  'so folding it into the role-filtered helper would have silently NARROWED that '
  'policy and using it for the others would have WIDENED them. Keep the three '
  'helpers distinct.';

REVOKE ALL ON FUNCTION public.el_owned_organisation_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.el_member_organisation_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.el_any_member_organisation_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.el_owned_organisation_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.el_member_organisation_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.el_any_member_organisation_ids() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 44 policies rewritten. Each keeps its name, command, roles and
-- permissive/restrictive kind; only the organisations / organisation_members
-- subquery inside it changes.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "artists_organiser_insert" ON public."artists";
CREATE POLICY "artists_organiser_insert" ON public."artists"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "artists_organiser_update" ON public."artists";
CREATE POLICY "artists_organiser_update" ON public."artists"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1 FROM public.el_owned_organisation_ids() )))
  WITH CHECK ((EXISTS ( SELECT 1 FROM public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Org members can manage discount codes" ON public."discount_codes";
CREATE POLICY "Org members can manage discount codes" ON public."discount_codes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org members can manage dynamic pricing rules" ON public."dynamic_pricing_rules";
CREATE POLICY "Org members can manage dynamic pricing rules" ON public."dynamic_pricing_rules"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((ticket_tier_id IN ( SELECT tt.id
   FROM (ticket_tiers tt
     JOIN events e ON ((e.id = tt.event_id)))
  WHERE ((e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (e.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can manage addons" ON public."event_addons";
CREATE POLICY "Org members can manage addons" ON public."event_addons"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_owned_organisation_ids() ) )) OR (event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_member_organisation_ids() ) ))));

DROP POLICY IF EXISTS "event_artists_owner_all" ON public."event_artists";
CREATE POLICY "event_artists_owner_all" ON public."event_artists"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((event_id IN ( SELECT e.id
   FROM events e
  WHERE (e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )))))
  WITH CHECK ((event_id IN ( SELECT e.id
   FROM events e
  WHERE (e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )))));

DROP POLICY IF EXISTS "Org members can create events" ON public."events";
CREATE POLICY "Org members can create events" ON public."events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org members can update events" ON public."events";
CREATE POLICY "Org members can update events" ON public."events"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org members can view their events" ON public."events";
CREATE POLICY "Org members can view their events" ON public."events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_any_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org owners can delete draft events" ON public."events";
CREATE POLICY "Org owners can delete draft events" ON public."events"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((status = 'draft'::event_status) AND (organisation_id IN ( SELECT public.el_owned_organisation_ids() ))));

DROP POLICY IF EXISTS "gigs_org_owner_read" ON public."gigs";
CREATE POLICY "gigs_org_owner_read" ON public."gigs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Org members can view event order items" ON public."order_items";
CREATE POLICY "Org members can view event order items" ON public."order_items"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE ((o.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (o.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can view event orders" ON public."orders";
CREATE POLICY "Org members can view event orders" ON public."orders"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org owners can manage members" ON public."organisation_members";
CREATE POLICY "Org owners can manage members" ON public."organisation_members"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )))
  WITH CHECK ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Org owners can view all members" ON public."organisation_members";
CREATE POLICY "Org owners can view all members" ON public."organisation_members"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Organisation members can view their ledger" ON public."organiser_balance_ledger";
CREATE POLICY "Organisation members can view their ledger" ON public."organiser_balance_ledger"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((organiser_balance_ledger.organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Organisation owners can view their ledger" ON public."organiser_balance_ledger";
CREATE POLICY "Organisation owners can view their ledger" ON public."organiser_balance_ledger"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((organiser_balance_ledger.organisation_id IN ( SELECT public.el_owned_organisation_ids() ))));

DROP POLICY IF EXISTS "org_marketing_consents_owner_select" ON public."organiser_marketing_consents";
CREATE POLICY "org_marketing_consents_owner_select" ON public."organiser_marketing_consents"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Org members can view event payments" ON public."payments";
CREATE POLICY "Org members can view event payments" ON public."payments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE ((o.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (o.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Organisation members can view their holds" ON public."payout_holds";
CREATE POLICY "Organisation members can view their holds" ON public."payout_holds"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((payout_holds.organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Organisation owners can view their holds" ON public."payout_holds";
CREATE POLICY "Organisation owners can view their holds" ON public."payout_holds"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((payout_holds.organisation_id IN ( SELECT public.el_owned_organisation_ids() ))));

DROP POLICY IF EXISTS "Organisation members can view their payouts" ON public."payouts";
CREATE POLICY "Organisation members can view their payouts" ON public."payouts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((payouts.organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Organisation owners can view their payouts" ON public."payouts";
CREATE POLICY "Organisation owners can view their payouts" ON public."payouts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((payouts.organisation_id IN ( SELECT public.el_owned_organisation_ids() ))));

DROP POLICY IF EXISTS "Org pricing overrides visible to owning org" ON public."pricing_rules";
CREATE POLICY "Org pricing overrides visible to owning org" ON public."pricing_rules"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((organisation_id IS NOT NULL) AND ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() )))));

DROP POLICY IF EXISTS "Org members read their refunds" ON public."refunds";
CREATE POLICY "Org members read their refunds" ON public."refunds"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((organisation_id IN ( SELECT public.el_member_organisation_ids() )));

DROP POLICY IF EXISTS "Org owners read their refunds" ON public."refunds";
CREATE POLICY "Org owners read their refunds" ON public."refunds"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((organisation_id IN ( SELECT public.el_owned_organisation_ids() )));

DROP POLICY IF EXISTS "Org members can manage seat holds" ON public."seat_holds";
CREATE POLICY "Org members can manage seat holds" ON public."seat_holds"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((event_id IN ( SELECT e.id
   FROM events e
  WHERE ((e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (e.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can manage seat maps" ON public."seat_maps";
CREATE POLICY "Org members can manage seat maps" ON public."seat_maps"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((venue_id IN ( SELECT v.id
   FROM venues v
  WHERE ((v.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (v.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "share_link_events_event_owner_select" ON public."share_link_events";
CREATE POLICY "share_link_events_event_owner_select" ON public."share_link_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((link_id IN ( SELECT sl.id
   FROM share_links sl
  WHERE (sl.event_id IN ( SELECT e.id
           FROM events e
          WHERE (e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )))))));

DROP POLICY IF EXISTS "share_links_event_owner_select" ON public."share_links";
CREATE POLICY "share_links_event_owner_select" ON public."share_links"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((event_id IN ( SELECT e.id
   FROM events e
  WHERE (e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )))));

DROP POLICY IF EXISTS "Org members can view event scans" ON public."ticket_scans";
CREATE POLICY "Org members can view event scans" ON public."ticket_scans"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_owned_organisation_ids() ) )) OR (event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_member_organisation_ids() ) ))));

DROP POLICY IF EXISTS "Org members can manage tiers" ON public."ticket_tiers";
CREATE POLICY "Org members can manage tiers" ON public."ticket_tiers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_owned_organisation_ids() ) )) OR (event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_member_organisation_ids() ) ))));

DROP POLICY IF EXISTS "Org members can view all tiers" ON public."ticket_tiers";
CREATE POLICY "Org members can view all tiers" ON public."ticket_tiers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_owned_organisation_ids() ) )) OR (event_id IN ( SELECT el_ev.id FROM public.events el_ev WHERE el_ev.organisation_id IN ( SELECT public.el_any_member_organisation_ids() ) ))));

DROP POLICY IF EXISTS "Org members view event ticket transfers" ON public."ticket_transfers";
CREATE POLICY "Org members view event ticket transfers" ON public."ticket_transfers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((event_id IN ( SELECT e.id
   FROM events e
  WHERE ((e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (e.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can update event tickets" ON public."tickets";
CREATE POLICY "Org members can update event tickets" ON public."tickets"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE ((o.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (o.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can view event tickets" ON public."tickets";
CREATE POLICY "Org members can view event tickets" ON public."tickets"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE ((o.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (o.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can manage access codes" ON public."tier_access_codes";
CREATE POLICY "Org members can manage access codes" ON public."tier_access_codes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((ticket_tier_id IN ( SELECT tt.id
   FROM (ticket_tiers tt
     JOIN events e ON ((e.id = tt.event_id)))
  WHERE ((e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (e.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Organisation members can view their tier history" ON public."tier_progression_log";
CREATE POLICY "Organisation members can view their tier history" ON public."tier_progression_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((tier_progression_log.organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Organisation owners can view their tier history" ON public."tier_progression_log";
CREATE POLICY "Organisation owners can view their tier history" ON public."tier_progression_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((tier_progression_log.organisation_id IN ( SELECT public.el_owned_organisation_ids() ))));

DROP POLICY IF EXISTS "Venue org members can view enrolments" ON public."venue_enrolments";
CREATE POLICY "Venue org members can view enrolments" ON public."venue_enrolments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((venue_id IN ( SELECT v.id
   FROM venues v
  WHERE ((v.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (v.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Venue org members can view payouts" ON public."venue_payouts";
CREATE POLICY "Venue org members can view payouts" ON public."venue_payouts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((venue_id IN ( SELECT v.id
   FROM venues v
  WHERE ((v.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (v.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Venue org members can view share ledger" ON public."venue_share_ledger";
CREATE POLICY "Venue org members can view share ledger" ON public."venue_share_ledger"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((venue_id IN ( SELECT v.id
   FROM venues v
  WHERE ((v.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (v.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

DROP POLICY IF EXISTS "Org members can manage venues" ON public."venues";
CREATE POLICY "Org members can manage venues" ON public."venues"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (organisation_id IN ( SELECT public.el_member_organisation_ids() ))));

DROP POLICY IF EXISTS "Org members can view waitlist for their events" ON public."waitlist";
CREATE POLICY "Org members can view waitlist for their events" ON public."waitlist"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((event_id IN ( SELECT e.id
   FROM events e
  WHERE ((e.organisation_id IN ( SELECT public.el_owned_organisation_ids() )) OR (e.organisation_id IN ( SELECT public.el_member_organisation_ids() ))))));

COMMIT;
