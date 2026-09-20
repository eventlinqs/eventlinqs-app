-- ===========================================================================
-- LB-OVERRIDE0. THE FOUNDER'S ONLY CONTROL OVER THE PLATFORM FEE COULD NOT
-- SAVE ANYTHING, AND THE DATABASE HAD ALREADY WRITTEN DOWN WHY.
--
-- uq_pricing_rules_one_open_per_scope was added on 2026-07-27 by migration
-- 20260727000002. Its own COMMENT states the obligation it creates:
--
--     'Writers must stamp the previous row before inserting the next version.'
--
-- No writer was changed that day. src/lib/admin/pricing.ts writePricingField
-- still inserts a row with effective_until NULL and leaves the previous row
-- open, so from 27 July every save on /admin/pricing has been refused by the
-- index the migration created. DRIVEN ON TEST BEFORE A LINE WAS WRITTEN, in
-- transactions that were rolled back:
--
--   insert ... ('platform_fee_percentage','AU','AUD',...,4,now(),null,7.5)
--   ERROR: 23505 duplicate key value violates unique constraint
--          "uq_pricing_rules_one_open_per_scope"
--   DETAIL: Key (rule_type, country_code, currency, COALESCE(organisation_id
--          ::text, ''::text), COALESCE(event_id::text, ''::text))
--          =(platform_fee_percentage, AU, AUD, , ) already exists.
--
-- That is the REGION DEFAULT path, not an edge case: it is the row the AU
-- launch fee sits on, at version 3, open. The constitution says the percentage
-- and the flat amount are edited by the founder in /admin/pricing with no code
-- deploy. They were not editable at all. The ONE FEE ruling of 15 August 2026
-- removed the processing-fee fields from that same screen for being a control
-- that accepted a number and charged nobody a cent of it; this is the same
-- fault one level down, and it governs the fee that IS charged.
--
-- THE SECOND REFUSAL, also driven and also rolled back, is the override form's
-- own default value:
--
--   insert ... value_percentage 0
--   ERROR: 23514 new row for relation "pricing_rules" violates check
--          constraint "pricing_rules_value_split_check"
--
-- pricing_rules_value_split_check requires value_percentage > 0. The override
-- form ships defaultValue={0} and min="0" on that field, so the form as
-- rendered could not be submitted even once the index was satisfied. The fix
-- for that half is in the form and in the Zod bound, not here: a zero platform
-- fee is expressed by the Founding Organiser waiver
-- (organisations.founding_fee_free_until, migration 20260727000002 JOB 1),
-- which is a dated window the charge, the display and the payout all read
-- identically. Relaxing the CHECK to admit 0 would put a second way to say
-- "no fee" into the one table the fee doctrine says holds exactly one.
--
-- WHY A DATABASE FUNCTION AND NOT TWO CALLS FROM TYPESCRIPT. supabase-js has
-- no transaction. Closing the old row and inserting the new one as two round
-- trips opens a window in which the scope has NO open row at all, and the
-- resolver reads through that window to the next precedence level, so a save
-- would briefly charge a different fee. If the second call then failed, the
-- scope would be left with no open rule instead of the one it started with:
-- worse than the defect being fixed. One statement, one transaction, or the
-- fee is not safe to edit.
--
-- WHAT THIS FILE DOES NOT DO. It does not change what anybody is charged, and
-- it does not touch the resolver. getPricingRule still reads the highest
-- version effective row; this only makes "exactly one open row per scope" true
-- by construction instead of true by the index refusing every write. It reads
-- and writes no order, payment, payout or transfer row.
--
-- Additive and reversible: drop the function. The data shape is unchanged.
-- TEST database only, applied with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- THE ONE LAWFUL WRITER.
--
-- The scope predicate below mirrors the RESOLVER's precedence
-- (src/lib/payments/pricing-rules.ts getPricingRule), where an event-scoped
-- rule is matched on (rule_type, event_id) ALONE and ignores country and
-- currency because an event id already names one event.
--
-- That predicate is deliberately a SUPERSET of the unique index key, which
-- also carries country_code and currency. Closing a superset is safe and is
-- the stronger guarantee: it is impossible for this function to insert a row
-- that collides with an open row it did not itself close, which is exactly the
-- failure being fixed. It also repairs a latent case the index alone permits,
-- two open event rules for one event under different currencies, where the
-- resolver would have silently used whichever carried the higher version.
-- ---------------------------------------------------------------------------

create or replace function public.write_pricing_rule(
  p_rule_type        text,
  p_country_code     text,
  p_currency         text,
  p_organisation_id  uuid,
  p_event_id         uuid,
  p_value_type       text,
  p_value_percentage numeric,
  p_value_cents      bigint,
  p_value_integer    bigint,
  p_created_by       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_value   numeric;
  v_old_value   numeric;
  v_max_version integer;
  v_new_version integer;
  v_lock_key    text;
begin
  if p_value_type not in ('percentage', 'fixed', 'integer') then
    raise exception 'write_pricing_rule: unknown value_type %', p_value_type
      using errcode = '22023';
  end if;

  -- The new value in one comparable column, so "unchanged" is one comparison
  -- rather than three branches that can disagree.
  v_new_value := case p_value_type
                   when 'percentage' then p_value_percentage
                   when 'fixed'      then p_value_cents::numeric
                   else                   p_value_integer::numeric
                 end;

  if v_new_value is null then
    raise exception 'write_pricing_rule: % value is null for value_type %',
      p_rule_type, p_value_type using errcode = '22023';
  end if;

  -- Serialise writers for THIS scope only. Two admins saving two different
  -- regions must not queue behind each other, and two saving the same region
  -- must not both read version 3 and both try to write version 4. The lock is
  -- transaction scoped, so it is released by the commit or the rollback below
  -- without an unlock call that an exception could skip.
  v_lock_key := p_rule_type || '|' || coalesce(
                  p_event_id::text,
                  p_country_code || '|' || p_currency || '|'
                    || coalesce(p_organisation_id::text, '')
                );
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  -- The current open value for the scope, read under the lock.
  select case pr.value_type
           when 'percentage' then pr.value_percentage
           when 'fixed'      then pr.value_cents::numeric
           else                   pr.value_integer::numeric
         end
    into v_old_value
    from public.pricing_rules pr
   where pr.rule_type = p_rule_type
     and pr.effective_until is null
     and (
       (p_event_id is not null and pr.event_id = p_event_id)
       or
       (p_event_id is null
         and pr.event_id is null
         and pr.country_code = p_country_code
         and pr.currency = p_currency
         and pr.organisation_id is not distinct from p_organisation_id)
     )
   order by pr.version desc
   limit 1;

  -- Unchanged is not a write. Versions are the audit trail of DECISIONS, and
  -- churning one on every form submit makes that trail useless.
  if v_old_value is not null and v_old_value = v_new_value then
    return jsonb_build_object(
      'changed',   false,
      'old_value', v_old_value,
      'new_value', v_new_value,
      'version',   null
    );
  end if;

  -- Stamp every open row in the scope. This is the sentence the index comment
  -- asked for. Superseded rows are stamped, never deleted, so a past order can
  -- still be explained by the rule that priced it.
  update public.pricing_rules pr
     set effective_until = now()
   where pr.rule_type = p_rule_type
     and pr.effective_until is null
     and (
       (p_event_id is not null and pr.event_id = p_event_id)
       or
       (p_event_id is null
         and pr.event_id is null
         and pr.country_code = p_country_code
         and pr.currency = p_currency
         and pr.organisation_id is not distinct from p_organisation_id)
     );

  -- The next version runs over the scope's WHOLE history, open or closed, so a
  -- version number is never reused after a row has been stamped.
  select coalesce(max(pr.version), 0)
    into v_max_version
    from public.pricing_rules pr
   where pr.rule_type = p_rule_type
     and (
       (p_event_id is not null and pr.event_id = p_event_id)
       or
       (p_event_id is null
         and pr.event_id is null
         and pr.country_code = p_country_code
         and pr.currency = p_currency
         and pr.organisation_id is not distinct from p_organisation_id)
     );
  v_new_version := v_max_version + 1;

  insert into public.pricing_rules (
    rule_type, country_code, currency, event_type, organiser_tier,
    organisation_id, event_id, value_type, version,
    effective_from, effective_until, created_by,
    value_percentage, value_cents, value_integer
  ) values (
    p_rule_type, p_country_code, p_currency, 'ALL', 'ALL',
    p_organisation_id, p_event_id, p_value_type, v_new_version,
    now(), null, p_created_by,
    case when p_value_type = 'percentage' then p_value_percentage end,
    case when p_value_type = 'fixed'      then p_value_cents      end,
    case when p_value_type = 'integer'    then p_value_integer    end
  );

  return jsonb_build_object(
    'changed',   true,
    'old_value', v_old_value,
    'new_value', v_new_value,
    'version',   v_new_version
  );
end;
$$;

comment on function public.write_pricing_rule(
  text, text, text, uuid, uuid, text, numeric, bigint, bigint, uuid
) is
  'The one lawful writer of public.pricing_rules. Stamps every open row in the scope and inserts the next version in ONE transaction, which is the obligation uq_pricing_rules_one_open_per_scope states in its own comment and which no writer honoured between 2026-07-27 and 2026-09-20. Returns {changed, old_value, new_value, version}; an unchanged value is not written and not versioned. Scope follows the resolver: an event rule is matched on (rule_type, event_id) alone.';

-- The service-role client behind /admin/pricing is the only caller. A browser
-- session must never reach the fee writer, so anon and authenticated are not
-- granted and the default public execute grant is revoked.
revoke all on function public.write_pricing_rule(
  text, text, text, uuid, uuid, text, numeric, bigint, bigint, uuid
) from public;
grant execute on function public.write_pricing_rule(
  text, text, text, uuid, uuid, text, numeric, bigint, bigint, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITION: prove the invariant before committing, the same way JOB 7 of
-- 20260727000002 proved it. A migration that asserts nothing is a claim.
-- ---------------------------------------------------------------------------

do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select 1 from public.pricing_rules
     where effective_until is null
     group by rule_type, country_code, currency,
              coalesce(organisation_id::text, ''), coalesce(event_id::text, '')
    having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception 'pricing_rules has % scope(s) with more than one open row', dupes;
  end if;
  raise notice 'pricing_rules: exactly one open row per scope, and now one writer that keeps it that way';
end $$;

commit;
