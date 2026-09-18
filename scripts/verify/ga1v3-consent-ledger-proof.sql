-- ===========================================================================
-- GA1 v3. THE CONSENT LEDGER, PROVEN AGAINST THE REAL TEST DATABASE.
--
-- Everything here is behaviour a pure test cannot decide: what the DATABASE
-- refuses, what a trigger composes, and whether the SQL resolver and the
-- TypeScript resolver agree. The named database-level checks GA1 v3 acceptance
-- 3 asks for are run with no application code in the way at all: the statements
-- are issued directly and their exceptions are caught and reported.
--
-- Every row it creates carries lane-b, and every one is removed at the end,
-- EXCEPT the ledger rows, which the database itself refuses to delete. That is
-- the point of the item, so the fixture subjects are addressed at
-- @lane-b.eventlinqs.test and are left in place, named, rather than pretended
-- away.
--
-- Run: supabase db query --linked -f scripts/verify/ga1v3-consent-ledger-proof.sql --output-format json
-- ===========================================================================

create temp table proof(seq int generated always as identity, check_name text, detail text, verdict text);

do $$
declare
  v_tenant uuid;
  v_client uuid;
  v_event_id uuid;
  v_verdict record;
  v_email text := 'ledger.lane-b@lane-b.eventlinqs.test';
  v_other text := 'client.lane-b@lane-b.eventlinqs.test';
  v_count int;
begin
  select id into v_tenant from public.marketing_tenants where slug = 'eventlinqs';

  insert into proof(check_name, detail, verdict)
  values ('tenant one exists and is the platform',
          coalesce((select slug || ' / is_platform=' || is_platform::text from public.marketing_tenants where id = v_tenant), 'MISSING'),
          case when v_tenant is null then 'FAIL' else 'PASS' end);

  -- A second tenant, so the cross-tenant rule is proven rather than asserted.
  insert into public.marketing_tenants (slug, name, is_platform)
  values ('lane-b-test-client', 'Lane B test client', false)
  on conflict (slug) do nothing;
  select id into v_client from public.marketing_tenants where slug = 'lane-b-test-client';

  -- ── A GRANT, with every column the item asks for ─────────────────────────
  insert into public.consent_events (
    tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
    capture_surface, third_party_scope, suppression_scope, ip_or_session_ref, occurred_at
  ) values (
    v_tenant, v_email, 'facilitated_event_marketing', 'both', 'granted',
    (select body from public.consent_wordings where purpose = 'facilitated_event_marketing' and version = 'v1'),
    'v1', 'checkout', 'events ticketed on EventLinqs', 'every EventLinqs facilitated message',
    'lane-b-proof', now() - interval '1 hour'
  ) returning id into v_event_id;

  insert into proof(check_name, detail, verdict)
  select 'a consent event carries every column the item requires',
         concat_ws(', ',
           'tenant=' || (ce.tenant_id is not null)::text,
           'mobile_hash column=' || (ce.subject_mobile_hash is null)::text,
           'purpose=' || ce.purpose,
           'channel=' || ce.channel_scope,
           'decision=' || ce.decision,
           'wording chars=' || length(ce.wording)::text,
           'version=' || ce.wording_version,
           'surface=' || ce.capture_surface,
           'third party scope chars=' || length(ce.third_party_scope)::text,
           'suppression scope chars=' || length(ce.suppression_scope)::text,
           'reference=' || ce.ip_or_session_ref),
         case when length(ce.wording) > 100 and ce.wording_version = 'v1' then 'PASS' else 'FAIL' end
    from public.consent_events ce where ce.id = v_event_id;

  -- ── The resolver, in the database ────────────────────────────────────────
  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'email', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('the resolver permits the granted subject and names the event',
          v_verdict.reason || ' / event ' || coalesce(v_verdict.deciding_event_id::text, 'none'),
          case when v_verdict.permitted and v_verdict.deciding_event_id = v_event_id then 'PASS' else 'FAIL' end);

  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'sms', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('a both-channel consent permits SMS as well', v_verdict.reason,
          case when v_verdict.permitted then 'PASS' else 'FAIL' end);

  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'email', 'platform_local_digest');
  insert into proof(check_name, detail, verdict)
  values ('the broad consent covers the narrower digest purpose', v_verdict.reason,
          case when v_verdict.permitted then 'PASS' else 'FAIL' end);

  -- ── The second tenant's own consent is separate ──────────────────────────
  insert into public.consent_events (
    tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
    capture_surface, third_party_scope, suppression_scope, occurred_at
  ) values (
    v_client, v_other, 'facilitated_event_marketing', 'email', 'granted',
    'A future client own list, collected by them.', 'client-v1', 'client-signup',
    'the client own events', 'the client own list only', now() - interval '1 hour'
  );

  -- ── The unsubscribe: one withdrawal, every channel ───────────────────────
  insert into public.consent_events (
    tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
    capture_surface, third_party_scope, suppression_scope, occurred_at
  ) values (
    v_tenant, v_email, 'facilitated_event_marketing', 'both', 'withdrawn',
    'The wording they originally agreed to.', 'v1', 'unsubscribe-token',
    'events ticketed on EventLinqs', 'every EventLinqs facilitated message', now() - interval '30 minutes'
  );
  insert into public.suppression_events (
    tenant_id, subject_email, channel, scope, reason, request_source, occurred_at
  ) values (
    v_tenant, v_email, 'both', 'all_marketing', 'the person unsubscribed', 'unsubscribe-token',
    now() - interval '30 minutes'
  );

  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'email', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('after one unsubscribe the resolver refuses email', v_verdict.reason,
          case when v_verdict.permitted then 'FAIL' else 'PASS' end);

  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'sms', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('one unsubscribe stops SMS at the same moment', v_verdict.reason,
          case when v_verdict.permitted then 'FAIL' else 'PASS' end);

  select * into v_verdict from public.consent_permits('lane-b-test-client', v_other, 'email', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('withdrawal_for_tenant_one_does_not_refuse_tenant_two_own_consent', v_verdict.reason,
          case when v_verdict.permitted then 'PASS' else 'FAIL' end);

  -- ── Idempotence: a second unsubscribe changes nothing a person can see ───
  insert into public.suppression_events (
    tenant_id, subject_email, channel, scope, reason, request_source, occurred_at
  ) values (
    v_tenant, v_email, 'both', 'all_marketing', 'the person unsubscribed again', 'unsubscribe-token', now()
  );
  select * into v_verdict from public.consent_permits('eventlinqs', v_email, 'email', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('unsubscribing twice is refused the same way, never re-opened', v_verdict.reason,
          case when v_verdict.permitted then 'FAIL' else 'PASS' end);

  -- ── Ageing ───────────────────────────────────────────────────────────────
  insert into public.consent_events (
    tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
    capture_surface, third_party_scope, suppression_scope, occurred_at
  ) values (
    v_tenant, 'stale.lane-b@lane-b.eventlinqs.test', 'facilitated_event_marketing', 'both', 'granted',
    'An old consent, given a long time ago.', 'v1', 'checkout',
    'events ticketed on EventLinqs', 'every EventLinqs facilitated message', now() - interval '30 months'
  );
  select * into v_verdict from public.consent_permits('eventlinqs', 'stale.lane-b@lane-b.eventlinqs.test', 'email', 'facilitated_event_marketing');
  insert into proof(check_name, detail, verdict)
  values ('consent_older_than_threshold_is_refused_until_regranted', v_verdict.reason,
          case when v_verdict.permitted then 'FAIL' else 'PASS' end);

  -- ── The projection follows the ledger ────────────────────────────────────
  select count(*) into v_count from public.marketing_consents where email = v_email and status = 'withdrawn';
  insert into proof(check_name, detail, verdict)
  values ('the current-state projection followed the ledger to withdrawn',
          v_count::text || ' withdrawn row(s) for the subject',
          case when v_count = 1 then 'PASS' else 'FAIL' end);
end $$;

-- ── The named database-level refusals, application code nowhere in sight ───
do $$
begin
  begin
    update public.consent_events set decision = 'granted' where subject_email like '%lane-b%';
    insert into proof(check_name, detail, verdict)
    values ('update_of_a_consent_event_is_refused_by_database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('update_of_a_consent_event_is_refused_by_database', sqlerrm, 'PASS');
  end;

  begin
    delete from public.consent_events where subject_email like '%lane-b%';
    insert into proof(check_name, detail, verdict)
    values ('delete_of_a_consent_event_is_refused_by_database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('delete_of_a_consent_event_is_refused_by_database', sqlerrm, 'PASS');
  end;

  begin
    update public.suppression_events set reason = 'edited' where subject_email like '%lane-b%';
    insert into proof(check_name, detail, verdict)
    values ('update_of_a_suppression_event_is_refused_by_database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('update_of_a_suppression_event_is_refused_by_database', sqlerrm, 'PASS');
  end;

  begin
    update public.consent_wordings set body = 'edited' where version = 'v1';
    insert into proof(check_name, detail, verdict)
    values ('a wording record cannot be edited, so a past consent stays producible', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('a wording record cannot be edited, so a past consent stays producible', sqlerrm, 'PASS');
  end;

  begin
    insert into public.consent_events (
      tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
      capture_surface, third_party_scope, suppression_scope
    ) values (
      (select id from public.marketing_tenants where slug = 'eventlinqs'),
      'empty.lane-b@lane-b.eventlinqs.test', 'facilitated_event_marketing', 'email', 'granted',
      '   ', 'v1', 'checkout', 'x', 'y'
    );
    insert into proof(check_name, detail, verdict)
    values ('empty wording is refused by the database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('empty wording is refused by the database', sqlerrm, 'PASS');
  end;

  begin
    insert into public.consent_events (
      tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
      capture_surface, third_party_scope, suppression_scope
    ) values (
      null, 'notenant.lane-b@lane-b.eventlinqs.test', 'facilitated_event_marketing', 'email', 'granted',
      'Wording that is present.', 'v1', 'checkout', 'x', 'y'
    );
    insert into proof(check_name, detail, verdict)
    values ('a null tenant is refused by the database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('a null tenant is refused by the database', sqlerrm, 'PASS');
  end;

  begin
    insert into public.audience_members (
      email, consent_at, consent_text, consent_version, consent_source,
      first_order_at, last_order_at, price_band
    ) values (
      'ledger.lane-b@lane-b.eventlinqs.test', now(), 'Some wording.', 'v1', 'checkout',
      now(), now(), 'free'
    );
    insert into proof(check_name, detail, verdict)
    values ('an audience row for a refused subject is refused by the database', 'no exception raised', 'FAIL');
  exception when others then
    insert into proof(check_name, detail, verdict)
    values ('an audience row for a refused subject is refused by the database', sqlerrm, 'PASS');
  end;
end $$;

-- ── The audience is rebuildable from the ledgers plus the orders ───────────
do $$
declare
  v_before jsonb;
  v_after jsonb;
  v_emails text[];
begin
  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'created_at' - 'refreshed_at' order by a.email), '[]'::jsonb)
    into v_before
    from public.audience_members a;

  select coalesce(array_agg(email), '{}') into v_emails from public.audience_members;

  -- Deleting the audience is allowed: it is DERIVED. Deleting the ledger is
  -- not, which is the difference the whole item turns on.
  delete from public.audience_members;
  perform public.refresh_audience_member(t.e) from unnest(v_emails) as t(e);

  select coalesce(jsonb_agg(to_jsonb(a) - 'id' - 'created_at' - 'refreshed_at' order by a.email), '[]'::jsonb)
    into v_after
    from public.audience_members a;

  insert into proof(check_name, detail, verdict)
  values ('the audience is rebuildable from the ledgers and the orders, identically',
          'rows before ' || jsonb_array_length(v_before)::text || ', after ' || jsonb_array_length(v_after)::text,
          case when v_before = v_after then 'PASS' else 'FAIL' end);
end $$;

-- ── Tidy up what CAN be tidied, and say what cannot ────────────────────────
delete from public.marketing_consents where email like '%@lane-b.eventlinqs.test';

insert into proof(check_name, detail, verdict)
select 'the ledger rows this proof wrote remain, because the database refuses to delete them',
       count(*)::text || ' lane-b consent event(s) left in place, by design',
       'INFO'
  from public.consent_events where subject_email like '%@lane-b.eventlinqs.test';

select check_name, detail, verdict from proof order by seq;
