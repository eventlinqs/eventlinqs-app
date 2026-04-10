-- Add Festival and Film categories (missing from initial seed)
-- Run in Supabase SQL Editor → New query → Paste → Run

INSERT INTO public.event_categories (name, slug, icon, sort_order)
VALUES
  ('Festival', 'festival', 'sparkles', 15),
  ('Film',     'film',     'film',      16)
ON CONFLICT (slug) DO NOTHING;

-- Shift 'Other' to the end
UPDATE public.event_categories SET sort_order = 17 WHERE slug = 'other';
