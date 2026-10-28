/**
 * AMCF, THE REAL ORGANISER PILOT, AS A CRM RECORD (window 6, 28 October 2026; the engine plan's additions: "AMCF IS THE
 * REAL PILOT: its photographs were supplied by the organiser, Fred Alale AM (chair@amcf.org.au), after Lawal's
 * outreach and approval").
 *
 *   node scripts/ops/outreach-pilot-amcf.mjs --by <auth user uuid> [--into <dir>]                     writes the SQL
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/outreach-pilot-amcf.mjs --by <uuid> --test     and runs it on TEST
 *
 * Writes the organiser and Fred as a contact, with NO basis and NO messages: the basis is recorded by
 * scripts/ops/outreach-basis.mjs --organiser "<the organiser's name>" from the page his address is published on, and Lawal's three emails and Fred's replies (the Outlook thread "AMCF 2026, could I ask your
 * advice?", 2, 23 and 26 October) are logged VERBATIM from that thread, which only Lawal holds; nothing here invents
 * their words or dates. The organiser is not linked to the AMCF account on EventLinqs: that account was made by the
 * listing import, not by Fred's claim, and a claim is what links an organiser to an account.
 *
 * The organiser's name is read from the AMCF account row (organisations, slug amcf), never typed here, and the record
 * is found again by its website, which is unique among organisers.
 *
 * Idempotent. Production: the written file ends in ROLLBACK for Lawal's APPLY (operating rule 4).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const args = process.argv.slice(2)
const arg = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null)
const by = arg('--by')
if (!by || !/^[0-9a-f-]{36}$/i.test(by)) {
  console.error('usage: node scripts/ops/outreach-pilot-amcf.mjs --by <auth user uuid> [--into <dir>] [--test]')
  process.exit(2)
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`

const statements = `
insert into public.organisers (name, website_url, found_on, notes, created_by)
select a.name, 'https://amcf.org.au', 'https://amcf.org.au',
        ${q("The real organiser pilot. Photographs, a press release and promotional contacts supplied by the organiser after Lawal's outreach and approval (Outlook thread AMCF 2026, could I ask your advice?, 2, 23 and 26 October 2026). Approval for AMCF 2026 is not assumed to cover future AMCF events or paid advertising.")},
        ${q(by)}
  from public.organisations a where a.slug = 'amcf'
on conflict do nothing;

insert into public.organiser_contacts (organiser_id, person_name, role, channel, address, created_by)
select o.id, 'Fred Alale AM', 'Chair', 'email', 'chair@amcf.org.au', ${q(by)}
  from public.organisers o
 where o.website_key = 'amcf.org.au'
on conflict do nothing;
`
const out = arg('--into') ?? tmpdir()
writeFileSync(join(out, 'outreach-pilot-amcf-DRY-RUN.sql'), `-- AMCF as a CRM record. Dry run: ends in ROLLBACK.\nbegin;\n${statements}\nrollback;\n`)
console.log(`wrote ${join(out, 'outreach-pilot-amcf-DRY-RUN.sql')}`)

if (args.includes('--test')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('--test needs SUPABASE_ACCESS_TOKEN')
  const run = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) })
    const body = await r.text()
    if (!r.ok) throw new Error(`TEST refused (HTTP ${r.status}): ${body.slice(0, 500)}`)
    return JSON.parse(body)
  }
  await run(`begin;${statements}commit;`)
  const read = await run(`select o.name, c.person_name, c.address, c.basis from public.organisers o join public.organiser_contacts c on c.organiser_id = o.id where o.website_key = 'amcf.org.au'`)
  console.log(`TEST (${TEST_REF}) read back: ${JSON.stringify(read)}`)
}
