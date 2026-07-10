-- =====================================================================
-- 20260621000006_rename_culture_to_community.sql
-- =====================================================================
-- Hard rule (CLAUDE.md, Copy and banned content): the word "culture" is banned
-- everywhere, including database tables, columns, constraints, indexes and
-- policies. This renames the taxonomy schema from culture -> community. Row
-- values (community names/slugs like 'south-asian', 'first-nations') already
-- carry no "culture" text and are unchanged.
--
-- Apply to TEST/STAGING only (never production) per the constitution. The
-- earlier seed/taxonomy migrations create `cultures` before this runs, so the
-- migration chain stays valid on a fresh database.
-- =====================================================================

-- Table.
ALTER TABLE public.cultures RENAME TO communities;
ALTER INDEX IF EXISTS cultures_pkey RENAME TO communities_pkey;

-- Columns on events.
ALTER TABLE public.events RENAME COLUMN culture_primary TO community_primary;
ALTER TABLE public.events RENAME COLUMN sub_culture TO sub_community;

-- FK constraint + index that carried the old name.
ALTER TABLE public.events RENAME CONSTRAINT events_culture_primary_fkey TO events_community_primary_fkey;
ALTER INDEX IF EXISTS events_culture_primary_idx RENAME TO events_community_primary_idx;

-- RLS policies (policies cannot be renamed; drop + recreate with new names).
DROP POLICY IF EXISTS cultures_anon_select ON public.communities;
CREATE POLICY communities_anon_select ON public.communities
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS cultures_admin_all ON public.communities;
CREATE POLICY communities_admin_all ON public.communities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid() AND a.disabled_at IS NULL AND a.role IN ('super_admin', 'admin')
    )
  );

COMMENT ON TABLE public.communities IS
  'Community taxonomy for /community/[slug] landing pages (renamed from cultures; the word "culture" is banned).';
