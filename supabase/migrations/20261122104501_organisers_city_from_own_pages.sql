-- AN ORGANISER'S CITY FROM ITS OWN PAGES, WITH ITS SOURCE (the PM's 10:30 of 22 November 2026, item (a); Lawal's outreach
-- engine rebuild of 10:31, section 3: "Record location sources and confidence. Do not infer locations from unsupported
-- assumptions.").
--
-- THE DEFECT: that morning 150 of the 229 real organisers had no city by the three roads of src/lib/outreach/organiser-city.ts,
-- so the acquisition pool for Monday read 0 although four guide city organisers' own pages print where they are.
--
-- THE COLUMNS: the city slug the organiser's own page prints (its own address, or a 'based in' line), the page it was read
-- on, the words quoted, and the day; written by the basis pool (src/lib/outreach/basis-pool.ts) only from the organiser's
-- own site, read as organiser-city.ts's fifth road. A city never comes from a name alone.
--
-- Additive: four nullable columns on an existing table and a check on the slug's form; no drop, no delete. service_role
-- already holds UPDATE on public.organisers (read 22 November 2026), so no grant changes.

alter table public.organisers add column if not exists city_slug text;
alter table public.organisers add column if not exists city_source_url text;
alter table public.organisers add column if not exists city_quote text;
alter table public.organisers add column if not exists city_seen_on date;

do $go$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisers_city_slug_form' and conrelid = 'public.organisers'::regclass
  ) then
    alter table public.organisers
      add constraint organisers_city_slug_form
      check (city_slug is null or (city_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and city_source_url ~* '^https://' and city_seen_on is not null));
  end if;
end
$go$;

comment on column public.organisers.city_slug is 'The city the organiser''s own page prints (its address or a based in line), as a city slug; null when no own page says. Written by the basis pool.';
comment on column public.organisers.city_source_url is 'The organiser''s own page the city was read on (https).';
comment on column public.organisers.city_quote is 'The words on that page that place it, quoted.';
comment on column public.organisers.city_seen_on is 'The day the page was read.';
