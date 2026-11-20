-- THE SENDING WINDOW IS A STORED SETTING (law 44; Lawal, 21 November 2026, 01:08, through the PM's 01:09 of that day:
-- "The engine works from today. Every approved email, all the emails, go from today ... the emails go out today before
-- 9 am"). Organiser letters send every day from 08:00 to before 18:00 in the recipient's city, weekends included, until
-- the setting says otherwise. The sender (src/lib/outreach/sender.ts sendWindowOf) and the self queue read these three
-- columns; a row that holds a malformed window is never guessed at: the code keeps the default.
--   send_days: the ISO days of the week it sends on, 1 Monday to 7 Sunday;
--   send_from_hour, send_to_hour: from the first hour to before the last, in the recipient's city.
-- No table is created, so no grant changes (the columns take outreach_sender's own grants). Reversal: drop the three
-- columns; the code then keeps its default, every day, 08:00 to 18:00.

alter table public.outreach_sender
  add column if not exists send_days smallint[] not null default '{1,2,3,4,5,6,7}',
  add column if not exists send_from_hour smallint not null default 8,
  add column if not exists send_to_hour smallint not null default 18;

alter table public.outreach_sender
  add constraint outreach_sender_send_days_are_days check (cardinality(send_days) between 1 and 7 and send_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add constraint outreach_sender_send_hours_are_a_window check (send_from_hour between 0 and 23 and send_to_hour between 1 and 24 and send_from_hour < send_to_hour);

comment on column public.outreach_sender.send_days is 'The days organiser letters send on, ISO 1 Monday to 7 Sunday (law 44: every day).';
comment on column public.outreach_sender.send_from_hour is 'The first hour letters send in the recipient''s city (law 44: 8).';
comment on column public.outreach_sender.send_to_hour is 'Letters send before this hour in the recipient''s city (law 44: 18).';
