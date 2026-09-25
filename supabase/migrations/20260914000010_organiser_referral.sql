-- ===========================================================================
-- PL1. THE ORGANISER REFERRAL, RECORDED ON THE ACCOUNT IT CREATED.
--
-- WHY A COLUMN AND NOT A JSONB KEY. `profiles.metadata` already carries the
-- first-touch referral record, which is the right home for the DETAIL: which
-- link, which source, at what time. This column answers a different question,
-- and it is the question the weekly line asks: how many of this week's
-- organisers came through another organiser. That is a GROUP BY across every
-- organiser on the platform, and a group by over a JSONB key is a scan of the
-- whole table. AN1 put its six arrival fields in columns for exactly this
-- reason and this follows it rather than inventing a second shape.
--
-- IT POINTS AT A PROFILE, NOT AN ORGANISATION. `organisations` already carries
-- `referred_by_organisation_id`, which records one business introducing
-- another and is the founding-invite path. This records one PERSON introducing
-- another, which is what an organiser's own referral link does: they paste it
-- into a group chat, and whoever signs up is theirs. A person may later create
-- an organisation, or three, or none.
--
-- ON DELETE SET NULL, because an account being removed must never take another
-- account with it, and a referral whose referrer is gone is still a true fact
-- about where the referred account came from minus the name.
--
-- Additive and reversible. Applied to TEST vkapkibzokmfaxqogypq from the lane B
-- worktree. Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

comment on column public.profiles.referred_by is
  'PL1. The profile whose referral link brought this account, decoded from the ref code on the link. Null for everybody who arrived any other way, which is most people.';

-- NOBODY REFERS THEMSELVES. It cannot happen through the product, because the
-- link is minted for a signed-in organiser and used by somebody who is not
-- signed in, and it is refused here anyway: a self-referral would be a free
-- credit in any scheme built on this column later, and a constraint is cheaper
-- than remembering.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_referred_by_is_somebody_else') then
    alter table public.profiles
      add constraint profiles_referred_by_is_somebody_else
      check (referred_by is null or referred_by <> id);
  end if;
end
$$;

-- The weekly line counts referred signups inside a window, which is a filter on
-- created_at with referred_by not null. Partial, because the column is null for
-- almost every row and an index over the nulls would be mostly air.
create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by, created_at desc)
  where referred_by is not null;

commit;
