-- A referential null is not an edit: outreach_touch_page_checked returns at once when contact_id is null.
--
-- 20261031053501 judges a touch by its contact, and outreach_touches.contact_id is set null when its contact is
-- deleted. That set-null update fires the trigger, which is the shape a-referential-null-is-not-an-edit refuses: a
-- parent delete judged by a trigger that has nothing to do with it. With no contact the lookup finds no row and the
-- refusal cannot raise, but the guard judges the shape, so the early return now names the column (the guard's own
-- second fix). Same function, same signature, same trigger; create or replace keeps its grants, no type changes.
-- Reversal: 20261031053501's body without the first early return.

create or replace function public.outreach_touch_page_checked()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  c public.organiser_contacts;
begin
  if new.contact_id is null then
    return new;
  end if;
  if new.state in ('held', 'void') then
    return new;
  end if;
  select * into c from public.organiser_contacts where id = new.contact_id;
  if c.basis = 'conspicuous_publication' and not c.no_marketing_statement_checked then
    raise exception 'refused: % has not been checked for a statement against messages; open the page, check it, then tick it before Sent.', c.published_on_url
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;
