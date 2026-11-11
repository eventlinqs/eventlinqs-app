-- INTERNAL SEARCHES, RECORDED FIRST PARTY (the PM's order 3 of 11 November 2026, addition 1, on Lawal's locked direction
-- of 00:56: "verify tracking for ... internal event searches", recorded "first party in EventLinqs' own tables"; WINDOW 5A).
--
-- One row per search a person typed and landed on /events with: the term, normalised (lower case, single spaces, at
-- most 80 characters), how many events it found, where it was searched, and when. Nothing else: no address, no user,
-- no session, no device string, no identifier and no cookie. A term that looks like an email address, a phone number
-- or a web address is never kept (src/lib/analytics/search-record.ts). Crawlers are refused before a row is written.
-- It is read by the service role alone and shown on no public page.
--
-- Inside the live rules: the privacy policy already names pages viewed and timestamps as technical information
-- collected, and a search is the page /events?q=<term>; this keeps the term and the count, and less than the address.

create table if not exists public.site_searches (
  id bigint generated always as identity primary key,
  searched_at timestamptz not null default now(),
  term text not null check (length(term) between 1 and 80 and term = lower(term)),
  results integer check (results is null or results >= 0),
  surface text not null check (surface in ('events'))
);

comment on table public.site_searches is
  'Internal searches, the normalised term and its result count only, no identifiers; internal only (PM order 3 of 11 November 2026, addition 1).';

create index if not exists site_searches_read on public.site_searches (searched_at desc);

-- Only the server records, after the page has answered, and only the service role reads; no visitor role reaches a row.
alter table public.site_searches enable row level security;
revoke all on public.site_searches from anon, authenticated, service_role;
grant select, insert on public.site_searches to service_role;
