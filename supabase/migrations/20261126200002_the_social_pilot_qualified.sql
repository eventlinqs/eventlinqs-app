-- THE SOCIAL PILOT'S QUALIFIED CONTACTS (Lawal's ruling of 23:01 on 26 November 2026, law 31 section 2 narrowed: a direct
-- message sent by a person on Instagram or Facebook is eligible only to organisers the PM has qualified into the social
-- pilot, at most 20, each with a recorded business enquiry basis; EVENTLINQS-SOCIAL-ORGANISER-ENGINE-LOCKED-26NOV.md version
-- 2, section 4; the PM's car K lean, items K3 and K4). On the contact itself: when it was qualified, by whom, and the basis
-- in words (the route the organiser publishes for business enquiries, where it was seen). The database keeps the pilot to
-- 20 and to Instagram and Facebook contacts with a recorded page; a pilot message is then logged sent by hand on that
-- contact (outreach_touch_is_lawful already requires the sender, the time and a STOP line), never sent by software.

alter table public.organiser_contacts add column if not exists pilot_qualified_at timestamptz;
alter table public.organiser_contacts add column if not exists pilot_qualified_by uuid references auth.users (id) on delete set null;
alter table public.organiser_contacts add column if not exists pilot_basis text;

alter table public.organiser_contacts drop constraint if exists organiser_contacts_pilot_is_whole;
alter table public.organiser_contacts add constraint organiser_contacts_pilot_is_whole check (
  pilot_qualified_at is null
  or (
    channel in ('instagram', 'facebook')
    and pilot_qualified_by is not null
    and published_on_url is not null
    and length(trim(coalesce(pilot_basis, ''))) between 20 and 600
  )
);

create or replace function public.organiser_contacts_pilot_at_most_twenty()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.pilot_qualified_at is not null and (tg_op = 'INSERT' or old.pilot_qualified_at is null) then
    if (select count(*) from public.organiser_contacts where pilot_qualified_at is not null and id <> new.id) >= 20 then
      raise exception 'refused: the social pilot holds at most 20 qualified contacts (Lawal, 26 November 2026, 23:01).' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_organiser_contacts_pilot_at_most_twenty on public.organiser_contacts;
create trigger trg_organiser_contacts_pilot_at_most_twenty
  before insert or update of pilot_qualified_at on public.organiser_contacts
  for each row execute function public.organiser_contacts_pilot_at_most_twenty();

comment on column public.organiser_contacts.pilot_basis is 'The business enquiry basis for the social pilot, in words: the route the organiser publishes for business enquiries and where it was seen.';

-- A FIRST MESSAGE OR FOLLOW UP ON INSTAGRAM OR FACEBOOK IS FOR THE PILOT ONLY (law 31 narrowed, Lawal 26 November 2026,
-- 23:01): an acquisition cadence message to an Instagram or Facebook contact is drafted, queued or recorded sent only when
-- that contact is qualified into the pilot, and the record sent keeps the pilot basis beside the basis it relied on. A reply
-- to an organiser who wrote to us, a permission request and every other class are untouched. Named to fire after
-- trg_outreach_touch_takes_its_class (triggers of one event fire in name order), so the class it reads is the one written.
create or replace function public.outreach_touch_wants_its_pilot_place()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.organiser_contacts;
begin
  if new.purpose <> 'cadence' or new.state not in ('held', 'queued', 'sending', 'sent') or coalesce(new.comms_category, 'ACQ') <> 'ACQ' then
    return new;
  end if;
  select * into c from public.organiser_contacts where id = new.contact_id;
  if c.channel not in ('instagram', 'facebook') then
    return new;
  end if;
  if c.pilot_qualified_at is null then
    raise exception 'refused: a message on Instagram or Facebook goes only to an organiser qualified into the social pilot, with its business enquiry basis recorded (law 31, Lawal 26 November 2026, 23:01).' using errcode = '23514';
  end if;
  if new.state = 'sent' then
    new.basis_at_send := coalesce(new.basis_at_send, '{}'::jsonb) || jsonb_build_object(
      'pilot_basis', c.pilot_basis, 'pilot_qualified_at', c.pilot_qualified_at, 'pilot_qualified_by', c.pilot_qualified_by);
  end if;
  return new;
end
$$;

drop trigger if exists trg_outreach_touch_wants_its_pilot_place on public.outreach_touches;
create trigger trg_outreach_touch_wants_its_pilot_place
  before insert or update on public.outreach_touches
  for each row execute function public.outreach_touch_wants_its_pilot_place();
