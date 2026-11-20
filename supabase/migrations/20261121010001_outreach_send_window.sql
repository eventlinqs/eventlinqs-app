-- THE SENDING WINDOW IS A STORED SETTING (law 44; Lawal, 21 November 2026, 01:16, through the PM's 01:17 of that day,
-- quoted: "Monday to Saturday we are sending ... Sunday is off ... You send my emails before the start of work hours.
-- Every outreach must go out no, never between nine to five ... every communication is published as early as six AM").
-- Organiser letters send Monday to Saturday, from 06:00 and out before 09:00 in the recipient's city; never on a Sunday
-- (the engine plans the week), never inside working hours. The sender (src/lib/outreach/sender.ts sendWindowOf) and the
-- self queue read these three columns; a row holding a malformed window is never guessed at: the code keeps the default.
--   send_days: the ISO days of the week it sends on, 1 Monday to 7 Sunday;
--   send_from_minute, send_until_minute: from that minute of the day to before the last, in the recipient's city.
-- No table is created, so no grant changes (the columns take outreach_sender's own grants). Reversal: drop the three
-- columns; the code then keeps its default, Monday to Saturday, 06:00 to 09:00.

alter table public.outreach_sender
  add column if not exists send_days smallint[] not null default '{1,2,3,4,5,6}',
  add column if not exists send_from_minute smallint not null default 360,
  add column if not exists send_until_minute smallint not null default 540;

alter table public.outreach_sender
  add constraint outreach_sender_send_days_are_days check (cardinality(send_days) between 1 and 7 and send_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add constraint outreach_sender_send_minutes_are_a_window check (send_from_minute between 0 and 1439 and send_until_minute between 1 and 1440 and send_from_minute < send_until_minute);

comment on column public.outreach_sender.send_days is 'The days organiser letters send on, ISO 1 Monday to 7 Sunday (law 44: Monday to Saturday; Sunday is off).';
comment on column public.outreach_sender.send_from_minute is 'The first minute of the day letters send in the recipient''s city (law 44: 360, 06:00).';
comment on column public.outreach_sender.send_until_minute is 'Letters send before this minute of the day in the recipient''s city (law 44: 540, 09:00).';
