-- CITY FIRST, DIRECTIVE 2: THE GUIDE'S FIFTEEN CATEGORIES (the CONTROLLER's 1 November 2026 15:32; the model at
-- C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md section 3; the rules in src/lib/categories/classify.ts).
--
-- (1) The three the directive names that did not exist: Theatre and performing arts, Markets, Classes and workshops.
--     Markets, plays and workshops were filed under community, family or arts because there was nowhere else.
-- (2) guide_order (1 to 15) and guide_label (the directive's words) on event_categories. Existing names and slugs are
--     left exactly as they are, so no category page, URL or curated homepage pair changes; the ten categories outside
--     the fifteen keep guide_order null: they are secondary tags only, never a guide tile.
-- (3) event_secondary_categories: up to three per event, never the primary, each with the rule that set it.
-- (4) On events: category_assigned_by (organiser, reviewer, rule), category_rule (the rule's name) and category_review
--     (none, needed, done), so the coverage report can say why an event is in its category or in none.

insert into public.event_categories (slug, name, icon, is_active, sort_order)
select v.slug, v.name, v.icon, true, coalesce((select max(sort_order) from public.event_categories), 0) + v.n
  from (values ('theatre', 'Theatre and performing arts', 'drama', 1),
               ('markets', 'Markets', 'store', 2),
               ('classes-workshops', 'Classes and workshops', 'pencil-ruler', 3)) as v(slug, name, icon, n)
 where not exists (select 1 from public.event_categories c where c.slug = v.slug);

alter table public.event_categories add column if not exists guide_order integer;
alter table public.event_categories add column if not exists guide_label text;

update public.event_categories c
   set guide_order = g.n, guide_label = g.label
  from (values ('music', 1, 'Music and concerts'), ('nightlife', 2, 'Nightlife and DJs'), ('comedy', 3, 'Comedy'),
               ('theatre', 4, 'Theatre and performing arts'), ('festival', 5, 'Festivals and cultural events'),
               ('sports', 6, 'Sports'), ('food-drink', 7, 'Food and drink'), ('markets', 8, 'Markets'),
               ('arts-community', 9, 'Arts and exhibitions'), ('family', 10, 'Family and children'),
               ('community', 11, 'Community'), ('classes-workshops', 12, 'Classes and workshops'),
               ('business-networking', 13, 'Business and networking'), ('health-wellness', 14, 'Health and wellness'),
               ('education', 15, 'Education and talks')) as g(slug, n, label)
 where c.slug = g.slug;

do $fifteen$
begin
  if (select count(*) from public.event_categories where guide_order is not null) <> 15 then
    raise exception 'the guide must have exactly fifteen categories with a guide_order';
  end if;
end
$fifteen$;

create unique index if not exists event_categories_guide_order_unique on public.event_categories (guide_order) where guide_order is not null;

create table if not exists public.event_secondary_categories (
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null references public.event_categories (id) on delete restrict,
  assigned_by text not null check (assigned_by in ('organiser', 'reviewer', 'rule')),
  rule text,
  created_at timestamptz not null default now(),
  primary key (event_id, category_id)
);

create or replace function public.secondary_category_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.events e where e.id = new.event_id and e.category_id = new.category_id) then
    raise exception 'a secondary category is never the event''s primary';
  end if;
  if (select count(*) from public.event_secondary_categories s where s.event_id = new.event_id and s.category_id <> new.category_id) >= 3 then
    raise exception 'an event carries at most three secondary categories';
  end if;
  return new;
end
$$;

drop trigger if exists trg_secondary_category_rules on public.event_secondary_categories;
create trigger trg_secondary_category_rules before insert or update on public.event_secondary_categories
  for each row execute function public.secondary_category_rules();

alter table public.event_secondary_categories enable row level security;
drop policy if exists event_secondary_categories_read on public.event_secondary_categories;
create policy event_secondary_categories_read on public.event_secondary_categories for select using (true);
revoke all on table public.event_secondary_categories from anon, authenticated, service_role;
grant select on table public.event_secondary_categories to anon, authenticated;
grant select, insert, update, delete on table public.event_secondary_categories to service_role;
revoke all on function public.secondary_category_rules() from public, anon, authenticated;

alter table public.events add column if not exists category_assigned_by text
  check (category_assigned_by is null or category_assigned_by in ('organiser', 'reviewer', 'rule'));
alter table public.events add column if not exists category_rule text;
alter table public.events add column if not exists category_review text not null default 'none'
  check (category_review in ('none', 'needed', 'done'));

comment on column public.event_categories.guide_order is
  'City first: the place of this category among the guide''s fifteen (1 to 15); null means a secondary tag only, never a guide tile.';
comment on table public.event_secondary_categories is
  'City first: up to three secondary categories per event, never its primary, each with who or which rule set it.';
