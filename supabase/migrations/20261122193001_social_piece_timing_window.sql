-- THE MARKETING TIMING WINDOW ON EVERY SCHEDULE (Lawal, 19:13 of 22 November 2026, verbatim at
-- MARKETING-TIMING-22NOV.md; the PM's 19:13). A post must still be timely and useful at the minute it goes: each
-- schedule carries its objective, its latest acceptable publication time, its content expiry, its recovery policy and the
-- basis they were set on (src/lib/social/timing.ts, one function). Past its latest acceptable time a schedule becomes
-- EXPIRED with its reason, never published; expired is a final state, as published and held are. The posting row records
-- the objective, the window and the minutes from publication to the event's start, so timing is tuned on our own data.
-- Older rows keep null windows; the code reads a null window from the piece's own facts at claim time.

alter table public.social_piece_schedules add column if not exists objective text;
alter table public.social_piece_schedules add column if not exists latest_at timestamptz;
alter table public.social_piece_schedules add column if not exists expires_at timestamptz;
alter table public.social_piece_schedules add column if not exists recovery text;
alter table public.social_piece_schedules add column if not exists timing_basis text;

alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_objective_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_objective_check check (
  objective is null or objective in ('advance_sales', 'discovery', 'weekend_planning', 'booking_reminder', 'free_community', 'multi_day', 'recurring', 'live_coverage', 'post_event_highlight')
);
alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_recovery_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_recovery_check check (recovery is null or recovery in ('within_window', 'never'));
alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_timing_basis_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_timing_basis_check check (timing_basis is null or length(btrim(timing_basis)) between 3 and 500);
alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_window_order;
alter table public.social_piece_schedules add constraint social_piece_schedules_window_order check (latest_at is null or expires_at is null or latest_at <= expires_at);

-- EXPIRED, beside scheduled, published and held: a reason always, never a publication.
alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_state_check;
alter table public.social_piece_schedules add constraint social_piece_schedules_state_check check (state in ('scheduled', 'published', 'held', 'expired'));
alter table public.social_piece_schedules drop constraint if exists social_piece_schedules_state_is_whole;
alter table public.social_piece_schedules add constraint social_piece_schedules_state_is_whole check (
  (state = 'scheduled' and held_reason is null and published_ref is null and published_at is null)
  or (state = 'held' and held_reason is not null and published_ref is null and published_at is null)
  or (state = 'published' and held_reason is null and published_ref is not null and published_at is not null)
  or (state = 'expired' and held_reason is not null and published_ref is null and published_at is null)
);

comment on column public.social_piece_schedules.latest_at is
  'The latest acceptable publication time (src/lib/social/timing.ts): after it the schedule is expired at claiming, before submission and by the watchdog, never published.';
comment on column public.social_piece_schedules.expires_at is 'When the content itself stops being true or useful (timing.ts).';

-- The measure beside each publication (Lawal's 19:13, section 9).
alter table public.social_piece_postings add column if not exists objective text;
alter table public.social_piece_postings add column if not exists latest_at timestamptz;
alter table public.social_piece_postings add column if not exists minutes_before_start integer;
alter table public.social_piece_postings drop constraint if exists social_piece_postings_objective_check;
alter table public.social_piece_postings add constraint social_piece_postings_objective_check check (
  objective is null or objective in ('advance_sales', 'discovery', 'weekend_planning', 'booking_reminder', 'free_community', 'multi_day', 'recurring', 'live_coverage', 'post_event_highlight')
);

-- The expired count the measure reads (no new table, so no new grant; the service role already inserts and reads both
-- tables, and updates a schedule's state and reason, which is all expiry writes).
create index if not exists social_piece_schedules_expired_at on public.social_piece_schedules (created_at) where state = 'expired';
