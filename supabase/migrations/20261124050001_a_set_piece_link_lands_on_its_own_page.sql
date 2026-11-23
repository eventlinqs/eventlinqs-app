-- A SET PIECE LANDS ON A PAGE OF EXACTLY ITS OWN NIGHTS (the PM's RETURN of 04:05 on 24 November 2026, comedy piece
-- ed0c1dca: after posting, its link landed on /city/melbourne, every Melbourne night, where its three shows had to be
-- hunted for; Lawal's 13:12 item 3, the whole booking journey to the right event). A set piece's link is now its own
-- page, /ig?piece=<its id> (src/lib/social/campaign.ts planApprovedSet, src/app/ig/page.tsx), written so from a new
-- piece's first write. The pieces drawn before it (the comedy, live music and Kyivska sets, each unapproved) keep
-- /city/melbourne in their link, so the intake that draws them again with today's rules (store.ts drawApprovedSet) sets
-- their link to their own page; service_role holds select, insert and the removal of an empty piece on social_pieces,
-- and now the update of its link column alone. No other column of a piece can be changed by it.
-- Reversal: revoke update (link) on public.social_pieces from service_role.

grant update (link) on public.social_pieces to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
begin
  if not has_column_privilege('service_role', 'public.social_pieces', 'link', 'update') then
    raise exception 'service_role cannot give a set piece its own page';
  end if;
end
$post$;
