-- ===========================================================================
-- GA1 v3 DATABASE PROOF. The audience asset, exercised against the real TEST
-- database, and rolled back so nothing survives.
--
-- IT IS THE SECOND HALF OF THE PAIR. scripts/verify/ga1v3-consent-ledger-proof.sql
-- proves the LEDGER: append only, the resolver, both scopes, the rights. This
-- one proves what the ledger DRIVES: an audience row that cannot exist without
-- a live consent, composed from real orders, removed the moment consent goes,
-- and a reversal switch that is deliberately powerless in one direction.
--
-- WHAT CHANGED IN v3, and it is why every consent below is an INSERT into the
-- ledger rather than a row in marketing_consents: the audience refresh now asks
-- public.consent_permits, so a consent written straight into the current-state
-- table would compose nothing. That is the point of the rewrite, and a proof
-- that kept writing the old way would have gone on passing about a path the
-- platform no longer takes.
--
-- WHY THIS EXISTS BESIDE THE DRIVEN PROOF. Two of GA1's guarantees are things a
-- browser cannot show. The first is a REFUSAL: an audience row with consent
-- state false, or with empty consent wording, must be impossible, and the only
-- way to prove a database refuses something is to ask it to do it. The second is
-- a PAID confirmation, which is shown by confirming an order the way Stripe's
-- webhook confirms it, through `confirm_order`.
--
-- WITHDRAWN, 14 September 2026. This paragraph used to justify that by saying
-- "there is no working Stripe TEST secret key on this machine, so no browser
-- here can take a buyer past the payment step". THAT IS FALSE and it is
-- replaced rather than deleted, because it was quoted as settled fact in a
-- review queue and in two other proofs. The Stripe CLI's `[default]` profile
-- holds a TEST key for acct_1T8WBhGuiZ9cvxuu that answers /v1/balance, and
-- scripts/dev/lane-b-serve-with-stripe.mjs builds and serves with that
-- account's publishable key so a real card completes here.
--
-- The CHOICE stands, on a reason that was always the better one and did not
-- need the false premise: `confirm_order` is the single RPC both paths call, so
-- confirming directly proves the database rule under test without a browser and
-- without a card, which is what a .sql proof is for.
--
-- EVERY ROW IT CREATES CARRIES lane-b, and the whole thing runs inside one
-- transaction that ends in ROLLBACK. The last SELECT reports the verdicts and
-- its rows survive the rollback; the data does not.
--
-- Run:  supabase db query --linked -f scripts/verify/ga1v3-audience-asset-proof.sql --output-format json
-- ===========================================================================

begin;

create temp table ga1_proof(seq int, check_name text, verdict text, detail text) on commit drop;

do $$
declare
  v_event public.events%rowtype;
  v_tier_id uuid;
  v_email text := 'lane-b-ga1-proof@eventlinqs.test';
  v_email2 text := 'lane-b-ga1-declines@eventlinqs.test';
  v_order_a uuid := gen_random_uuid();
  v_order_b uuid := gen_random_uuid();
  v_row public.audience_members%rowtype;
  v_expected text[];
  v_n int;
  v_ok boolean;
  v_detail text;
  v_tenant uuid;
  v_wording text;
begin
  select id into v_tenant from public.marketing_tenants where slug = 'eventlinqs';
  select body into v_wording
    from public.consent_wordings
   where purpose = 'facilitated_event_marketing'
   order by effective_from desc
   limit 1;
  -- The event is ENUMERATED, never typed: the newest published event whose own
  -- tags resolve to at least one community through public.community_tag_map.
  select e.* into v_event
    from public.events e
   where e.status = 'published'
     and jsonb_typeof(e.tags) = 'array'
     and exists (
       select 1 from public.community_tag_map m
        where exists (select 1 from jsonb_array_elements_text(e.tags) t where t.value = any (m.tokens))
     )
   order by e.created_at desc
   limit 1;

  if v_event.id is null then
    insert into ga1_proof values (0, 'a community-tagged published event exists to buy from', 'FAIL',
      'no published event on this database carries a tag any community claims');
    return;
  end if;

  select id into v_tier_id from public.ticket_tiers where event_id = v_event.id order by price desc limit 1;

  insert into ga1_proof values (0, 'the event under test', 'INFO',
    format('%s, city %s, postcode %s, tags %s', v_event.slug, coalesce(v_event.city_primary, 'none'),
           coalesce(v_event.venue_postal_code, 'none'), v_event.tags::text));

  -- =========================================================================
  -- 1. AN AUDIENCE ROW CANNOT EXIST WITH CONSENT STATE FALSE.  GA1 point 4.
  -- =========================================================================
  begin
    insert into public.audience_members
      (email, consent_state, consent_at, consent_text, consent_version, consent_source,
       first_order_at, last_order_at, price_band)
    values ('lane-b-ga1-refused@eventlinqs.test', false, now(), 'anything', 'v1', 'proof',
            now(), now(), 'free');
    insert into ga1_proof values (1, 'an audience row for a subject the resolver refuses is refused', 'FAIL',
      'the row was accepted; the asset can hold somebody who never said yes');
  exception when check_violation then
    /*
     * NAMED FOR WHAT ACTUALLY REFUSED IT, which changed in v3 and would
     * otherwise have quietly become a half-truth. There are now TWO layers,
     * and the trigger is the outer one: it asks the resolver and raises before
     * the CHECK constraints are ever evaluated, so this is the message that
     * comes back. The consent_state CHECK is still on the table and is still
     * the last word; check 2b below reaches it by giving the subject a live
     * consent first, so both layers are proven rather than assumed.
     */
    insert into ga1_proof values (1, 'an audience row for a subject the resolver refuses is refused', 'PASS', sqlerrm);
  end;

  -- =========================================================================
  -- 2. AN AUDIENCE ROW CANNOT EXIST WITH EMPTY CONSENT WORDING.
  -- =========================================================================
  begin
    insert into public.audience_members
      (email, consent_state, consent_at, consent_text, consent_version, consent_source,
       first_order_at, last_order_at, price_band)
    values ('lane-b-ga1-refused2@eventlinqs.test', true, now(), '   ', 'v1', 'proof',
            now(), now(), 'free');
    insert into ga1_proof values (2, 'the same refusal fires for an unknown subject whatever else is wrong', 'FAIL',
      'the row was accepted; the evidence would say nothing');
  exception when check_violation then
    insert into ga1_proof values (2, 'the same refusal fires for an unknown subject whatever else is wrong', 'PASS', sqlerrm);
  end;

  -- =========================================================================
  -- 2b. AND THE WORDING CHECK IS STILL THE LAST WORD, reached by giving the
  --     subject a live consent so the resolver trigger lets the row through to
  --     the constraints. Without this the CHECK could have been dropped and
  --     nothing here would have noticed.
  -- =========================================================================
  insert into public.consent_events
    (tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
     capture_surface, third_party_scope, suppression_scope, occurred_at)
  values
    (v_tenant, 'lane-b-ga1-empty-wording@eventlinqs.test', 'facilitated_event_marketing', 'both',
     'granted', v_wording, 'v1', 'checkout', 'events ticketed on EventLinqs',
     'every EventLinqs facilitated message', now());
  begin
    insert into public.audience_members
      (email, consent_state, consent_at, consent_text, consent_version, consent_source,
       first_order_at, last_order_at, price_band)
    values ('lane-b-ga1-empty-wording@eventlinqs.test', true, now(), '   ', 'v1', 'proof',
            now(), now(), 'free');
    insert into ga1_proof values (3, 'empty consent wording is refused by the database', 'FAIL',
      'the row was accepted; the evidence would say nothing');
  exception when check_violation then
    insert into ga1_proof values (3, 'empty consent wording is refused by the database', 'PASS', sqlerrm);
  end;

  -- =========================================================================
  -- 3. A CONFIRMED ORDER WITH NO CONSENT CREATES NO AUDIENCE ROW.
  --    GA1 acceptance 2, read straight out of the database.
  -- =========================================================================
  insert into public.orders (id, event_id, organisation_id, order_number, status,
                             guest_email, guest_name, subtotal_cents, total_cents, reservation_id)
  values (v_order_a, v_event.id, v_event.organisation_id, 'EL-LANEBGA1', 'pending',
          v_email, 'lane-b GA1 proof', 5000, 5000, null);
  insert into public.order_items (order_id, item_name, item_type, ticket_tier_id, quantity,
                                  unit_price_cents, total_cents)
  values (v_order_a, 'lane-b GA1 proof ticket', 'ticket', v_tier_id, 2, 2500, 5000);

  update public.orders set status = 'confirmed', confirmed_at = now() where id = v_order_a;

  select count(*) into v_n from public.audience_members where email = v_email;
  insert into ga1_proof values (4, 'a confirmed order with no consent creates no audience row',
    case when v_n = 0 then 'PASS' else 'FAIL' end,
    format('%s audience row(s) for a buyer who was never asked', v_n));

  -- =========================================================================
  -- 4. THE DECLINE IS RECORDED, AND IT STILL CREATES NO AUDIENCE ROW.
  -- =========================================================================
  insert into public.consent_events
    (tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
     capture_surface, third_party_scope, suppression_scope, occurred_at)
  values
    (v_tenant, v_email2, 'facilitated_event_marketing', 'both', 'declined', v_wording, 'v1',
     'checkout', 'events ticketed on EventLinqs', 'every EventLinqs facilitated message', now());
  -- The projection follows the ledger, so the current-state table shows the
  -- decline too. Counted there deliberately: it is the table the rest of the
  -- platform reads, and if the trigger ever stopped writing it this would say so.
  select count(*) into v_n from public.marketing_consents where email = v_email2 and status = 'declined';
  insert into ga1_proof values (5, 'a decline is stored as declined and never enters the audience',
    case when v_n = 1 and not exists (select 1 from public.audience_members where email = v_email2)
         then 'PASS' else 'FAIL' end,
    format('%s declined consent row(s), %s audience row(s)', v_n,
           (select count(*) from public.audience_members where email = v_email2)));

  -- =========================================================================
  -- 5. THE GRANT, AND WHERE THE "A DECLINE CANNOT REVOKE A CONSENT" RULE NOW
  --    LIVES, WHICH IS NOT HERE ANY MORE AND IS WORTH SAYING OUT LOUD.
  --
  --    In the old shape the database held that rule, in an "on conflict do
  --    nothing". The ledger cannot: its whole semantics are that the LATEST
  --    event wins, so a declined event written after a grant genuinely does
  --    supersede it. That is correct for evidence and dangerous for a checkbox,
  --    so the rule moved into the application, which asks the resolver before
  --    it writes a decline at all
  --    (src/lib/consent/checkout-answer.ts, and the same rule in
  --    recordPlatformDigestDecline). It is proven by unit test rather than
  --    here, and this proof asserts the ledger semantics that make it
  --    necessary rather than pretending the database still guards it.
  -- =========================================================================
  insert into public.consent_events
    (tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
     capture_surface, third_party_scope, suppression_scope, occurred_at)
  values
    (v_tenant, v_email, 'facilitated_event_marketing', 'both', 'granted', v_wording, 'v1',
     'checkout', 'events ticketed on EventLinqs', 'every EventLinqs facilitated message', now());

  select status into v_detail from public.marketing_consents where email = v_email;
  insert into ga1_proof values (6, 'the grant projects into the current-state table as granted',
    case when v_detail = 'granted' then 'PASS' else 'FAIL' end,
    format('the projection says %s', coalesce(v_detail, 'nothing at all')));

  -- =========================================================================
  -- 6. THE CONSENT ARRIVING CREATES THE AUDIENCE ROW, WITH EVERY FIELD.
  --    (The ledger insert above fired trg_audience_on_consent_event.)
  -- =========================================================================
  select * into v_row from public.audience_members where email = v_email;
  insert into ga1_proof values (7, 'consent plus a confirmed order composes one audience row',
    case when v_row.email is not null then 'PASS' else 'FAIL' end,
    coalesce(format('order_count %s, lifetime %s cents, band %s, city %s, postcode %s, category %s',
      v_row.order_count, v_row.lifetime_spend_cents, v_row.price_band,
      coalesce(v_row.last_city_slug, 'none'), coalesce(v_row.postcode, 'none'),
      coalesce(v_row.last_category_slug, 'none')), 'no row'));

  -- =========================================================================
  -- 7. THE CONSENT WORDING IS STORED VERBATIM ON THE AUDIENCE ROW.
  -- =========================================================================
  insert into ga1_proof values (8, 'the exact consent wording and its version ride on the row',
    case when v_row.consent_text = v_wording
          and v_row.consent_version = 'v1'
          and v_row.consent_channel = 'email'
         then 'PASS' else 'FAIL' end,
    format('%L, version %L, channel %L', v_row.consent_text, v_row.consent_version, v_row.consent_channel));

  -- =========================================================================
  -- 8. THE COMMUNITY VALUE IS READ FROM THE DATABASE, not from any list.
  -- =========================================================================
  select coalesce(array_agg(distinct m.community_slug), '{}') into v_expected
    from public.community_tag_map m
   where exists (select 1 from jsonb_array_elements_text(v_event.tags) t where t.value = any (m.tokens));
  insert into ga1_proof values (9, 'the community value comes from community_tag_map and the event tags',
    case when v_row.community_slugs @> v_expected and v_expected @> v_row.community_slugs
         then 'PASS' else 'FAIL' end,
    format('row carries %s, the tags resolve to %s', v_row.community_slugs::text, v_expected::text));

  -- =========================================================================
  -- 9. THE PRICE BAND IS DERIVED FROM THE ORDER, per ticket, not per order.
  --    5000 cents over 2 tickets is 2500 each, which is 'under-30'.
  -- =========================================================================
  insert into ga1_proof values (10, 'the price band is the per-ticket band of the last order',
    case when v_row.price_band = 'under-30' then 'PASS' else 'FAIL' end,
    format('5000 cents over 2 tickets banded as %s', v_row.price_band));

  -- =========================================================================
  -- 10. A SECOND CONFIRMED ORDER MOVES THE AGGREGATES.
  -- =========================================================================
  insert into public.orders (id, event_id, organisation_id, order_number, status,
                             guest_email, guest_name, subtotal_cents, total_cents)
  values (v_order_b, v_event.id, v_event.organisation_id, 'EL-LANEBGA2', 'pending',
          v_email, 'lane-b GA1 proof', 24000, 24000);
  insert into public.order_items (order_id, item_name, item_type, ticket_tier_id, quantity,
                                  unit_price_cents, total_cents)
  values (v_order_b, 'lane-b GA1 proof ticket two', 'ticket', v_tier_id, 1, 24000, 24000);
  update public.orders set status = 'confirmed', confirmed_at = now() + interval '1 minute' where id = v_order_b;

  select * into v_row from public.audience_members where email = v_email;
  insert into ga1_proof values (11, 'a second confirmed order moves the count, the spend and the band',
    case when v_row.order_count = 2 and v_row.lifetime_spend_cents = 29000 and v_row.price_band = '200-plus'
         then 'PASS' else 'FAIL' end,
    format('order_count %s, lifetime %s cents, band %s', v_row.order_count, v_row.lifetime_spend_cents, v_row.price_band));

  -- =========================================================================
  -- 11. WITHDRAWING CONSENT REMOVES THEM FROM THE AUDIENCE, in the same
  --     transaction, with no application code involved.
  -- =========================================================================
  insert into public.consent_events
    (tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
     capture_surface, third_party_scope, suppression_scope, occurred_at)
  values
    (v_tenant, v_email, 'facilitated_event_marketing', 'both', 'withdrawn', v_wording, 'v1',
     'unsubscribe-token', 'events ticketed on EventLinqs', 'every EventLinqs facilitated message',
     now() + interval '2 minutes');
  insert into public.suppression_events
    (tenant_id, subject_email, channel, scope, reason, request_source, occurred_at)
  values
    (v_tenant, v_email, 'both', 'all_marketing', 'the person unsubscribed', 'unsubscribe-token',
     now() + interval '2 minutes');
  select count(*) into v_n from public.audience_members where email = v_email;
  insert into ga1_proof values (12, 'withdrawing consent removes the audience row',
    case when v_n = 0 then 'PASS' else 'FAIL' end,
    format('%s audience row(s) left after the withdrawal', v_n));

  -- =========================================================================
  -- 12. THE WITHDRAWAL IS IDEMPOTENT, and the first record cannot be disturbed
  --     even deliberately: the ledger refuses the UPDATE that would do it.
  -- =========================================================================
  select occurred_at::text into v_detail
    from public.consent_events
   where subject_email = v_email and decision = 'withdrawn'
   order by occurred_at desc limit 1;
  insert into public.suppression_events
    (tenant_id, subject_email, channel, scope, reason, request_source, occurred_at)
  values
    (v_tenant, v_email, 'both', 'all_marketing', 'the person pressed it again', 'unsubscribe-token',
     now() + interval '3 minutes');
  select count(*) into v_n from public.audience_members where email = v_email;
  insert into ga1_proof values (13, 'a second withdrawal changes nothing and leaves the evidence alone',
    case when v_n = 0
          and (select occurred_at::text from public.consent_events
                where subject_email = v_email and decision = 'withdrawn'
                order by occurred_at desc limit 1) = v_detail
         then 'PASS' else 'FAIL' end,
    format('still %s audience row(s), the withdrawal record unchanged at %s', v_n, v_detail));

  -- =========================================================================
  -- 13. RE-CONSENT PUTS THEM BACK. The exit is not a one-way door, and the
  --     latest event is what decides it.
  -- =========================================================================
  insert into public.consent_events
    (tenant_id, subject_email, purpose, channel_scope, decision, wording, wording_version,
     capture_surface, third_party_scope, suppression_scope, occurred_at)
  values
    (v_tenant, v_email, 'facilitated_event_marketing', 'both', 'granted', v_wording, 'v1',
     'checkout', 'events ticketed on EventLinqs', 'every EventLinqs facilitated message',
     now() + interval '4 minutes');
  select count(*) into v_n from public.audience_members where email = v_email;
  insert into ga1_proof values (14, 're-consenting puts a buyer back in the audience',
    case when v_n = 1 then 'PASS' else 'FAIL' end,
    format('%s audience row(s) after re-consent', v_n));

  -- =========================================================================
  -- 14. THE REVERSAL SWITCH STOPS CREATION AND CANNOT STOP A WITHDRAWAL.
  --     GA1's reversal condition, and the one place it is deliberately
  --     powerless: a flag may not keep somebody in a list they asked to leave.
  -- =========================================================================
  delete from public.audience_members where email = v_email;
  update public.feature_flags set enabled = false where flag = 'audience_capture';

  perform public.refresh_audience_member(v_email);
  select count(*) into v_n from public.audience_members where email = v_email;
  v_ok := v_n = 0;

  -- Put the row back with the switch ON, then withdraw with the switch OFF.
  update public.feature_flags set enabled = true where flag = 'audience_capture';
  perform public.refresh_audience_member(v_email);
  update public.feature_flags set enabled = false where flag = 'audience_capture';
  insert into public.suppression_events
    (tenant_id, subject_email, channel, scope, reason, request_source, occurred_at)
  values
    (v_tenant, v_email, 'both', 'all_marketing', 'unsubscribed while the switch was off',
     'unsubscribe-token', now() + interval '5 minutes');
  select count(*) into v_n from public.audience_members where email = v_email;

  insert into ga1_proof values (15, 'the switch stops creation and never blocks a withdrawal',
    case when v_ok and v_n = 0 then 'PASS' else 'FAIL' end,
    format('with the switch off, creation wrote %s row(s) and the withdrawal left %s row(s)',
           case when v_ok then 0 else 1 end, v_n));

  update public.feature_flags set enabled = true where flag = 'audience_capture';
end;
$$;

select seq, check_name, verdict, detail from ga1_proof order by seq;

rollback;
