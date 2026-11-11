-- NOTHING IN THE LISTING PATH GOES TO LAWAL: THE PUBLISH NOTICE TOO (WINDOW 5A, 10 November 2026).
--
-- PR #256 (main 2d91d180) ruled that nothing in the listing path goes to Lawal. The founder inbox still took an
-- 'Event published' email for every night the engine put up: production's platform_notifications held six
-- event_published rows in the 24 hours to 10 November 10:55, every one for the house organisation 'EventLinqs listings'
-- (slug eventlinqs-listings, LISTINGS_ORG_SLUG in src/lib/listings/collect-store.ts), and the platform-notify cron
-- emailed each one ('EventLinqs: Event published: PBS Fang It! Live', 10 November 05:11, and five more). The trigger
-- judged only the change of status, never whose night it was.
--
-- Now the trigger returns before recording anything when the event belongs to the house organisation, which is where
-- the engine's collected nights and every self-listed night are published (src/lib/listings/collect-store.ts and
-- self-listing-run.ts). An organiser's own publish is unchanged: still recorded, still emailed to the founder. The rest
-- of the function is 20260909000005's, word for word; the two triggers that call it are unchanged.
--
-- Guarded by tests/unit/notifications/listing-path-no-publish-notice.test.ts, which reads the newest definition of
-- this function in supabase/migrations and fails if the house organisation's early return is gone.

create or replace function public.notify_event_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $published$
declare
  v_org_name text;
  v_org_slug text;
  v_owner uuid;
  v_moment timestamptz := coalesce(new.published_at, now());
begin
  begin
    select o.name, o.slug, o.owner_id into v_org_name, v_org_slug, v_owner
      from public.organisations o
     where o.id = new.organisation_id;

    -- The house organisation's nights come from the listing path (the engine and self-listing): no founder notice.
    if v_org_slug = 'eventlinqs-listings' then
      return new;
    end if;

    perform public.record_platform_notification(
      'event_published',
      'event_published:' || new.id::text || ':' || to_char(v_moment at time zone 'UTC', 'YYYYMMDD"T"HH24MISS'),
      'Event published: ' || coalesce(new.title, 'untitled event'),
      '/admin/events/' || new.id::text,
      v_owner,
      new.organisation_id,
      new.id,
      null,
      null,
      v_org_name,
      new.title,
      jsonb_build_object(
        'slug', new.slug,
        'start_date', new.start_date,
        'city', coalesce(new.city_primary, new.venue_city),
        'event_type', new.event_type
      )
    );
  exception
    when others then
      begin
        perform public.record_platform_notification(
          'event_published',
          'event_published:' || new.id::text || ':' || to_char(v_moment at time zone 'UTC', 'YYYYMMDD"T"HH24MISS'),
          'Event published, details unavailable: ' || sqlerrm,
          '/admin/events/' || new.id::text,
          null,
          new.organisation_id,
          new.id
        );
      exception
        when others then
          raise warning '[platform_notifications] event_published not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$published$;
