-- =============================================================================
-- 20260426000002_fix_org_members_rls_recursion.sql
--
-- Fix infinite recursion in organisation_members RLS.
--
-- The original M1 policies on organisation_members included a self-referencing
-- subquery ("user can view members of any org where they are admin"), which
-- queries organisation_members from inside the policy on organisation_members.
-- This trips Postgres' "infinite recursion in policy" guard whenever PostgREST
-- evaluates SELECT against a table that joins through the policy graph.
-- The events table joins through organisations | organisation_members for its
-- "Org members can view their events" policy, so anonymous SELECT against
-- events also hits this recursion and returns HTTP 500.
--
-- Fix: drop the recursive policies and replace with non-recursive variants
-- that only check organisations.owner_id. Member-level admin management is a
-- power-user feature for later | re-add via a SECURITY DEFINER helper.
-- =============================================================================

DROP POLICY IF EXISTS "Org owners and admins can view all members"
  ON public.organisation_members;
DROP POLICY IF EXISTS "Org owners and admins can manage members"
  ON public.organisation_members;

CREATE POLICY "Org owners can view all members"
  ON public.organisation_members FOR SELECT
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Org owners can manage members"
  ON public.organisation_members FOR ALL
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  );
