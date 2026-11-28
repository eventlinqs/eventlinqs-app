-- WINDOW 5C, 28 November 2026, car T, T3 (the PM's 02:05: "Pre flight before upload. The studio validates against the
-- intake's own rules BEFORE its slides travel ... a check only mode: a studio piece flagged preflight runs the intake's
-- checks within 10 minutes and writes its reasons back, with no handoff. The studio fixes and resubmits until clean, then
-- sends the slides.")
--
-- The studio sets preflight on its piece, with or without its slides. Every social run (each ten minutes,
-- src/lib/social/studio-move.ts preflightStudioPieces) judges each preflight piece whose words, slot, nights, checklist or
-- slides changed since its last answer against the intake's own gates (exact titles, absolute dates, the tracked link,
-- rights, the slot, the caption standard, the handoff's own refusals), and writes the answer here: when (preflight_at),
-- whether it passed (preflight_passed), every reason (preflight_reasons), and the fingerprint of what was judged
-- (preflight_of), so a fix is judged again without being asked. A preflight piece never moves and is never handed off;
-- the studio clears preflight to send it. Columns only: no table, no grant, nothing hidden.
alter table public.studio_pieces
  add column if not exists preflight boolean not null default false,
  add column if not exists preflight_at timestamptz,
  add column if not exists preflight_passed boolean,
  add column if not exists preflight_reasons text[],
  add column if not exists preflight_of text;
