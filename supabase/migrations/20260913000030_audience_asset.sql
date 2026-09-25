-- ===========================================================================
-- GA1. Consent capture and the audience asset.
--
-- The asset that makes the Fullsure revenue channel defensible is an opted-in
-- audience of PROVEN BUYERS, segmented by city, community, category, price band
-- and recency. Only the business that owns the transaction can record that, and
-- EventLinqs owns the transaction. Today every ticket walks out of the platform
-- without the buyer being added to anything, so the asset every later campaign
-- depends on is thrown away on every order.
--
-- An audience without provable consent cannot be used and cannot be sold. The
-- Spam Act 2003 is enforced hard in Australia. So consent here is the TITLE DEED
-- to the asset, and the database, not the application, is what holds it:
--   * an audience row whose consent state is not TRUE cannot exist
--   * an audience row with empty consent wording cannot exist
--   * a withdrawal removes the row, in the same transaction, always
--
-- NOTHING SENDS. This migration creates no sender, no queue and no schedule.
--
-- Additive. Reversible by dropping the two new tables, the four functions and
-- the two triggers, and by restoring the old status check on marketing_consents.
-- TEST database only, applied with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE DECLINE IS A FACT WORTH KEEPING.
--
-- Today an unticked box records nothing at all, so "asked and said no" and
-- "never asked" are the same absence. They are not the same thing: the first is
-- evidence that the question was put and answered, which is exactly what an
-- audit of a marketing list wants to see, and it is also the denominator of the
-- opt-in rate GA1's reversal condition is measured on.
-- ---------------------------------------------------------------------------
alter table public.marketing_consents
  drop constraint if exists marketing_consents_status_check;
alter table public.marketing_consents
  add constraint marketing_consents_status_check
  check (status in ('granted', 'withdrawn', 'declined'));

alter table public.marketing_consents
  add column if not exists declined_at timestamptz;

-- Where a withdrawal came from. GA1 point 5 asks the unsubscribe to record the
-- timestamp AND the source; revoked_at existed and the source did not, so a
-- withdrawal by token and a withdrawal from the preference centre were
-- indistinguishable afterwards.
alter table public.marketing_consents
  add column if not exists revoked_source text;

-- granted_at defaults to now() and was NOT NULL, so a declined row would have
-- claimed a grant time it never had. It is nullable now, and the constraint
-- below makes the three states mean exactly what they say.
alter table public.marketing_consents
  alter column granted_at drop not null;

alter table public.marketing_consents
  drop constraint if exists marketing_consents_state_is_coherent;
alter table public.marketing_consents
  add constraint marketing_consents_state_is_coherent check (
    (status = 'granted'   and granted_at is not null) or
    (status = 'withdrawn' and granted_at is not null and revoked_at is not null) or
    (status = 'declined'  and granted_at is null     and declined_at is not null)
  );

comment on column public.marketing_consents.declined_at is
  'When this address was ASKED and said no. A declined row is never marketing consent and never enters any audience; it exists so "asked and declined" is distinguishable from "never asked".';
comment on column public.marketing_consents.revoked_source is
  'Where the withdrawal came from: the unsubscribe token, the preference centre, or an operator.';

-- ---------------------------------------------------------------------------
-- 2. RECORDING A DECLINE CAN NEVER REVOKE A CONSENT.
--
-- A returning buyer who leaves the box unticked on their second purchase has
-- NOT withdrawn anything: under the Spam Act a withdrawal is a deliberate act,
-- and an untouched checkbox is not one. An upsert would have quietly flipped
-- their granted row to declined, which is both a data loss and a lie about what
-- they did. So the decline is its own function and it inserts ONLY when the
-- address is unknown.
-- ---------------------------------------------------------------------------
create or replace function public.record_marketing_decline(
  p_email text,
  p_consent_text text,
  p_consent_version text,
  p_source text,
  p_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_inserted boolean := false;
begin
  if v_email is null or v_email = '' then return false; end if;
  if p_consent_text is null or btrim(p_consent_text) = '' then return false; end if;

  insert into public.marketing_consents
    (email, status, consent_text, consent_version, source, granted_at, declined_at, updated_at)
  values
    (v_email, 'declined', p_consent_text, coalesce(p_consent_version, 'v1'),
     coalesce(p_source, 'checkout'), null, p_at, p_at)
  on conflict (email) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.record_marketing_decline(text, text, text, text, timestamptz) is
  'Record that an address was asked for marketing consent and said no. Inserts only when the address is unknown, so a decline can never overwrite or revoke an existing consent.';

-- ---------------------------------------------------------------------------
-- 3. THE COMMUNITY TAXONOMY, IN THE DATABASE, WHERE THE AUDIENCE CAN READ IT.
--
-- GA1 point 3 requires the community value on an audience row to be read from
-- the database and never from a literal list. The platform resolves an event's
-- community by TAG CONTAINMENT (src/lib/communities/tag-bridge.ts) because
-- events.community_primary is null on every event, and that resolver is
-- TypeScript, which a trigger cannot call. So the token map is materialised
-- here, once, and scripts/guards/audience-consent-is-the-title-deed.mjs fails
-- the build if this table and that module ever disagree. The taxonomy is
-- written down once and read in two languages; it is not two lists.
-- ---------------------------------------------------------------------------
create table if not exists public.community_tag_map (
  community_slug text primary key,
  tokens text[] not null check (cardinality(tokens) > 0)
);

comment on table public.community_tag_map is
  'Community Taxonomy v2 heritage -> identifying event tags, materialised from src/lib/communities/tag-bridge.ts so SQL can resolve an event to its communities. Held equal to that module by a registered blocking guard.';

insert into public.community_tag_map (community_slug, tokens) values
  ('aboriginal-torres-strait-islander', array['first-nations', 'aboriginal', 'torres-strait', 'torres-strait-islander', 'naidoc', 'indigenous', 'blak', 'mob']),
  ('african', array['african', 'afrobeats', 'afropop', 'alte', 'amapiano', 'owambe', 'west-african', 'east-african', 'southern-african', 'south-african', 'africultures', 'yoruba', 'nigerian', 'ghanaian', 'highlife', 'bongo-flava', 'gqom', 'kwaito']),
  ('caribbean', array['caribbean', 'soca', 'dancehall', 'reggae', 'steel-pan', 'calypso', 'mas', 'trinidad', 'trinidadian', 'jamaican', 'jouvert', 'roots']),
  ('indian', array['indian', 'bollywood', 'bhangra', 'dhol', 'south-asian', 'diwali', 'sangeet', 'mehndi', 'mela', 'garba', 'raas', 'navratri', 'holi', 'desi', 'tamil', 'telugu', 'jaipur']),
  ('chinese', array['chinese', 'lunar-new-year', 'lunar', 'cantonese', 'mandarin', 'cantopop', 'mandopop', 'mid-autumn', 'lion-dance']),
  ('filipino', array['filipino', 'opm', 'sariwa', 'pinoy', 'tagalog', 'pilipino', 'sinulog', 'pasko', 'ati-atihan']),
  ('latin-american', array['latin', 'latino', 'salsa', 'reggaeton', 'bachata', 'cuban', 'merengue', 'cumbia', 'mariachi', 'brazilian', 'samba', 'mexican', 'colombian', 'argentinian']),
  ('vietnamese', array['vietnamese', 'tet', 'v-pop', 'ao-dai']),
  ('lebanese-levantine', array['lebanese', 'levantine', 'dabke', 'mahrajan', 'syrian', 'palestinian']),
  ('greek', array['greek', 'glendi', 'rebetiko', 'panigiri', 'bouzouki', 'cypriot']),
  ('italian', array['italian', 'sagra', 'festa', 'tarantella', 'siciliani', 'calabrese']),
  ('korean', array['korean', 'k-pop', 'kpop', 'hallyu', 'seollal', 'chuseok']),
  ('japanese', array['japanese', 'matsuri', 'anime', 'j-rock', 'j-pop', 'taiko', 'hanami']),
  ('pacific-pasifika', array['pacific', 'pasifika', 'samoan', 'tongan', 'fijian', 'islander', 'cook-islands']),
  ('maori', array['maori', 'kapa-haka', 'matariki', 'te-reo', 'waiata', 'haka']),
  ('persian-iranian', array['persian', 'iranian', 'nowruz', 'yalda', 'farsi', 'chaharshanbe']),
  ('turkish', array['turkish', 'saz', 'sema', 'anatolian']),
  ('arab', array['arab', 'arabic', 'egyptian', 'iraqi', 'khaleeji', 'gulf', 'oud', 'tarab']),
  ('other-south-asian', array['nepali', 'sri-lankan', 'pakistani', 'bangladeshi', 'dashain', 'tihar', 'pohela-boishakh', 'qawwali', 'sinhala']),
  ('other-east-southeast-asian', array['thai', 'indonesian', 'malaysian', 'cambodian', 'lao', 'songkran', 'hmong', 'gamelan']),
  ('other-european', array['european', 'polish', 'german', 'irish', 'ukrainian', 'balkan', 'eurovision', 'oktoberfest', 'french', 'maltese', 'russian'])
on conflict (community_slug) do update set tokens = excluded.tokens;

alter table public.community_tag_map enable row level security;
-- The map is public taxonomy, not private data: the same tokens are already
-- visible in every /community/[slug] URL the platform publishes.
drop policy if exists "community_tag_map_public_read" on public.community_tag_map;
create policy "community_tag_map_public_read" on public.community_tag_map
  for select using (true);

-- ---------------------------------------------------------------------------
-- 4. THE PRICE BAND.
--
-- Six bands, and the boundaries are MEASURED against what this platform
-- actually lists rather than chosen by feel. On TEST vkapkibzokmfaxqogypq on
-- 13 September 2026, across the ticket tiers of every published event: 177 free
-- tiers, 115 paid, the median paid tier 49.00 and the dearest 349.00. Every band
-- below is reachable by a real ticket and none of them is empty by construction.
-- The same boundaries are written once in src/lib/audience/segments.ts and the
-- guard fails the build if the two disagree.
-- ---------------------------------------------------------------------------
create or replace function public.audience_price_band(p_unit_cents bigint)
returns text
language sql
immutable
as $$
  select case
    when p_unit_cents is null then 'unknown'
    when p_unit_cents <= 0     then 'free'
    when p_unit_cents < 3000   then 'under-30'
    when p_unit_cents < 6000   then '30-to-59'
    when p_unit_cents < 10000  then '60-to-99'
    when p_unit_cents < 20000  then '100-to-199'
    else '200-plus'
  end;
$$;

comment on function public.audience_price_band(bigint) is
  'The price band of a per-ticket amount in cents. Boundaries measured against the live tier distribution, not chosen by feel; held equal to src/lib/audience/segments.ts by a registered guard.';

-- ---------------------------------------------------------------------------
-- 5. THE AUDIENCE ASSET.
--
-- One row per consented buyer. Everything on it is derived, so it can always be
-- rebuilt from the orders and the consent ledger and can never drift into being
-- its own second source of truth.
-- ---------------------------------------------------------------------------
create table if not exists public.audience_members (
  id uuid primary key default gen_random_uuid(),

  -- Buyer identity.
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,

  -- The title deed. consent_state is CONSTRAINED TRUE: the type allows false so
  -- that the column reads honestly and so that the constraint is the thing that
  -- refuses it, which is what GA1 point 4 asks for. A buyer who declines or
  -- withdraws does not get a false row here; they have no row here at all, and
  -- their state lives in marketing_consents where it belongs.
  consent_state boolean not null default true,
  consent_channel text not null default 'email',
  consent_at timestamptz not null,
  consent_text text not null,
  consent_version text not null,
  consent_source text not null,

  -- What they bought.
  first_order_at timestamptz not null,
  last_order_at timestamptz not null,
  order_count integer not null default 0,
  lifetime_spend_cents bigint not null default 0,
  last_order_id uuid references public.orders(id) on delete set null,
  last_event_id uuid references public.events(id) on delete set null,
  last_category_slug text,
  last_city_slug text,
  postcode text,
  price_band text not null,

  -- The segmentation axes, across every confirmed order they have made.
  category_slugs text[] not null default '{}',
  community_slugs text[] not null default '{}',
  city_slugs text[] not null default '{}',

  -- Where they arrived from (AN1), read off the earliest demand row that knew.
  arrival_utm_source text,
  arrival_utm_medium text,
  arrival_utm_campaign text,
  arrival_referrer_host text,
  arrival_device text,

  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),

  constraint audience_members_email_unique unique (email),

  -- GA1 point 4, in the only place that cannot be forgotten by a caller.
  constraint audience_members_consent_must_be_true
    check (consent_state is true),
  constraint audience_members_consent_text_present
    check (length(btrim(consent_text)) > 0),
  constraint audience_members_consent_version_present
    check (length(btrim(consent_version)) > 0),
  constraint audience_members_channel_known
    check (consent_channel in ('email')),
  constraint audience_members_price_band_known
    check (price_band in ('unknown', 'free', 'under-30', '30-to-59', '60-to-99', '100-to-199', '200-plus'))
);

comment on table public.audience_members is
  'GA1. One row per buyer who has both a confirmed order and granted platform marketing consent. Every row is derived from public.orders and public.marketing_consents and is rebuilt by refresh_audience_member. A row cannot exist without consent: the database refuses it.';

alter table public.audience_members enable row level security;
-- No policy, deliberately. Every read and every write is service role: this is
-- the platform's marketing asset and no browser session has any business in it.

-- ---------------------------------------------------------------------------
-- 6. THE REFRESH. The one place an audience row is composed.
--
-- Called by a trigger on an order confirming and by a trigger on the consent
-- ledger changing, so it works identically for a FREE order (confirmed inside
-- the checkout action) and a PAID order (confirmed minutes later on the Stripe
-- webhook) without one line of the payment path being touched.
--
-- IT CAN NEVER FAIL A PURCHASE. The whole body is wrapped: anything unexpected
-- becomes a warning and the order confirms regardless. A marketing row is not
-- worth somebody's ticket.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_audience_member(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_capture_enabled boolean;
  v_consent public.marketing_consents%rowtype;
  v_order_count integer;
  v_lifetime bigint;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_last_order_id uuid;
  v_last_event_id uuid;
  v_last_category text;
  v_last_city text;
  v_postcode text;
  v_unit_cents bigint;
  v_categories text[];
  v_cities text[];
  v_communities text[];
  v_display_name text;
  v_user_id uuid;
  v_utm_source text;
  v_utm_medium text;
  v_utm_campaign text;
  v_referrer text;
  v_device text;
begin
  if v_email = '' then return; end if;

  select mc.* into v_consent
    from public.marketing_consents mc
   where lower(mc.email) = v_email
     and mc.status = 'granted'
   limit 1;

  /*
   * A WITHDRAWAL ALWAYS TAKES EFFECT, EVEN WITH THE CAPTURE SWITCH OFF.
   *
   * The reversal switch stops the platform CREATING and enriching audience
   * rows. It is deliberately powerless to keep somebody in a marketing
   * audience after they asked to leave: that would be a feature flag
   * overriding the Spam Act, which is not a trade this platform makes. So the
   * removal below runs before the switch is consulted.
   */
  if not found then
    delete from public.audience_members where email = v_email;
    return;
  end if;

  select ff.enabled into v_capture_enabled
    from public.feature_flags ff
   where ff.flag = 'audience_capture';
  if v_capture_enabled is false then return; end if;

  select
      count(*)::integer,
      coalesce(sum(o.total_cents), 0)::bigint,
      min(coalesce(o.confirmed_at, o.updated_at, o.created_at)),
      max(coalesce(o.confirmed_at, o.updated_at, o.created_at))
    into v_order_count, v_lifetime, v_first_at, v_last_at
    from public.orders o
    left join public.profiles p on p.id = o.user_id
   where o.status = 'confirmed'
     and lower(coalesce(o.guest_email, p.email, '')) = v_email;

  -- Consent without a purchase is not an audience member: this asset is
  -- PROVEN BUYERS, which is the whole reason it cannot be bought elsewhere.
  if coalesce(v_order_count, 0) = 0 then
    delete from public.audience_members where email = v_email;
    return;
  end if;

  select
      o.id, o.event_id, o.user_id,
      coalesce(o.guest_name, p.full_name, p.display_name),
      e.city_primary, e.venue_postal_code, ec.slug,
      case
        when o.subtotal_cents <= 0 then 0
        else (o.subtotal_cents / greatest(1, (
          select coalesce(sum(oi.quantity), 0)
            from public.order_items oi
           where oi.order_id = o.id
             and oi.item_type <> 'addon'
        )))::bigint
      end
    into v_last_order_id, v_last_event_id, v_user_id, v_display_name,
         v_last_city, v_postcode, v_last_category, v_unit_cents
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join public.events e on e.id = o.event_id
    left join public.event_categories ec on ec.id = e.category_id
   where o.status = 'confirmed'
     and lower(coalesce(o.guest_email, p.email, '')) = v_email
   order by coalesce(o.confirmed_at, o.updated_at, o.created_at) desc, o.id desc
   limit 1;

  select
      coalesce(array_agg(distinct x.category_slug) filter (where x.category_slug is not null), '{}'),
      coalesce(array_agg(distinct x.city_slug)     filter (where x.city_slug is not null), '{}')
    into v_categories, v_cities
    from (
      select ec.slug as category_slug, e.city_primary as city_slug
        from public.orders o
        left join public.profiles p on p.id = o.user_id
        left join public.events e on e.id = o.event_id
        left join public.event_categories ec on ec.id = e.category_id
       where o.status = 'confirmed'
         and lower(coalesce(o.guest_email, p.email, '')) = v_email
    ) x;

  /*
   * THE COMMUNITY VALUE, READ FROM THE DATABASE.
   *
   * events.community_primary first, because that is the organiser's own answer
   * when they have given one. Otherwise the event's tags are intersected with
   * public.community_tag_map, which is the platform's own resolver made
   * readable by SQL. Nothing here names a community.
   */
  select coalesce(array_agg(distinct c.slug), '{}')
    into v_communities
    from (
      select e.community_primary, e.tags
        from public.orders o
        left join public.profiles p on p.id = o.user_id
        join public.events e on e.id = o.event_id
       where o.status = 'confirmed'
         and lower(coalesce(o.guest_email, p.email, '')) = v_email
    ) ev
    cross join lateral (
      select ev.community_primary as slug
       where ev.community_primary is not null
      union
      select m.community_slug
        from public.community_tag_map m
       where jsonb_typeof(ev.tags) = 'array'
         and exists (
           select 1
             from jsonb_array_elements_text(ev.tags) t(value)
            where t.value = any (m.tokens)
         )
    ) c;

  /*
   * WHERE THEY ARRIVED FROM. First touch, not last: the earliest demand row
   * for this address that knew anything. A row that knew nothing is not
   * allowed to overwrite one that did.
   */
  select le.utm_source, le.utm_medium, le.utm_campaign, le.referrer, le.device
    into v_utm_source, v_utm_medium, v_utm_campaign, v_referrer, v_device
    from public.ledger_entries le
   where le.kind = 'demand'
     and lower(coalesce(le.contact_email, '')) = v_email
     and (le.utm_source is not null or le.utm_medium is not null
          or le.utm_campaign is not null or le.referrer is not null
          or le.device is not null)
   order by le.occurred_at asc, le.id asc
   limit 1;

  insert into public.audience_members as am (
    email, user_id, display_name,
    consent_state, consent_channel, consent_at, consent_text, consent_version, consent_source,
    first_order_at, last_order_at, order_count, lifetime_spend_cents,
    last_order_id, last_event_id, last_category_slug, last_city_slug, postcode, price_band,
    category_slugs, community_slugs, city_slugs,
    arrival_utm_source, arrival_utm_medium, arrival_utm_campaign,
    arrival_referrer_host, arrival_device,
    refreshed_at
  ) values (
    v_email, v_user_id, v_display_name,
    true, 'email', coalesce(v_consent.granted_at, v_consent.updated_at, now()),
    v_consent.consent_text, v_consent.consent_version, v_consent.source,
    v_first_at, v_last_at, v_order_count, v_lifetime,
    v_last_order_id, v_last_event_id, v_last_category, v_last_city, v_postcode,
    public.audience_price_band(v_unit_cents),
    coalesce(v_categories, '{}'), coalesce(v_communities, '{}'), coalesce(v_cities, '{}'),
    v_utm_source, v_utm_medium, v_utm_campaign, v_referrer, v_device,
    now()
  )
  on conflict (email) do update set
    user_id              = excluded.user_id,
    display_name         = excluded.display_name,
    consent_at           = excluded.consent_at,
    consent_text         = excluded.consent_text,
    consent_version      = excluded.consent_version,
    consent_source       = excluded.consent_source,
    first_order_at       = excluded.first_order_at,
    last_order_at        = excluded.last_order_at,
    order_count          = excluded.order_count,
    lifetime_spend_cents = excluded.lifetime_spend_cents,
    last_order_id        = excluded.last_order_id,
    last_event_id        = excluded.last_event_id,
    last_category_slug   = excluded.last_category_slug,
    last_city_slug       = excluded.last_city_slug,
    postcode             = excluded.postcode,
    price_band           = excluded.price_band,
    category_slugs       = excluded.category_slugs,
    community_slugs      = excluded.community_slugs,
    city_slugs           = excluded.city_slugs,
    -- First touch is first touch: an arrival already recorded is never
    -- overwritten by a later, emptier one.
    arrival_utm_source    = coalesce(am.arrival_utm_source, excluded.arrival_utm_source),
    arrival_utm_medium    = coalesce(am.arrival_utm_medium, excluded.arrival_utm_medium),
    arrival_utm_campaign  = coalesce(am.arrival_utm_campaign, excluded.arrival_utm_campaign),
    arrival_referrer_host = coalesce(am.arrival_referrer_host, excluded.arrival_referrer_host),
    arrival_device        = coalesce(am.arrival_device, excluded.arrival_device),
    refreshed_at         = now();

exception when others then
  -- A marketing row is never worth somebody's ticket.
  raise warning 'refresh_audience_member(%) failed: %', v_email, sqlerrm;
end;
$$;

comment on function public.refresh_audience_member(text) is
  'Compose or remove the audience row for one address from the confirmed orders and the consent ledger. Idempotent, never raises into the caller, and deletes the row whenever consent is not granted.';

-- ---------------------------------------------------------------------------
-- 7. THE TRIGGERS. Two, and between them the asset maintains itself.
-- ---------------------------------------------------------------------------
create or replace function public.audience_on_order_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if new.status is distinct from 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;

  select lower(coalesce(new.guest_email, p.email, ''))
    into v_email
    from (select 1) one
    left join public.profiles p on p.id = new.user_id;

  if coalesce(v_email, '') <> '' then
    perform public.refresh_audience_member(v_email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audience_on_order_confirmed on public.orders;
create trigger trg_audience_on_order_confirmed
  after insert or update of status on public.orders
  for each row execute function public.audience_on_order_confirmed();

create or replace function public.audience_on_consent_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_audience_member(new.email);
  if tg_op = 'UPDATE' and lower(btrim(old.email)) is distinct from lower(btrim(new.email)) then
    perform public.refresh_audience_member(old.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audience_on_consent_changed on public.marketing_consents;
create trigger trg_audience_on_consent_changed
  after insert or update on public.marketing_consents
  for each row execute function public.audience_on_consent_changed();

-- ---------------------------------------------------------------------------
-- 8. THE REVERSAL SWITCH, on the governed flag system rather than a private one.
-- ---------------------------------------------------------------------------
insert into public.feature_flags (flag, enabled, description)
values (
  'audience_capture',
  true,
  'GA1. The marketing question at checkout and every audience write. Set false and the question disappears and no audience row is created or enriched, at once and with no deploy. Every existing row and every consent record is left intact, and a withdrawal still removes its row: the switch cannot keep anybody in an audience they asked to leave.'
)
on conflict (flag) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 9. THE INDEXES, DELIBERATELY AFTER THE COMMIT.
--
-- The Supabase CLI queues a migration's statements into one implicit
-- transaction, but CREATE INDEX is pipeline-incompatible: it flushes the batch
-- so far, runs alone, and starts a new one. A file with an index in the middle
-- is therefore NOT atomic. Everything above is one batch and lands together or
-- not at all; the indexes run afterwards, alone, and every one of them is
-- idempotent so a re-run repairs a partial apply.
-- ---------------------------------------------------------------------------
create index if not exists audience_members_last_order_idx on public.audience_members (last_order_at desc);
create index if not exists audience_members_price_band_idx on public.audience_members (price_band);
create index if not exists audience_members_city_idx on public.audience_members using gin (city_slugs);
create index if not exists audience_members_community_idx on public.audience_members using gin (community_slugs);
create index if not exists audience_members_category_idx on public.audience_members using gin (category_slugs);
