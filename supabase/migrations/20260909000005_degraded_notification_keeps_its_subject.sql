-- ============================================================================
-- A DEGRADED NOTIFICATION STILL KNOWS WHAT IT IS ABOUT. Close-out UX3.
-- Refines 20260909000004, found by drilling it.
--
-- WHAT THE DRILL SHOWED. 20260909000004 wraps every trigger function so that a
-- fault while COMPOSING a notification cannot break the state change it is
-- watching. Driven on TEST on 10 September 2026 by deliberately reinstalling the
-- `new.city` defect and publishing an event through the real wizard:
--
--     ux3.event.published   PASS   the event went live
--     platform_notifications  ->   "Event published, details unavailable:
--                                   record "new" has no field "city""
--
-- So the guarantee holds: the organiser publishes, and the owner is still told.
--
-- WHAT IT ALSO SHOWED. The fallback passed only four arguments, so the degraded
-- row carried NULL for event_id, organisation_id and order_id. The admin_path
-- still pointed at the right record, so a person could click through, but the row
-- could not be JOINED to its subject: a query for "every notification about this
-- event" would miss it, and the admin feed could not group it. That is a
-- notification that knows less than it easily could.
--
-- The ids come straight off the trigger's own NEW record. `new.id` is the
-- primary key and `new.event_id` / `new.organisation_id` are plain columns of the
-- table the trigger is attached to, so reading them cannot be the thing that
-- raised: whatever failed was in the derived detail, the lookups or the jsonb.
-- Passing them costs nothing and cannot reintroduce the fault.
--
-- Only the fallback branches change. The primary branches are byte for byte the
-- ones 20260909000004 installed.
-- ============================================================================

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
          '/admin/organisers/' || new.id::text,
          null,
          new.id
        );
      exception
        when others then
          raise warning '[platform_notifications] organiser_created not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$organiser$;

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
            '/admin/organisers/' || new.id::text,
            null,
            new.id
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
            '/admin/organisers/' || new.id::text,
            null,
            new.id
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
          '/admin/orders/' || new.id::text,
          null,
          new.organisation_id,
          new.event_id,
          new.id
        );
      exception
        when others then
          raise warning '[platform_notifications] order_paid not recorded for %: %', new.id, sqlerrm;
      end;
  end;
  return new;
end;
$paid$;
