/**
 * D7, THE VENUE PARTNERSHIP ASKS AS A DRAFT PLAY WITH ITS DRAFTS HELD (window 6, 30 October 2026; the register's D7:
 * "Twelve venue drafts in the play queue on production", "Venue asks as a play in the outreach engine (no send until
 * Graph consent)").
 *
 * Reads the reviewed data file (scripts/ops/data/venue-asks-30oct.json), drafts each venue through the engine's own
 * rules (src/lib/outreach/venue-asks.ts), and writes ONE SQL transaction that:
 *   1. records the venues new to the CRM as organisers, and their published addresses as contacts with the whole
 *      conspicuous-publication basis (the page, the date read, the no-marketing check, the role and why the ask fits);
 *   2. stores the two templates, venue_ask (email) and venue_ask_dm, as version 1;
 *   3. makes the play 'D7 venue partnerships' as a DRAFT (no window approves it), its cohort the drafted organisers;
 *   4. writes each draft as a HELD first message in that play, the contact's own unsubscribe link in each email;
 *   5. reads it all back.
 * Idempotent: an organiser, contact, template, play or draft already there is left as it is. The database judges every
 * row again (organiser_contacts_basis_is_whole, outreach_touch_is_lawful); nothing here can queue or send.
 *
 *   npx tsx scripts/ops/outreach-venue-asks.ts --by <auth user uuid> [--into <dir>]     writes the SQL, runs nothing
 *   scripts\ops\with-supabase-token.ps1 npx tsx scripts/ops/outreach-venue-asks.ts --by <uuid> --test [--commit]
 *                                       runs it on TEST (the only ref it runs on), rolled back unless --commit
 *
 * PRODUCTION: the written SQL ends in ROLLBACK, for window 4's logged apply (operating rule 4). This never connects to
 * production.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftVenueAsk, VENUE_ASK_DM, VENUE_ASK_EMAIL, type VenueAsk } from '../../src/lib/outreach/venue-asks'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if ((TEST_REF as string) === PRODUCTION_REF) throw new Error('outreach-venue-asks runs on TEST only')

const args = process.argv.slice(2)
const arg = (n: string): string | null => (args.indexOf(n) >= 0 ? (args[args.indexOf(n) + 1] ?? null) : null)
const by = arg('--by')
if (!by || !/^[0-9a-f-]{36}$/i.test(by)) {
  console.error('usage: npx tsx scripts/ops/outreach-venue-asks.ts --by <auth user uuid> [--into <dir>] [--test [--commit]]')
  process.exit(2)
}
const into = arg('--into') ?? 'C:/dev/EVIDENCE/W6-30OCT'
const onTest = args.includes('--test')
const commit = args.includes('--commit')

const DATA = 'scripts/ops/data/venue-asks-30oct.json'
const data = JSON.parse(readFileSync(DATA, 'utf8')) as { asks: VenueAsk[]; seenOn: string }
// The token is put in by the database, from each contact's own row, so no link is ever guessed.
const TOKEN = '__W6_D7_UNSUBSCRIBE_TOKEN__'
const UNSUBSCRIBE = `https://www.eventlinqs.com.au/unsubscribe/outreach?t=${TOKEN}`

const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`)
const arr = (xs: string[]): string => `array[${xs.map(q).join(', ')}]::text[]`

const drafted = data.asks.map((a) => ({ ask: a, draft: draftVenueAsk(a, UNSUBSCRIBE) }))
const failing = drafted.filter((d) => d.draft.state === 'drafted' && d.draft.ruleFailures.length > 0)
if (failing.length > 0) {
  for (const f of failing) if (f.draft.state === 'drafted') console.error(`REFUSED: ${f.ask.organiser} fails ${f.draft.ruleFailures.join('; ')}`)
  process.exit(1)
}

const rows = drafted.flatMap(({ ask, draft }) =>
  draft.state === 'drafted' && ask.contact
    ? [
        `(${[q(ask.organiser), q(ask.website), q(ask.city), q(ask.contact.channel), q(ask.contact.address), ask.contact.existing ? 'true' : 'false', q(ask.contact.role ?? null), q(ask.contact.publishedOn ?? null), q(ask.contact.relevance ?? null), q(draft.template), q(draft.subject), q(draft.body), arr(draft.heldBecause)].join(', ')})`,
      ]
    : [],
)
const noDraft = drafted.flatMap(({ draft }) => (draft.state === 'no_draft' ? [`${draft.organiser}: ${draft.reason}`] : []))

const source = 'Window 6, 30 October 2026: D7 venue partnership ask in Lawal\'s format (scripts/ops/data/venue-asks-30oct.json, window 3\'s research of 28 October)'

const body = `-- D7 venue partnership asks, written by scripts/ops/outreach-venue-asks.ts from ${DATA} (window 6, 30 October 2026).
-- ${rows.length} drafts held in a DRAFT play; no draft for: ${noDraft.map((n) => n.split(':')[0]).join('; ')}.
begin;

create temp table w6_d7 (organiser text, website text, city text, channel text, address text, existing boolean, role text,
  published_on text, relevance text, template text, subject text, body text, held text[]) on commit drop;
insert into w6_d7 values
${rows.join(',\n')};

-- The organiser each row belongs to: by its name, else by its website.
create temp table w6_d7_org (organiser text primary key, organiser_id uuid) on commit drop;

-- 1a. Venues new to the CRM.
insert into public.organisers (name, website_url, found_on, notes, created_by)
select d.organiser, d.website, d.website,
       'D7 venue partnership ask (window 3''s research of 28 October 2026; addresses read 30 October 2026). City: ' || initcap(d.city) || '.',
       ${q(by)}
  from (select distinct on (organiser) * from w6_d7 order by organiser) d
 where not d.existing
   and not exists (select 1 from public.organisers o where o.name_key = lower(regexp_replace(btrim(d.organiser), '\\s+', ' ', 'g')))
   and not exists (select 1 from public.organisers o where o.website_key = lower(substring(d.website from '^[Hh][Tt][Tt][Pp][Ss]://(?:[Ww][Ww][Ww]\\.)?([^/:?#\\s]+)')));

insert into w6_d7_org
select distinct on (d.organiser) d.organiser, o.id
  from w6_d7 d
  join public.organisers o on o.name_key = lower(regexp_replace(btrim(d.organiser), '\\s+', ' ', 'g'))
     or o.website_key = lower(substring(d.website from '^[Hh][Tt][Tt][Pp][Ss]://(?:[Ww][Ww][Ww]\\.)?([^/:?#\\s]+)'))
 order by d.organiser, (o.name_key = lower(regexp_replace(btrim(d.organiser), '\\s+', ' ', 'g'))) desc, o.created_at;

-- 1b. Their published addresses, each with its whole basis.
insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on,
  no_marketing_statement_checked, relevance, basis_recorded_by, basis_recorded_at, created_by)
select g.organiser_id, d.role, 'email', d.address, 'conspicuous_publication', d.published_on, date ${q(data.seenOn)}, true,
       d.relevance, ${q(by)}, now(), ${q(by)}
  from w6_d7 d join w6_d7_org g on g.organiser = d.organiser
 where not d.existing
   and not exists (select 1 from public.organiser_contacts c where c.channel = 'email' and c.address = d.address);

-- 2. The two templates, version 1.
insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by)
select t.key, 1, t.channel, t.purpose, t.step, t.subject, t.body, ${q(source)}, ${q(by)}
  from (values
    (${q(VENUE_ASK_EMAIL.key)}, ${q(VENUE_ASK_EMAIL.channel)}, ${q(VENUE_ASK_EMAIL.purpose)}, ${VENUE_ASK_EMAIL.step}::smallint, ${q(VENUE_ASK_EMAIL.subject)}, ${q(VENUE_ASK_EMAIL.body)}),
    (${q(VENUE_ASK_DM.key)}, ${q(VENUE_ASK_DM.channel)}, ${q(VENUE_ASK_DM.purpose)}, ${VENUE_ASK_DM.step}::smallint, null, ${q(VENUE_ASK_DM.body)})
  ) as t(key, channel, purpose, step, subject, body)
 where not exists (select 1 from public.outreach_templates x where x.key = t.key);

-- 3. The play, a DRAFT: no window approves it.
insert into public.outreach_plays (name, cohort_rule, step1_template_id, created_by)
select 'D7 venue partnerships',
       jsonb_build_object('organisers', (select jsonb_agg(organiser_id::text order by organiser) from w6_d7_org)),
       (select id from public.outreach_templates where key = 'venue_ask' order by version desc limit 1),
       ${q(by)}
 where not exists (select 1 from public.outreach_plays where name = 'D7 venue partnerships');

-- 4. The drafts, HELD in that play; each email carries its contact's own unsubscribe link.
insert into public.outreach_touches (contact_id, purpose, step, template_id, play_id, subject, body, held_because, state, drafted_by)
select c.id, 'cadence', 1,
       (select id from public.outreach_templates where key = d.template order by version desc limit 1),
       (select id from public.outreach_plays where name = 'D7 venue partnerships'),
       d.subject, replace(d.body, ${q(TOKEN)}, c.unsubscribe_token::text), d.held, 'held', ${q(by)}
  from w6_d7 d
  join w6_d7_org g on g.organiser = d.organiser
  join public.organiser_contacts c on c.organiser_id = g.organiser_id and c.channel = d.channel and c.address = d.address
 where not exists (select 1 from public.outreach_touches t join public.outreach_templates tp on tp.id = t.template_id
                    where t.contact_id = c.id and tp.key in ('venue_ask', 'venue_ask_dm'));

-- 5. Read back: every row, and what each draft is.
${'__READ_BACK__'}`

const readBack = `json_build_object(
  'play', (select json_build_object('id', id, 'state', state, 'cohort', jsonb_array_length(cohort_rule -> 'organisers')) from public.outreach_plays where name = 'D7 venue partnerships'),
  'drafts', (select json_agg(json_build_object('organiser', d.organiser, 'channel', d.channel, 'address', d.address,
              'contact', c.id, 'basis', c.basis, 'touch', t.id, 'state', t.state, 'held_because', t.held_because,
              'unsubscribe_filled', position(${q(TOKEN)} in coalesce(t.body, '')) = 0) order by d.organiser)
              from w6_d7 d left join w6_d7_org g on g.organiser = d.organiser
              left join public.organiser_contacts c on c.organiser_id = g.organiser_id and c.channel = d.channel and c.address = d.address
              left join public.outreach_touches t on t.contact_id = c.id and t.play_id = (select id from public.outreach_plays where name = 'D7 venue partnerships')),
  'templates', (select json_agg(json_build_object('key', key, 'version', version)) from public.outreach_templates where key in ('venue_ask', 'venue_ask_dm'))
)`

// A rolled-back run on TEST raises its read back as the error, so the rollback cannot swallow it (the proofs' shape);
// the production file and a committed TEST run read back with a select just before their last word.
const ending = onTest && !commit
  ? `do $d7$ begin raise exception 'D7 READ BACK %', (select ${readBack})::text; end $d7$;\n`
  : `select ${readBack} as d7;\n\n${onTest ? 'commit;' : 'rollback;'}\n`
const sql = body.replace('__READ_BACK__', ending)

const file = join(into, `d7-venue-asks${onTest ? (commit ? '-TEST-commit' : '-TEST') : '-production'}.sql`)
writeFileSync(file, sql)
console.log(`wrote ${file}: ${rows.length} drafts; no draft for ${noDraft.length}:`)
for (const n of noDraft) console.log(`  ${n}`)

// tsx compiles this file as CommonJS here, which has no top-level await.
async function runOnTest(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('run through scripts\\ops\\with-supabase-token.ps1')
  // The Management API runs the whole text as one request: rolled back, the raised read back is the answer.
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  console.log(`TEST (${TEST_REF}), ${commit ? 'COMMITTED' : 'rolled back'}: HTTP ${res.status}`)
  console.log(text.slice(0, 8000))
  // Rolled back, the answer IS the raised read back; anything else that is not OK is a refusal, quoted above.
  if (commit ? !res.ok : !text.includes('D7 READ BACK')) process.exitCode = 1
}

if (onTest) {
  runOnTest().catch((err: unknown) => {
    console.error('the TEST run failed:', err)
    process.exitCode = 1
  })
}
