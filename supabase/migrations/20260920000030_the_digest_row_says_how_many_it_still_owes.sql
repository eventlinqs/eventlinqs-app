begin;

-- ---------------------------------------------------------------------------
-- THE WEEKLY DIGEST'S AUDIT ROW COULD NOT TELL "WE WROTE TO EVERYONE" APART
-- FROM "WE STOPPED".
--
-- `public.digest_sends` carries one row per city per period and its unique
-- (city_slug, period_start) key is the cron's idempotence: a row exists, so the
-- period is done, so skip. That is correct only while the run that wrote the
-- row reached the end of the audience.
--
-- It did not. `src/app/api/cron/weekly-digest/route.ts` sent
-- `recipients.slice(0, MAX_RECIPIENTS_PER_RUN)`, 500 of them, and then wrote
-- this row with `recipient_count: sent`. The cron fires once a week
-- (`0 22 * * 3` in vercel.json), so the next fire read the row, answered
-- `skipped: 'already_sent_this_period'`, and every lawful recipient past the
-- five hundredth never received that week's email. The row recorded 500 and a
-- reader had no way to learn that the audience had been 900.
--
-- The cap itself is not the defect and is not removed: the whole loop runs
-- inside one function invocation and sends sequentially, so an unbounded run is
-- a timeout, and a timeout half way through is a period with no row at all.
-- The defect is that the truncation was SILENT and PERMANENT. Two columns make
-- it neither.
--
--   audience_count  how many lawful recipients the period actually resolved,
--                   so `recipient_count` can be read against something.
--   completed_at    null while the city's period still owes somebody an email.
--                   The cron skips a period only when this is set, and resumes
--                   from `recipient_count` when it is not.
--
-- THE TABLE IS NO LONGER WRITE-ONCE, and its comment is corrected to say so
-- rather than leaving the old word standing over new behaviour. A row is OPENED
-- when a city's send starts and CLOSED when its audience is covered.
-- ---------------------------------------------------------------------------

alter table public.digest_sends
  add column if not exists audience_count integer not null default 0;

alter table public.digest_sends
  add column if not exists completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- EVERY EXISTING ROW IS COMPLETE, AND THIS BACKFILL IS THE SAFETY CRITICAL
-- HALF OF THE MIGRATION.
--
-- Without it every historical row reads `completed_at is null`, which the new
-- cron understands as "this period still owes people an email". It would then
-- resume a period that had already gone out and mail those people a second
-- time. The old semantics were "a row means the send happened", so that is what
-- the backfill records, and `audience_count` is set to what the row knows.
-- ---------------------------------------------------------------------------
update public.digest_sends
   set completed_at = coalesce(completed_at, sent_at),
       audience_count = greatest(audience_count, recipient_count)
 where completed_at is null;

-- The row may never claim to have written to more people than were in the
-- audience. Sends can fail, so sent is at most the audience, never more.
alter table public.digest_sends
  drop constraint if exists digest_sends_sent_within_audience;
alter table public.digest_sends
  add constraint digest_sends_sent_within_audience
  check (recipient_count <= audience_count);

comment on table public.digest_sends is
  'One row per city per period for the weekly local digest, OPENED when that city''s send starts and CLOSED by completed_at when its whole audience has been written to. The unique (city_slug, period_start) key is the cron''s idempotence; completed_at is what makes the skip mean "finished" rather than "started". recipient_count is how many were sent to so far and is the resume point; audience_count is how many were lawfully in the audience.';

comment on column public.digest_sends.audience_count is
  'Lawful recipients this city and period resolved to, after consent, suppression and the ledger resolver. recipient_count is read against it.';

comment on column public.digest_sends.completed_at is
  'When the whole audience had been written to. Null means the run stopped at its per-invocation cap and the next run resumes at recipient_count.';

commit;
