-- WHICH POST BROUGHT A PRESS OR AN ORDER (D8 of Lawal's DemandOS directive, 30 October 2026, "Conversion attribution").
-- Only partner kits and daily posters have a share link of their own (src/lib/social/store.ts). A tap on /go/<piece> for
-- a guide, a reel or a spotlight was counted in go_presses and then lost: nothing later could be tied to the post. The
-- tap now leaves a first-party cookie (src/lib/growth/go-math.ts GO_PIECE_COOKIE), and a press out or an order on a night
-- that piece named records the piece here.
--
-- Additive: one nullable column on an existing table, already granted; no row is rewritten. A row with no piece reads
-- exactly as it always has. The piece going away leaves the counted press standing, unattributed.

alter table public.share_link_events
  add column if not exists piece_id uuid references public.social_pieces (id) on delete set null;

comment on column public.share_link_events.piece_id is
  'The post a tap on /go brought this visitor through, only when that post named this night. Null for every other row. A press is never a sale.';

create index if not exists share_link_events_by_piece
  on public.share_link_events (piece_id, kind)
  where piece_id is not null;
