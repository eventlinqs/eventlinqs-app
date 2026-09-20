-- ===========================================================================
-- LB-FEEARGS. THE FEE WRITER'S OPTIONAL ARGUMENTS WERE DECLARED AS REQUIRED,
-- AND THE TYPES WERE HAND-WIDENED TO HIDE IT.
--
-- WHAT HAPPENED, and it is worth writing down because it was invisible for a
-- day and surfaced only when production caught up.
--
-- 20260920000010 declared public.write_pricing_rule with ten parameters and no
-- defaults. Five of them are NOT required in practice and the one call site
-- passes NULL for them on the commonest path of all, the region default:
--
--     src/lib/admin/pricing.ts
--       p_organisation_id:  orgId              -- null for a region rule
--       p_event_id:         eventId            -- null for a region or org rule
--       p_value_percentage: ... : null         -- null unless value_type is percentage
--       p_value_cents:      ... : null         -- null unless value_type is fixed
--       p_value_integer:    ... : null         -- null unless value_type is integer
--
-- The Supabase type generator derives an argument's optionality from whether it
-- carries a DEFAULT, not from whether the function accepts NULL. With no
-- defaults it emitted all ten as REQUIRED and non-nullable, which the call site
-- above cannot satisfy. So the generated section of src/types/database.ts was
-- edited BY HAND to widen six of them to `| null`, a shape the generator can
-- never produce for any signature.
--
-- That is a lie the guard is built to catch, and it caught it. It could not
-- catch it for a day because production was three migrations behind: while
-- 20260920000010 was PENDING, types-drift explained the disagreement by the
-- pending migration and passed. The moment the founder applied it, the
-- disagreement had no explanation left and the build went red. A stale pin
-- masked by a lagging environment is the same shape as the .nvmrc case in
-- Law 9, one level down.
--
-- WHY THE PARAMETERS ARE REORDERED RATHER THAN SIMPLY DEFAULTED. Postgres
-- requires that every parameter following a defaulted one also carries a
-- default. The five optional parameters sat at positions 4, 5, 7, 8 and 9, with
-- required parameters after them, so defaulting them in place would have forced
-- `default null` onto p_value_type and p_created_by as well. p_created_by is
-- the audit field that records WHICH ADMIN changed the platform fee, and giving
-- it a silent null default would mean a future caller that forgets it writes an
-- unattributed fee change rather than failing. The five genuinely optional
-- parameters are moved to the end instead, where a default is lawful and where
-- the signature says out loud which arguments are which.
--
-- REORDERING IS INVISIBLE TO THE CALLER. supabase-js `rpc()` sends named
-- arguments as a JSON object; PostgREST resolves by name. The one call site is
-- unchanged in behaviour and passes `undefined` rather than `null` for the five,
-- which omits the key and lets these defaults apply to exactly the same effect.
--
-- WHAT THIS FILE DOES NOT DO. The BODY is byte-for-byte the body of
-- 20260920000010. Nothing about what is charged, what is stamped, what is
-- locked or what is versioned changes. This declares the signature honestly so
-- that the generated types and the database can stop disagreeing.
-- ===========================================================================

begin;

-- DROP first, because CREATE OR REPLACE may not change the parameter list. The
-- old signature is named in full so this cannot drop an overload by accident;
-- there is only one, and it is the one 20260920000010 created.
drop function if exists public.write_pricing_rule(
  text, text, text, uuid, uuid, text, numeric, bigint, bigint, uuid
);

create or replace function public.write_pricing_rule(
  p_rule_type        text,
  p_country_code     text,
  p_currency         text,
  p_value_type       text,
  p_created_by       uuid,
  -- Optional, and now declared so. Every one of these is null on a lawful save.
  p_organisation_id  uuid    default null,
  p_event_id         uuid    default null,
  p_value_percentage numeric default null,
  p_value_cents      bigint  default null,
  p_value_integer    bigint  default null
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
  text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint
) is
  'The one lawful writer of public.pricing_rules. Stamps every open row in the scope and inserts the next version in ONE transaction, which is the obligation uq_pricing_rules_one_open_per_scope states in its own comment and which no writer honoured between 2026-07-27 and 2026-09-20. Returns {changed, old_value, new_value, version}; an unchanged value is not written and not versioned. Scope follows the resolver: an event rule is matched on (rule_type, event_id) alone. The five trailing arguments default to null because they are genuinely optional: a region rule has no organisation and no event, and a value lands in exactly one of the three value columns.';

-- The service-role client behind /admin/pricing is the only caller. A browser
-- session must never reach the fee writer, so anon and authenticated are not
-- granted and the default public execute grant is revoked. Re-stated here
-- because DROP FUNCTION took the old grants with it.
revoke all on function public.write_pricing_rule(
  text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint
) from public;
grant execute on function public.write_pricing_rule(
  text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint
) to service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITION. Two claims, both proved rather than asserted: exactly ONE
-- function of this name exists (a failed drop would leave two overloads and
-- every call would then be ambiguous), and it carries exactly FIVE defaults.
-- ---------------------------------------------------------------------------

do $$
declare
  n_overloads int;
  n_defaults  int;
  dupes       int;
begin
  select count(*), coalesce(max(pronargdefaults), 0)
    into n_overloads, n_defaults
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'write_pricing_rule';

  if n_overloads <> 1 then
    raise exception 'write_pricing_rule has % definitions; exactly one is required or every call is ambiguous', n_overloads;
  end if;
  if n_defaults <> 5 then
    raise exception 'write_pricing_rule declares % defaulted arguments, expected 5', n_defaults;
  end if;

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

  raise notice 'write_pricing_rule: one definition, five optional arguments declared as optional';
end $$;

commit;
