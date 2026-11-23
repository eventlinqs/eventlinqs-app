-- A PIECE AND ITS FIRST REVISION ARE WRITTEN TOGETHER (the PM's intake of 23 and 24 November 2026). At 22:14 on
-- 23 November the comedy set's intake wrote its social_pieces row (28e4096c), the caption check then refused its first
-- revision, and the code's own clean up (store.ts drawApprovedSet: delete the piece whose words were refused) was refused
-- in turn, unread: service_role holds select and insert on social_pieces and nothing else (20261028141001). The empty
-- piece held the week's one Melbourne weekend carousel place, and the next intake was refused, quoted: "Not drawn: this
-- week's campaign already holds a weekend carousel piece for melbourne". The PM removed it by a logged write.
--
-- So service_role may now remove a piece, and the database itself keeps that to the one case the code needs: a piece with
-- nothing written under it (no revision, approval, schedule or posting), which is a piece whose first words were refused.
-- A piece that has words or any record of its life is never removed by a direct delete; a delete that reaches a piece
-- through a cascade (its campaign removed by the owner) is the cascade's, and is left to it (pg_trigger_depth() > 1).
-- The code removes the empty piece and reads the answer (store.ts writePieceWithFirstRevision), so a refusal is said.
-- Reversal: revoke delete on public.social_pieces from service_role; drop the trigger and its function.

grant delete on public.social_pieces to service_role;

create or replace function public.social_piece_removed_only_while_empty()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.social_piece_revisions r where r.piece_id = old.id)
     or exists (select 1 from public.social_piece_approvals a where a.piece_id = old.id)
     or exists (select 1 from public.social_piece_schedules s where s.piece_id = old.id)
     or exists (select 1 from public.social_piece_postings p where p.piece_id = old.id) then
    raise exception 'refused: a piece with words, an approval, a schedule or a posting is never removed; only a piece whose first words were refused is.'
      using errcode = '23514';
  end if;
  return old;
end;
$fn$;

create or replace trigger social_pieces_removed_only_while_empty
  before delete on public.social_pieces
  for each row execute function public.social_piece_removed_only_while_empty();

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
begin
  if not has_table_privilege('service_role', 'public.social_pieces', 'delete') then
    raise exception 'service_role cannot remove an empty piece';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'social_pieces_removed_only_while_empty' and tgrelid = 'public.social_pieces'::regclass and not tgisinternal) then
    raise exception 'the trigger that keeps a piece with words is not in force';
  end if;
end
$post$;
