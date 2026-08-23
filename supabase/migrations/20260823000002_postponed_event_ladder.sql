-- The postponed-event ladder (founder brief, 2026-08-23).
--
-- THE GAP THIS CLOSES, measured in the code before it was written:
--
--   1. REFUNDS. src/lib/refunds/policy.ts overrides the organiser's policy for a
--      CANCELLED event ("event_cancelled_always_refundable") and has no branch
--      at all for a POSTPONED one. A postponed event therefore fell through to
--      the ordinary policy, so an organiser on `no_refunds` refused the refund,
--      and an organiser on `days_before` refused it too because the window is
--      measured from a start date that has already passed.
--
--   2. PAYOUTS. findDisbursableEvents() in src/lib/payments/event-transfer.ts
--      selects `end_date <= now - buffer` and does not select `events.status`
--      at all, so it cannot filter on it. A postponed event was therefore paid
--      out to the organiser as soon as its ORIGINAL end date passed, while the
--      buyer's refund right was still unresolved.
--
-- WHAT THE COMPETITORS DO, cited, because this was researched and not assumed
-- (Law 7, all fetched 2026-08-23):
--
--   Eventbrite's Postponed Event Policy
--   https://www.eventbrite.com/help/en-us/articles/169121/eventbrites-postponed-event-policy/
--     Escalating obligation: 0-90 days after postponement the organiser may
--     refund "at their own discretion"; 91-135 days they are "required to honor
--     attendee refund requests"; 136+ days they must refund on request until the
--     event is rescheduled. "Cancelled" is DEFINED as not rescheduled within 90
--     days. On payout: "When an event is postponed, Eventbrite holds the event
--     payout", and payouts are not sent until either the event completes or the
--     rescheduled details are updated AND communicated.
--
--   Ticketmaster Australia Purchase Policy, clause 6.3
--   https://www.ticketmaster.com.au/h/purchase.html
--     On a reschedule the tickets stay valid for the new date, and a refund is
--     available only if the buyer notifies before a deadline that is "a
--     reasonable period from the time the rescheduled event date is announced".
--     Silence is "deemed to be a reconfirmation". And, plainly: "no refunds will
--     be available until the new date is announced".
--
--   ACCC, Buying tickets to events
--   https://www.accc.gov.au/consumers/buying-products-and-services/buying-tickets-to-events
--     "Where the event organiser chooses to cancel or makes a major change to an
--     event, consumers are entitled to a refund under their consumer rights."
--
-- WHY WE DO NOT COPY EVENTBRITE'S FIRST RUNG. Eventbrite gives the organiser 90
-- days of DISCRETION before refunds become obligatory. That is a United States
-- policy. In Australia the consumer-guarantee entitlement attaches to the major
-- change itself, not to a countdown, and an indefinite postponement with no
-- replacement date is the clearest major change there is. Importing the 90-day
-- discretion window would mean refusing a refund an Australian buyer may already
-- be entitled to, and doing so with a US help-centre article as the excuse.
--
-- So EventLinqs is DELIBERATELY STRONGER than both at the first rung, and this
-- is a wedge worth saying out loud: from the moment an event is postponed with
-- no new date, the buyer can have their money back, whatever the organiser's
-- refund policy says. Ticketmaster AU's own words are that no refund is
-- available until a new date is announced; ours is the opposite.
--
-- THE LADDER THIS TABLE MAKES POSSIBLE:
--   A. postponed, no new date  -> refunds always granted, payout HELD
--   B. rescheduled             -> tickets valid for the new date, refunds still
--                                 available for a published window measured from
--                                 the announcement, payout RELEASED
--   C. postponed 90+ days      -> the event is a cancellation in all but name
--                                 (Eventbrite's own definition), refunds stay
--                                 mandatory, payout stays HELD
--
-- Additive and reversible. Three nullable columns and one partial index. No
-- existing row is read or rewritten, no payment column is touched, and every
-- existing event keeps behaving exactly as it does today until an organiser
-- postpones something.
--
-- Apply with `supabase db push --linked` from PowerShell, TEST project only.
-- NEVER the Dashboard SQL editor, NEVER the Supabase MCP.

begin;

alter table public.events
  add column if not exists postponed_at timestamptz,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists previous_start_date timestamptz;

comment on column public.events.postponed_at is
  'When this event was announced as postponed. NULL unless the event is, or has been, postponed. The refund ladder and the payout hold are both measured from this instant, never from the original start date, because the original start date stops being meaningful the moment the event is moved.';

comment on column public.events.rescheduled_at is
  'When a new date was set and communicated for a previously postponed event. Eventbrite releases a held payout on exactly this condition ("rescheduled event details have been updated ... and communicated to attendees"), and Ticketmaster AU measures its refund deadline from this instant. NULL while the event is postponed with no new date.';

comment on column public.events.previous_start_date is
  'The start date this event was originally scheduled for, preserved when it is rescheduled. Two uses: the buyer can see what they actually bought, and it is the value Google REQUIRES for a rescheduled event. Google: "If you add previousStartDate, you must also add the eventStatus property and set the eventStatus to EventRescheduled." Without this column the event page could never emit a compliant rescheduled event.';

-- The payout hold and the 90-day escalation both need "every event currently
-- postponed", which is a small slice of a large table. A partial index keeps
-- that lookup cheap without carrying a row for the overwhelming majority of
-- events that have never been postponed.
create index if not exists events_postponed_at_idx
  on public.events (postponed_at)
  where postponed_at is not null;

commit;
