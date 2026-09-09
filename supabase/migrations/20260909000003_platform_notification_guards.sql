-- ============================================================================
-- THE PROBE THAT PROVES THE OWNER'S NOTIFICATIONS CANNOT BE BYPASSED.
-- Close-out UX3, the guard half. Companion to 20260909000002.
--
-- WHY A SEPARATE OBJECT RATHER THAN A UNIT TEST. Nothing in lint, typecheck,
-- the suite or the build reads a database. A project where 20260909000002 was
-- never applied, or where somebody dropped one trigger by hand, would publish an
-- event and take a payment in complete silence, and every gate in this
-- repository would stay green while it happened. That is the exact failure UX3
-- exists to end, so the check has to ask the database.
--
-- Modelled on event_lifecycle_guards() (20260906000002), same shape and same
-- reasons: one read-only SECURITY DEFINER function answering a jsonb of named
-- booleans, granted to service_role and authenticated and never to anon, so the
-- guard asks with the service key the build already holds.
--
-- ORDER MATTERS IN THIS FILE. A LANGUAGE sql function body is parsed and its
-- references resolved at CREATE time, so the per-trigger helper is defined
-- before the aggregate that calls it. Written the other way round, this file
-- fails to apply with "function platform_trigger_on does not exist".
-- ============================================================================

-- The per-trigger test, extracted so the object below reads as a list of facts
-- rather than as six copies of one query.
create or replace function public.platform_trigger_on(p_trigger text, p_table text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $on$
  select exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = p_trigger and c.relname = p_table and not t.tgisinternal
  );
$on$;

create or replace function public.platform_notification_guards()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $guards$
  select jsonb_build_object(
    'table_present', exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'platform_notifications' and c.relkind = 'r'
    ),
    'rls_enabled', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'platform_notifications'
    ), false),
    'anon_cannot_read', not exists (
      select 1
        from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name = 'platform_notifications'
         and grantee in ('anon', 'authenticated')
    ),
    'dedupe_unique', exists (
      select 1 from pg_constraint con join pg_class c on c.oid = con.conrelid
       where c.relname = 'platform_notifications' and con.contype = 'u'
         and pg_get_constraintdef(con.oid) ilike '%(dedupe_key)%'
    ),
    'kind_enum_complete', (
      select coalesce(array_agg(e.enumlabel::text order by e.enumlabel), '{}') = array[
        'connect_charges_enabled', 'connect_onboarding_started', 'event_published',
        'order_paid', 'organiser_created'
      ]
        from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'platform_notification_kind'
    ),
    'state_enum_complete', (
      select coalesce(array_agg(e.enumlabel::text order by e.enumlabel), '{}') = array[
        'escalated', 'failed', 'held_for_digest', 'pending', 'sent'
      ]
        from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'platform_notification_state'
    ),
    'writer_is_security_definer', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'record_platform_notification' and p.prosecdef
    ),
    'trigger_organiser_created', public.platform_trigger_on('platform_notify_organiser_created', 'organisations'),
    'trigger_connect_transitions', public.platform_trigger_on('platform_notify_connect_transitions', 'organisations'),
    'trigger_event_published', public.platform_trigger_on('platform_notify_event_published', 'events'),
    'trigger_event_published_insert', public.platform_trigger_on('platform_notify_event_published_insert', 'events'),
    'trigger_order_paid', public.platform_trigger_on('platform_notify_order_paid', 'orders'),
    'trigger_order_paid_insert', public.platform_trigger_on('platform_notify_order_paid_insert', 'orders'),
    'triggers_enabled', not exists (
      select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where t.tgname like 'platform_notify%' and not t.tgisinternal and t.tgenabled = 'D'
    )
  );
$guards$;

comment on function public.platform_notification_guards() is
  'Close-out UX3: read-only proof that the five owner-notification triggers, the table, its RLS and its dedupe key are installed on this project. Read by scripts/guards/platform-notifications-installed.mjs.';

revoke all on function public.platform_notification_guards() from public;
revoke all on function public.platform_trigger_on(text, text) from public;
grant execute on function public.platform_notification_guards() to service_role, authenticated;
grant execute on function public.platform_trigger_on(text, text) to service_role, authenticated;
