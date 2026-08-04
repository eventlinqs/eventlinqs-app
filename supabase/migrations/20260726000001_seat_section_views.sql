-- View from seat, by photograph (2026-07-26 seating round, item 9).
-- The organiser uploads one real photo per SECTION of a seating chart;
-- the buyer map shows the actual view on tap. No 3D, no render: a
-- photograph. Photos are keyed by (seat_map_id, section name) so they
-- ride the chart template onto every event that uses it.

begin;

CREATE TABLE IF NOT EXISTS public.seat_section_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_map_id UUID NOT NULL REFERENCES public.seat_maps(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One photo per section per chart, case-insensitive on the section name
-- (sections are matched by name everywhere else in the seating system).
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_section_views_map_section
  ON public.seat_section_views (seat_map_id, LOWER(section_name));

CREATE INDEX IF NOT EXISTS idx_seat_section_views_map
  ON public.seat_section_views (seat_map_id);

ALTER TABLE public.seat_section_views ENABLE ROW LEVEL SECURITY;

-- Buyers read views on any active chart (the buyer map is public);
-- writes go through the server action's ownership gate under the
-- service role, the same trust model as the seating actions.
CREATE POLICY seat_section_views_public_read
  ON public.seat_section_views FOR SELECT
  USING (true);

CREATE POLICY seat_section_views_service_write
  ON public.seat_section_views FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.seat_section_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- The storage bucket: public read like event imagery, 10MB cap, the
-- pipeline's accepted formats. Uploads and deletes run under the service
-- role from the server action (magic-byte validation, EXIF stripping and
-- ownership scoping happen there); no direct client writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'section-views',
  'section-views',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view section view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'section-views');

commit;
