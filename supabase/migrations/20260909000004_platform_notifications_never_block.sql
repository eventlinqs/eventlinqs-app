-- ============================================================================
-- THE NOTIFICATION TRIGGER MAY NEVER BREAK THE THING IT IS WATCHING.
-- Close-out UX3. Corrects 20260909000002, found by driving it.
--
-- WHAT HAPPENED, and it is written down because the mistake is instructive.
-- 20260909000002 shipped notify_event_published reading `new.city`. There is no
-- `city` column on public.events: the columns are `venue_city` and, since the
-- city backfill, `city_primary`. plpgsql resolves a record field at RUNTIME, so
-- nothing complained at CREATE time, the migration applied cleanly, all 92
-- guards passed and the whole suite was green.
--
-- Then an organiser pressed Publish, and the platform answered:
--
--     Failed to create event: record "new" has no field "city"
--
-- THE EVENT COULD NOT BE CREATED AT ALL. A notification trigger, added so the
-- owner would hear about a published event, stopped events being published.
-- Caught by the driven proof at 1440 on 10 September 2026, on the first run
-- through the real wizard, which is exactly what a driven proof is for: every
-- static gate in this repository was green while it was true.
--
-- THE REAL DEFECT IS NOT THE COLUMN NAME. 20260909000002 put its exception
-- handler in record_platform_notification and reasoned, in its own header, that
-- this made the trigger unable to throw into a checkout. That reasoning was
-- wrong, and wrong in a way worth remembering: the ARGUMENTS to a function are
-- evaluated in the CALLER. jsonb_build_object(..., new.city) raises before
-- record_platform_notification is ever entered, so the handler inside it can
-- never see the fault. A safety net one frame too low is not a safety net.
--
-- SO EVERY TRIGGER FUNCTION NOW HANDLES ITS OWN FAULTS, and does it in three
-- steps rather than by swallowing:
--
--   1. record the full notification
--   2. if composing it raised, record a DEGRADED one instead: the same kind,
--      the same admin link, and the error text in the summary, so the owner is
--      still told the thing happened and can see that the detail is missing
--   3. if even that raised, warn to the Postgres log and let the state change
--      complete
--
-- The order matters. Swallowing alone would have turned this defect into a
-- silence, which is the failure UX3 exists to end. Blocking alone would turn a
-- typo into an outage on the money path. This does neither: the organiser's
-- event publishes, and the owner hears about it either way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A NEW ORGANISER ACCOUNT IS CREATED.
-- ---------------------------------------------------------------------------
create or replace function public.notify_organiser_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $organiser$
begin
  begin
    perform public.record_platform_notification(
      'organiser_created',
      'organiser_created:' || new.id::text,
      'New organiser: ' || coalesce(new.name, 'unnamed organisation'),
      '/admin/organisers/' || new.id::text,
      new.owner_id,
      new.id,
      null,
      null,
      coalesce(new.email, ''),
      new.name,
      null,
      jsonb_build_object('slug', new.slug, 'email', new.email, 'phone', new.phone)
    );
  exception
    when others then
      begin
        perform public.record_platform_notification(
          'organiser_created',
          'organiser_created:' || new.id::text,
          'New organiser, details unavailable: ' || sqlerrm,
          '/admin/organisers/' || new.id::text
        );
      exception
        when others then
          raise warning '[platform_notifications] organiser_created not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$organiser$;

-- ---------------------------------------------------------------------------
-- 2. STRIPE CONNECT ONBOARDING STARTED, AND CHARGES ENABLED.
-- ---------------------------------------------------------------------------
create or replace function public.notify_connect_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $connect$
begin
  if old.stripe_account_id is null and new.stripe_account_id is not null then
    begin
      perform public.record_platform_notification(
        'connect_onboarding_started',
        'connect_onboarding_started:' || new.id::text || ':' || new.stripe_account_id,
        'Stripe onboarding started: ' || coalesce(new.name, 'unnamed organisation'),
        '/admin/organisers/' || new.id::text,
        new.owner_id,
        new.id,
        null,
        null,
        coalesce(new.email, ''),
        new.name,
        null,
        jsonb_build_object(
          'stripe_account_id', new.stripe_account_id,
          'country', new.stripe_account_country
        )
      );
    exception
      when others then
        begin
          perform public.record_platform_notification(
            'connect_onboarding_started',
            'connect_onboarding_started:' || new.id::text || ':' || new.stripe_account_id,
            'Stripe onboarding started, details unavailable: ' || sqlerrm,
            '/admin/organisers/' || new.id::text
          );
        exception
          when others then
            raise warning '[platform_notifications] connect_onboarding_started not recorded for %: %', new.id, sqlerrm;
        end;
    end;
  end if;

  if coalesce(old.stripe_charges_enabled, false) = false
     and coalesce(new.stripe_charges_enabled, false) = true then
    begin
      perform public.record_platform_notification(
        'connect_charges_enabled',
        'connect_charges_enabled:' || new.id::text || ':' || coalesce(new.stripe_account_id, 'none'),
        'Stripe onboarding complete, charges enabled: ' || coalesce(new.name, 'unnamed organisation'),
        '/admin/organisers/' || new.id::text,
        new.owner_id,
        new.id,
        null,
        null,
        coalesce(new.email, ''),
        new.name,
        null,
        jsonb_build_object(
          'stripe_account_id', new.stripe_account_id,
          'payouts_enabled', new.stripe_payouts_enabled,
          'payout_status', new.payout_status
        )
      );
    exception
      when others then
        begin
          perform public.record_platform_notification(
            'connect_charges_enabled',
            'connect_charges_enabled:' || new.id::text || ':' || coalesce(new.stripe_account_id, 'none'),
            'Stripe charges enabled, details unavailable: ' || sqlerrm,
            '/admin/organisers/' || new.id::text
          );
        exception
          when others then
            raise warning '[platform_notifications] connect_charges_enabled not recorded for %: %', new.id, sqlerrm;
        end;
    end;
  end if;

  return new;
end;
$connect$;

-- ---------------------------------------------------------------------------
-- 3. AN EVENT IS PUBLISHED.
--
--    `city` becomes coalesce(city_primary, venue_city). city_primary is the
--    canonical city every discovery surface groups by, and venue_city is what
--    the organiser typed; the owner wants whichever exists, and preferring the
--    canonical one means the notification names the city the event will actually
--    appear under.
-- ---------------------------------------------------------------------------
create or replace function public.notify_event_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $published$
declare
  v_org_name text;
  v_owner uuid;
  v_moment timestamptz := coalesce(new.published_at, now());
begin
  begin
    select o.name, o.owner_id into v_org_name, v_owner
      from public.organisations o
     where o.id = new.organisation_id;

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
          '/admin/events/' || new.id::text
        );
      exception
        when others then
          raise warning '[platform_notifications] event_published not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$published$;

-- ---------------------------------------------------------------------------
-- 4. EVERY PAID ORDER.
-- ---------------------------------------------------------------------------
create or replace function public.notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $paid$
declare
  v_event_title text;
  v_org_name text;
begin
  begin
    select e.title into v_event_title from public.events e where e.id = new.event_id;
    select o.name into v_org_name from public.organisations o where o.id = new.organisation_id;

    perform public.record_platform_notification(
      'order_paid',
      'order_paid:' || new.id::text,
      'Paid order ' || new.order_number || ': ' || coalesce(v_event_title, 'an event'),
      '/admin/orders/' || new.id::text,
      new.user_id,
      new.organisation_id,
      new.event_id,
      new.id,
      coalesce(new.guest_email, ''),
      v_org_name,
      v_event_title,
      jsonb_build_object(
        'order_number', new.order_number,
        'total_cents', new.total_cents,
        'currency', new.currency,
        'platform_fee_cents', new.platform_fee_cents
      )
    );
  exception
    when others then
      begin
        perform public.record_platform_notification(
          'order_paid',
          'order_paid:' || new.id::text,
          'Paid order, details unavailable: ' || sqlerrm,
          '/admin/orders/' || new.id::text
        );
      exception
        when others then
          raise warning '[platform_notifications] order_paid not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$paid$;
