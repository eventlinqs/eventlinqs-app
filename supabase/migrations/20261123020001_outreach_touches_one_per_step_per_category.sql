-- ONE LETTER PER STEP PER COMMUNICATION CATEGORY, NOT PER CONTACT (the PM's 23:56 of 22 November 2026; Lawal's 01:20 of
-- 23 November, item 9). Law 49's two letters to an organiser are two different communications: the photo permission
-- request (PERM) from T-28 and the free promotion offer (ACQ) from T-21 (src/lib/outreach/lifecycle-read.ts: "PERM and
-- ACQ are two letters, from two addresses (law 33), never mixed (law 24)"). The index of 28 October allowed one non void
-- letter per contact per step, whatever its category, so a permission letter sent at step 1 made the database refuse the
-- offer at step 1 for the same contact. At 01:30 on 23 November the run's own log named it, for all twelve organisers of
-- Monday's cohort: "That step is already drafted or sent for this contact." (outreach_touches_one_per_step). The index keeps
-- its name (crm.ts maps it to those words) and is scoped by category: still one step 1 ACQ letter and one step 1 PERM
-- letter per contact, never two of the same kind. It is looser than the index it replaces, so no existing row breaks it.
drop index if exists public.outreach_touches_one_per_step;
create unique index if not exists outreach_touches_one_per_step
  on public.outreach_touches (contact_id, coalesce(comms_category, ''), step)
  where state <> 'void';
