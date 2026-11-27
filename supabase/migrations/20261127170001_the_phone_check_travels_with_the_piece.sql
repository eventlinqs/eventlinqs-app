-- THE PHONE CHECK TRAVELS WITH THE PIECE (Lawal, 16:52 on 27 November 2026: "no piece reaches Lawal without a passed
-- phone check"; the PM's 17:00, car Q; item K of the social studio's locked standard). The studio renders every slide at
-- full size, then as a phone shows it (390 px wide), the profile grid crop and a desktop view (470 px), opens each view,
-- and ticks ten items a slide, phone first. This keeps that proof with the piece, and the site's move
-- (src/lib/social/studio-move.ts) hands a piece on only when every slide's ten items pass and every slide has its phone
-- view; otherwise the piece stays where it is, its reason on held_reason and in ops_phase_runs.
--   studio_pieces.qa_checklist   {"slides": [{"slide": 1, "items": [{"item": 1, "pass": true, "seen": "..."}, ...]}]},
--                                ten items a slide, each with pass and a line on what was seen
--   studio_pieces.held_reason    why the move holds the piece now (cleared when it moves), and held_at since when
--   studio_uploads.view          full (the slide itself), phone (390 px wide), grid (the profile grid crop) or desktop
--                                (470 px wide); one upload a slide, format and view
-- A slide may be replaced until it has moved (the studio's fix and check again rounds); once moved, it never changes.

alter table public.studio_pieces
  add column if not exists qa_checklist jsonb check (qa_checklist is null or jsonb_typeof(qa_checklist) = 'object'),
  add column if not exists held_reason text,
  add column if not exists held_at timestamptz;

comment on column public.studio_pieces.qa_checklist is
  'The phone check: {"slides": [{"slide": 1, "items": [{"item": 1, "pass": true, "seen": "what the view showed"}, ... items 1 to 10]}]}, one entry a slide. Every item of every slide must pass, and every slide needs its phone view in studio_uploads (view phone), or the piece is held.';

alter table public.studio_uploads
  add column if not exists view text not null default 'full' check (view in ('full', 'phone', 'grid', 'desktop'));

comment on column public.studio_uploads.view is
  'full: the slide itself (1080 x 1350 feed, 1080 x 1920 story); phone: the slide 390 px wide (or 780 or 1170 at 2x or 3x); desktop: 470 px wide (or 940 or 1410); grid: the profile grid crop, square or 3:4.';

alter table public.studio_uploads drop constraint if exists studio_uploads_piece_key_slide_no_format_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'studio_uploads_piece_key_slide_no_format_view_key') then
    alter table public.studio_uploads add constraint studio_uploads_piece_key_slide_no_format_view_key unique (piece_key, slide_no, format, view);
  end if;
end
$$;

-- Each view is a PNG of its own size, read from its IHDR header: the slide at its format's size, the phone and desktop
-- views at their widths in the slide's proportion (within 2 px), the grid crop square or 3:4. A slide's piece, number,
-- format and view never change; its PNG may be replaced only until it has moved.
create or replace function public.studio_upload_is_its_png()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  w integer;
  h integer;
  tall integer;
begin
  if tg_op = 'UPDATE' then
    if new.piece_key is distinct from old.piece_key or new.slide_no is distinct from old.slide_no or new.format is distinct from old.format
       or new.view is distinct from old.view or new.brief_id is distinct from old.brief_id then
      raise exception 'refused: a studio upload keeps its piece, slide, format and view; upload a new one.' using errcode = '42501';
    end if;
    if new.png is not distinct from old.png then
      return new;
    end if;
    if old.moved_at is not null then
      raise exception 'refused: slide % of % has moved and never changes; a changed piece is a new piece.', old.slide_no, old.piece_key using errcode = '42501';
    end if;
  end if;
  if substring(new.png from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'refused: slide % (%) of % is not a PNG.', new.slide_no, new.view, new.piece_key using errcode = '23514';
  end if;
  w := (get_byte(new.png, 16) << 24) | (get_byte(new.png, 17) << 16) | (get_byte(new.png, 18) << 8) | get_byte(new.png, 19);
  h := (get_byte(new.png, 20) << 24) | (get_byte(new.png, 21) << 16) | (get_byte(new.png, 22) << 8) | get_byte(new.png, 23);
  tall := case when new.format = 'story' then 1920 else 1350 end;
  if new.view = 'full' and (w, h) <> (1080, tall) then
    raise exception 'refused: slide % of % is % x %, not the % size (1080 x %).', new.slide_no, new.piece_key, w, h, new.format, tall using errcode = '23514';
  end if;
  if new.view = 'phone' and (w not in (390, 780, 1170) or abs(h * 1080 - w * tall) > 2 * 1080) then
    raise exception 'refused: the phone view of slide % of % is % x %; it is the slide 390 px wide (780 or 1170 at 2x or 3x) in its proportion.', new.slide_no, new.piece_key, w, h using errcode = '23514';
  end if;
  if new.view = 'desktop' and (w not in (470, 940, 1410) or abs(h * 1080 - w * tall) > 2 * 1080) then
    raise exception 'refused: the desktop view of slide % of % is % x %; it is the slide 470 px wide (940 or 1410 at 2x or 3x) in its proportion.', new.slide_no, new.piece_key, w, h using errcode = '23514';
  end if;
  if new.view = 'grid' and (w not between 100 and 1440 or (abs(h - w) > w * 0.02 and abs(h * 3 - w * 4) > w * 0.08)) then
    raise exception 'refused: the grid view of slide % of % is % x %; it is the profile grid crop, square or 3:4.', new.slide_no, new.piece_key, w, h using errcode = '23514';
  end if;
  return new;
end
$$;
