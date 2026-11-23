/**
 * THE SOURCE ASKS, LOADED INTO AN APPROVED PLAY AS HELD FIRST LETTERS THE ENGINE SENDS (WINDOW 5C, 23 November 2026; the
 * founder, 12:14: "Apply the already-approved communication workflow to routine source requests."; and 14:55: "Just get
 * my engine going, please: my outreach, my photo permissions, everything my system should be doing.").
 *
 * Reads the reviewed data file (scripts/ops/data/source-asks-23nov.json), drafts each source through the engine's own
 * template and rules (src/lib/outreach/source-asks.ts), judges each draft by the communication gateway's own checks
 * (voice-gate.ts voiceProblems: a PERM-SOURCE first letter from hello@, on its conspicuous publication basis), refuses to
 * write anything if one fails or if two share an organisation domain, and writes ONE SQL TRANSACTION that:
 *   0. refuses unless source_ask takes its class (PERM, PERM-SOURCE: migration 20261123130001 in force);
 *   1. records each owner new to the CRM as an organiser (one already there by its name is left as it is), and each
 *      published address as a contact with the whole conspicuous publication basis (the page, the day read, the no
 *      refusal check, the role, why the ask fits, the drafted file as evidence); an address already a contact is used
 *      as it stands. An owner is never matched by its website: a council's or a tourism body's domain hosts many
 *      organisers (the rolled back TEST run of 23 November 2026 put the City of Ballarat's letter on Ballarat Aquatic and
 *      Lifestyle Centre, ballarat.vic.gov.au, and the Bendigo Visitor Centre's on Bendigo Art Gallery,
 *      bendigoregion.com.au), so a website another organiser already holds is noted, not claimed (organisers_one_per_website);
 *   2. stores the template source_ask, version 1 (refused if that key is stored with other words);
 *   3. makes the play 'Source asks, 23 November 2026' and approves it on the founder's words, as the ACQ play of
 *      20 November was approved (C:/dev/EVIDENCE/EL-20NOV/acq/acq-20-APPLY.sql), its daily cap the letters it carries;
 *   4. writes each letter as a HELD first message in that play (purpose cadence, step 1, as the venue asks), its context
 *      the play, the contact's own unsubscribe link in each, held for no rule; a letter to an organisation already
 *      written to, or one that has replied, is not drafted (one-first-letter.ts), nor one to an address the CRM already
 *      holds for another organiser (its greeting would not name its own team), so nothing is refused at send;
 *   5. reads it all back.
 * Nothing here queues or sends. The engine does: source_ask v1 is a standing template in the gateway's record
 * (C:\dev\comms-gateway\standing-approvals.json), so the self queue (src/lib/outreach/self-queue.ts) queues each held
 * letter that is that template with only its fields filled, into the recipient's next window, and the sender sends it
 * from hello@.
 * Idempotent: an organiser, contact, template, play or letter already there is left as it is, and a second run adds
 * nothing. The database judges every row again (organiser_contacts_basis_is_whole, outreach_touch_is_lawful,
 * outreach_touch_takes_its_class). Not loaded: What's On Melbourne, a website form the founder sends by hand, and the
 * City of Greater Bendigo, whose address shares bendigo.vic.gov.au with the one Bendigo letter (tourism@).
 *
 *   npx tsx scripts/ops/outreach-source-asks.ts --by <auth user uuid> [--into <dir>]
 *       writes <dir>/load-DRY.sql, ending in rollback;, and <dir>/load-APPLY.sql, identical but for its last word,
 *       commit;. Runs nothing.
 *   powershell -NoProfile -File C:/dev/ops/with-supabase-token.ps1 npx tsx scripts/ops/outreach-source-asks.ts --by <TEST user uuid> --test
 *       writes <dir>/load-TEST.sql (migration 20261123130001, then the same body) and runs it on TEST (the only ref it
 *       runs on), rolled back: its read back is raised as the error, so the rollback cannot swallow it.
 *
 * PRODUCTION: this never connects to production. The APPLY file is applied by the logged apply (operating rule 4,
 * C:\dev\PRODUCTION-WRITES.txt), after its DRY run, and only once migration 20261123130001 is in force there.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOURCE_ASK_EMAIL, SOURCE_ASK_PLAY, draftSourceAsk, sourceAskVoiceMessage, type SourceAskData } from '../../src/lib/outreach/source-asks'
import { readVoicePolicy, voiceProblems } from '../../src/lib/outreach/voice-gate'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
if ((TEST_REF as string) === PRODUCTION_REF) throw new Error('outreach-source-asks runs on TEST only')

const args = process.argv.slice(2)
const arg = (n: string): string | null => (args.indexOf(n) >= 0 ? (args[args.indexOf(n) + 1] ?? null) : null)
const by = arg('--by')
if (!by || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(by)) {
  console.error('usage: npx tsx scripts/ops/outreach-source-asks.ts --by <auth user uuid> [--into <dir>] [--test]')
  process.exit(2)
}
const into = arg('--into') ?? 'C:/dev/EVIDENCE/EL-23NOV/source-asks'
const onTest = args.includes('--test')

const DATA = 'scripts/ops/data/source-asks-23nov.json'
const MIGRATION = 'supabase/migrations/20261123130001_source_ask_takes_its_class.sql'
const data = JSON.parse(readFileSync(DATA, 'utf8')) as SourceAskData
// The token is put in by the database, from each contact's own row, so no link is ever guessed.
const TOKEN = '__SOURCE_ASK_UNSUBSCRIBE_TOKEN__'
const UNSUBSCRIBE = `https://www.eventlinqs.com.au/unsubscribe/outreach?t=${TOKEN}`
// The gateway's checks read a link of the real shape: a contact's token is a uuid.
const SAMPLE = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000000'

const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`)
const arr = (xs: string[]): string => `array[${xs.map(q).join(', ')}]::text[]`

// Every draft passes the messages file's rules and the gateway's own checks, or nothing is written.
const policy = readVoicePolicy()
const drafted = data.asks.map((ask) => ({ ask, draft: draftSourceAsk(ask, UNSUBSCRIBE) }))
let refused = false
for (const { ask, draft } of drafted) {
  const words = voiceProblems(sourceAskVoiceMessage(ask, { ...draft, body: draft.body.replace(UNSUBSCRIBE, () => SAMPLE) }), policy)
  for (const why of [...draft.ruleFailures, ...words]) {
    console.error(`REFUSED: ${ask.organiser}: ${why}`)
    refused = true
  }
  if (!ask.contact.noMarketingStatementChecked) {
    console.error(`REFUSED: ${ask.organiser}: the page that publishes ${ask.contact.address} was not checked for a statement refusing messages`)
    refused = true
  }
}
// One first letter per organisation (one-first-letter.ts: the same organiser or the same address domain): two letters
// to one domain would see the second refused at send, so the data file may carry only one.
const domains = new Map<string, string>()
for (const { ask } of drafted) {
  const domain = ask.contact.address.split('@')[1]?.toLowerCase() ?? ''
  const other = domains.get(domain)
  if (other) {
    console.error(`REFUSED: ${ask.organiser} and ${other} share ${domain}; one first letter per organisation`)
    refused = true
  }
  domains.set(domain, ask.organiser)
}
if (refused) process.exit(1)

const rows = drafted.map(({ ask, draft }) =>
  `(${[q(ask.id), q(ask.organiser), q(ask.owner), q(ask.website), q(ask.city), q(ask.contact.address), q(ask.contact.publishedOn), q(ask.contact.role), q(ask.contact.relevance), q(ask.contact.evidence), q(draft.subject), q(draft.body), arr(draft.ruleFailures)].join(', ')})`,
)

const source = "WINDOW 5C, 23 November 2026: the source ask (PERM-SOURCE), on the founder's 12:14 adoption; the drafts of C:/dev/EVIDENCE/EL-23NOV/source-asks/SET.md"
const nameKey = (col: string) => `lower(regexp_replace(btrim(${col}), '\\s+', ' ', 'g'))`
const siteKey = (col: string) => `lower(substring(${col} from '^[Hh][Tt][Tt][Pp][Ss]://(?:[Ww][Ww][Ww]\\.)?([^/:?#\\s]+)'))`
const TEMPLATE_ID = `(select id from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)} and version = 1)`
const PLAY_ID = `(select id from public.outreach_plays where name = ${q(SOURCE_ASK_PLAY)})`

const body = `-- The source asks, written by scripts/ops/outreach-source-asks.ts from ${DATA} (WINDOW 5C, 23 November 2026; the
-- founder, 12:14: "Apply the already-approved communication workflow to routine source requests.").
-- And the founder, 14:55: "Just get my engine going, please: my outreach, my photo permissions, everything my system
-- should be doing."
-- ${rows.length} HELD first letters (PERM-SOURCE, from hello@) in the approved play '${SOURCE_ASK_PLAY}'. Not loaded:
-- ${data.notLoaded.map((n) => `${n.source} (${n.channel === 'email' ? 'one first letter per organisation domain' : 'a website form, sent by the founder by hand'})`).join('; ')}.
-- Nothing here queues or sends: the engine's self queue does, under the standing approval of source_ask v1, in each
-- recipient's window. It refuses unless migration 20261123130001 is in force; applied to production only by the logged
-- apply (operating rule 4), its dry run first.
begin;

-- 0. The class must be in force, or the letters would take none and the touch check would refuse them.
do $pre$
begin
  if public.comms_subtype_of_template_key(${q(SOURCE_ASK_EMAIL.key)}) is distinct from 'PERM-SOURCE' then
    raise exception 'refused: source_ask takes no class here (migration 20261123130001 is not in force); nothing loaded';
  end if;
end
$pre$;

create temp table src_ask (id text primary key, organiser text, owner text, website text, city text, address text,
  published_on text, role text, relevance text, evidence text, subject text, body text, held text[]) on commit drop;
insert into src_ask values
${rows.join(',\n')};

-- 1a. Owners new to the CRM, by name: one already there by its name is left as it is. Never by website: a council's or a
--     tourism body's domain hosts many organisers, so a website another organiser holds is noted, never claimed.
insert into public.organisers (name, website_url, found_on, notes, created_by)
select d.organiser,
       case when exists (select 1 from public.organisers o where o.website_key = ${siteKey('d.website')}) then null else d.website end,
       d.published_on,
       'Source ask, 23 November 2026 (PERM-SOURCE): asked for permission to show the event listings it publishes (owner: '
         || d.owner || '; website ' || d.website || '), each with a link back to its own page. City: ' || d.city
         || '. Facts read from ' || d.evidence || '.',
       ${q(by)}
  from src_ask d
 where not exists (select 1 from public.organisers o where o.name_key = ${nameKey('d.organiser')});

create temp table src_ask_org (id text primary key, organiser_id uuid not null) on commit drop;
insert into src_ask_org
select distinct on (d.id) d.id, o.id
  from src_ask d
  join public.organisers o on o.name_key = ${nameKey('d.organiser')}
 order by d.id, o.created_at;

-- 1b. Each published address with its whole basis; an address already a contact is used as it stands.
insert into public.organiser_contacts (organiser_id, role, channel, address, basis, published_on_url, seen_on,
  no_marketing_statement_checked, relevance, evidence_file, basis_recorded_by, basis_recorded_at, created_by)
select g.organiser_id, d.role, 'email', d.address, 'conspicuous_publication', d.published_on, date ${q(data.seenOn)}, true,
       d.relevance, d.evidence, ${q(by)}, now(), ${q(by)}
  from src_ask d join src_ask_org g on g.id = d.id
 where not exists (select 1 from public.organiser_contacts c where c.channel = 'email' and c.address = d.address);

create temp table src_ask_contact (id text primary key, contact_id uuid not null) on commit drop;
insert into src_ask_contact
select d.id, c.id from src_ask d join public.organiser_contacts c on c.channel = 'email' and c.address = d.address;

do $found$
begin
  if (select count(*) from src_ask_org) <> (select count(*) from src_ask) or (select count(*) from src_ask_contact) <> (select count(*) from src_ask) then
    raise exception 'refused: % of % owners and % of % addresses are in the CRM; nothing loaded',
      (select count(*) from src_ask_org), (select count(*) from src_ask), (select count(*) from src_ask_contact), (select count(*) from src_ask);
  end if;
end
$found$;

-- 2. The template, version 1, never edited: stored once, and refused if the key is stored with other words.
insert into public.outreach_templates (key, version, channel, purpose, step, subject, body, source, created_by)
select ${q(SOURCE_ASK_EMAIL.key)}, 1, ${q(SOURCE_ASK_EMAIL.channel)}, ${q(SOURCE_ASK_EMAIL.purpose)}, ${SOURCE_ASK_EMAIL.step}::smallint,
       ${q(SOURCE_ASK_EMAIL.subject)}, ${q(SOURCE_ASK_EMAIL.body)}, ${q(source)}, ${q(by)}
 where not exists (select 1 from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)});

do $tpl$
begin
  if not exists (select 1 from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)} and version = 1
                  and body = ${q(SOURCE_ASK_EMAIL.body)} and subject is not distinct from ${q(SOURCE_ASK_EMAIL.subject)})
     or exists (select 1 from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)} and version > 1) then
    raise exception 'refused: source_ask is stored with other words; nothing loaded';
  end if;
end
$tpl$;

-- 3. The play, approved on the founder's words of 12:14 and 14:55 (above), as the ACQ play of 20 November was: its daily
--    cap the letters it carries, never growing; no follow up step.
insert into public.outreach_plays (name, cohort_rule, step1_template_id, cap_start, cap_step, cap_max, created_by)
select ${q(SOURCE_ASK_PLAY)},
       jsonb_build_object('organisers', (select jsonb_agg(x order by x) from (select distinct organiser_id::text as x from src_ask_org) s)),
       ${TEMPLATE_ID}, ${rows.length}, 0, ${rows.length},
       ${q(by)}
 where not exists (select 1 from public.outreach_plays where name = ${q(SOURCE_ASK_PLAY)});
update public.outreach_plays set state = 'approved', approved_by = ${q(by)}, approved_at = now()
 where name = ${q(SOURCE_ASK_PLAY)} and state = 'draft';

-- 4a. An organisation already written to, or one that has replied, is not written to cold again (one-first-letter.ts:
--     the same organiser or the same address domain; any message sent to this very address counts too): that letter is
--     not drafted, and the read back says why, so nothing is refused at send.
create temp table src_ask_written (id text primary key, why text not null) on commit drop;
-- An address the CRM already holds for another organiser: its greeting would not name its own team (touch-voice.ts).
insert into src_ask_written
select d.id, 'not drafted: ' || c.address || ' is already a contact of ' || o.name || ' in the CRM, so its greeting would not name its own team'
  from src_ask d
  join src_ask_contact k on k.id = d.id
  join public.organiser_contacts c on c.id = k.contact_id
  join public.organisers o on o.id = c.organiser_id
 where o.name_key <> ${nameKey('d.organiser')};
insert into src_ask_written
select d.id, 'not drafted: already written to or replied at ' || string_agg(distinct c2.address, ', ' order by c2.address)
             || ' (one first letter per organisation: src/lib/outreach/one-first-letter.ts)'
  from src_ask d
  join src_ask_contact k on k.id = d.id
  join public.organiser_contacts c on c.id = k.contact_id
  join public.organiser_contacts c2 on c2.organiser_id = c.organiser_id
       or (c2.channel = 'email' and lower(split_part(c2.address, '@', 2)) = lower(split_part(c.address, '@', 2)))
 where exists (select 1 from public.outreach_touches t2 where t2.contact_id = c2.id and t2.state in ('queued', 'sending', 'sent'))
    or exists (select 1 from public.outreach_replies r where r.contact_id = c2.id)
 group by d.id
on conflict (id) do nothing;

-- 4b. The letters, HELD in that play for no rule; each carries its contact's own unsubscribe link.
insert into public.outreach_touches (contact_id, purpose, step, template_id, play_id, context_key, subject, body, held_because, state, drafted_by)
select k.contact_id, 'cadence', 1, ${TEMPLATE_ID}, ${PLAY_ID}, 'play:' || ${PLAY_ID},
       d.subject, replace(d.body, ${q(TOKEN)}, c.unsubscribe_token::text), d.held, 'held', ${q(by)}
  from src_ask d
  join src_ask_contact k on k.id = d.id
  join public.organiser_contacts c on c.id = k.contact_id
 where not exists (select 1 from public.outreach_touches t join public.outreach_templates tp on tp.id = t.template_id
                    where t.contact_id = k.contact_id and tp.key = ${q(SOURCE_ASK_EMAIL.key)} and t.state <> 'void')
   and not exists (select 1 from src_ask_written w where w.id = d.id);

-- 5. Read back: the play, the template, and each letter as the CRM now holds it.
__READ_BACK__`

const readBack = `json_build_object(
  'play', (select json_build_object('id', p.id, 'name', p.name, 'state', p.state, 'approved_by', p.approved_by, 'cap', p.cap_start || ' to ' || p.cap_max,
             'cohort', jsonb_array_length(p.cohort_rule -> 'organisers'),
             'step1', (select key || ' v' || version from public.outreach_templates where id = p.step1_template_id),
             'letters', (select count(*) from public.outreach_touches t where t.play_id = p.id and t.state <> 'void'))
             from public.outreach_plays p where p.name = ${q(SOURCE_ASK_PLAY)}),
  'template', (select json_agg(json_build_object('key', key, 'version', version, 'subject', subject)) from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)}),
  'not_drafted', (select json_object_agg(id, why) from src_ask_written),
  'letters', (select json_agg(json_build_object('organiser', o.name, 'greeting_is_its_team', position('Hi ' || o.name || ' team,' in d.body) = 1,
              'address', c.address, 'basis', c.basis, 'published_on', c.published_on_url, 'seen_on', c.seen_on,
              'page_checked', c.no_marketing_statement_checked, 'touch', t.id, 'state', t.state, 'step', t.step,
              'class', t.comms_category || ' ' || t.comms_subtype || ' (' || t.comms_source || ')', 'context', t.context_key,
              'subject', t.subject, 'held_because', t.held_because,
              'body_as_drafted', t.body = replace(d.body, ${q(TOKEN)}, c.unsubscribe_token::text),
              'unsubscribe_is_its_own', position(${q(TOKEN)} in t.body) = 0 and position('/unsubscribe/outreach?t=' || c.unsubscribe_token::text in t.body) > 0)
              order by d.id)
              from src_ask d
              join src_ask_contact k on k.id = d.id
              join public.organiser_contacts c on c.id = k.contact_id
              join public.organisers o on o.id = c.organiser_id
              left join public.outreach_touches t on t.contact_id = c.id and t.state <> 'void'
                and t.template_id in (select id from public.outreach_templates where key = ${q(SOURCE_ASK_EMAIL.key)}))
)`

const writeFile = (name: string, text: string) => {
  const file = join(into, name)
  writeFileSync(file, text)
  console.log(`wrote ${file}`)
}

if (onTest) {
  // TEST: the migration first, in the same transaction, then the body; the read back is raised, so nothing stays.
  const migration = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n')
  const ending = `do $readback$ begin raise exception 'SOURCE ASKS READ BACK %', (select ${readBack})::text; end $readback$;\n`
  // Law 14: a replacement passes a function, never a string, so a '$' in the SQL is never read as a pattern.
  const testSql = body
    .replace('begin;\n', () => `begin;\n\n-- TEST only: migration 20261123130001 as committed, rolled back with the rest.\n${migration}\n`)
    .replace('__READ_BACK__', () => ending)
  writeFile('load-TEST.sql', testSql)
  runOnTest(testSql).catch((err: unknown) => {
    console.error('the TEST run failed:', err)
    process.exitCode = 1
  })
} else {
  // PRODUCTION: two files from one body, identical but for the last word.
  const withReadBack = body.replace('__READ_BACK__', () => `select ${readBack} as source_asks;\n\n`)
  writeFile('load-DRY.sql', `${withReadBack}rollback;\n`)
  writeFile('load-APPLY.sql', `${withReadBack}commit;\n`)
}
console.log(`${rows.length} letters; not loaded: ${data.notLoaded.map((n) => n.source).join('; ')}`)

// tsx compiles this file as CommonJS here, which has no top-level await.
async function runOnTest(sql: string): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('run through C:/dev/ops/with-supabase-token.ps1')
  // The Management API runs the whole text as one request: rolled back, the raised read back is the answer.
  const res = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  console.log(`TEST (${TEST_REF}), rolled back: HTTP ${res.status}`)
  console.log(text.slice(0, 20000))
  if (!text.includes('SOURCE ASKS READ BACK')) process.exitCode = 1
}
