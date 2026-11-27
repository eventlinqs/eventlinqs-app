-- THE SCORECARD TRAVELS WITH THE PIECE (Lawal, 02:04 and 02:14 of 28 November 2026; the PM's 02:12, car U, U3;
-- START-16OCT/EVENTLINQS-SOCIAL-SCORECARD-AND-CONVERSION-28NOV.md section 1): each studio piece carries its scorecard, the
-- eight measures each out of 10, as the engine scored it before submitting and as the PM scored it from the rendered
-- slides, the captions and the /ig page, each with what it looked at. /admin/social shows both beside the phone views.
--   studio_pieces.scorecard  {"engine": {"brand_identity": 9.2, ..., "looked_at": "..."}, "pm": {...}}

alter table public.studio_pieces
  add column if not exists scorecard jsonb check (scorecard is null or jsonb_typeof(scorecard) = 'object');

comment on column public.studio_pieces.scorecard is
  'The scorecard: {"engine": {...}, "pm": {...}}, each with brand_identity, creative_direction, visual_consistency, mobile_readability, event_hierarchy, conversion_readiness, production_workflow and publishing_reliability out of 10, and looked_at, what was looked at. The floor is 9 on every measure.';
