-- A SELF-LISTED PHOTOGRAPH TAKES THE SCOPE ITS ORGANISER'S OWN WORDS GRANT (WINDOW 5A, 22 November 2026; the PM's 01:21,
-- Lawal's 01:19: "the planner judges every photograph permitted for a night by every record that grants it").
--
-- The self-listing form asks for exactly these words (src/lib/listings/submission.ts PERMISSION_WORDS): "Yes, you're
-- welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events."
-- Every self-listed photograph was nevertheless registered for the listing alone (scope 'site'), so the social planner
-- (social_asset_usable_row: scope social or both) never saw a photograph its organiser had given for posts. Read on
-- production on 22 November 2026 (q-scope-dry.sql): five such rows, New Years Eve Melbourne H2o (627abedb), Kyivska
-- Perepichka (b883e661), A Moment of Sanity (9080529b) and Mr Snotbottom's Stinky Silly Show twice (d4523b3b, c3aa8619).
--
-- This corrects the register to the organiser's own recorded words, and only where they are exactly the form's words and
-- the row is the organiser's own, approved and current: its scope becomes 'both' and its permitted uses say so. The words
-- themselves are never changed. Each post is still a piece approved before it goes. From now the writer takes the scope
-- from the words (scopeFromPermission), so no new row is registered narrower than its grant.
update public.social_assets
   set scope = 'both',
       permitted_uses = 'This event''s own EventLinqs page, its event cards, and EventLinqs social posts about it, as its organiser''s words grant. Each post is approved as a piece before it goes.'
 where scope = 'site'
   and asset_state = 'organiser_authorised'
   and approval_status = 'approved'
   and withdrawal_status = 'current'
   and permission_evidence like '"Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events." given by %';

-- POST-CONDITION: no current, approved organiser row carrying the form's words is left registered for the listing alone.
do $post$
begin
  if exists (
    select 1 from public.social_assets
     where scope = 'site' and asset_state = 'organiser_authorised' and approval_status = 'approved' and withdrawal_status = 'current'
       and permission_evidence like '"Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events." given by %'
  ) then
    raise exception 'self listed photo scope post-condition failed: a row with the form''s words is still registered for the listing alone';
  end if;
end
$post$;
