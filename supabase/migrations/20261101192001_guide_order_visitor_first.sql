-- THE GUIDE'S CATEGORY ORDER, as a visitor looks for them (Lawal, 19:17 1 November 2026, relayed by the CONTROLLER at
-- 19:19 (3): "SPORT moves up near the top ... order the 'Explore <city>' tiles by what a visitor looks for: music,
-- sport, comedy, nightlife, markets, food and drink, family, arts, then the rest"). The rest keep their order from
-- 20261101161001. Labels, slugs and the set of fifteen are unchanged; only guide_order moves.
-- C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md governs the page; src/lib/categories/classify.ts holds the
-- same order and tests/unit/categories/classify.test.ts reads both.
--
-- The partial unique index on guide_order (where guide_order is not null) is checked row by row, so the fifteen are
-- cleared first (null is outside the index), then take their new places, in one transaction. A plain clear, never an
-- in-place increment of the column (maintained-aggregates).

update public.event_categories set guide_order = null where guide_order between 1 and 15;

update public.event_categories c
   set guide_order = g.n
  from (values ('music', 1), ('sports', 2), ('comedy', 3), ('nightlife', 4), ('markets', 5), ('food-drink', 6),
               ('family', 7), ('arts-community', 8), ('theatre', 9), ('festival', 10), ('community', 11),
               ('classes-workshops', 12), ('business-networking', 13), ('health-wellness', 14),
               ('education', 15)) as g(slug, n)
 where c.slug = g.slug;

do $$
begin
  if (select count(*) from public.event_categories where guide_order between 1 and 15) <> 15
     or exists (select 1 from public.event_categories where guide_order > 15) then
    raise exception 'the guide must have exactly fifteen categories in guide_order 1 to 15';
  end if;
end $$;
