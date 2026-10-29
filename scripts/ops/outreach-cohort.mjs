/**
 * THE FIRST OUTREACH COHORT: RECURRING ORGANISERS FROM THE LISTINGS AND THE VICTORIA SMALL HOSTS FILE (window 6,
 * 28 October 2026; the engine plan, window 6: "first cohort of 100 to 150 recurring organisers from design\listings and
 * the Victoria small hosts file").
 *
 *   node scripts/ops/outreach-cohort.mjs --by <auth user uuid> [--into <dir>]        writes the cohort and the SQL
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/outreach-cohort.mjs --by <uuid> --test   and runs it on TEST
 *
 * WHO IS IN IT. Every host in C:\dev\design\amcf-21oct\Victoria small hosts v1.csv (each a recurring host by the file's
 * own purpose), then every listings host whose nights recur: a row marked weekly, a free-week guide row, or a host with
 * more than one dated row. One-off ticketed shows are not organisers to recruit. Duplicates by name are one organiser.
 *
 * WHAT IS RECORDED: the organiser (name, website, Instagram, the page they were found on, what they run); a link to a
 * venue already listed under the same name; and their published contacts: an Instagram handle (for a DM by hand) and an
 * email address the file names. EVERY CONTACT IS WRITTEN WITH BASIS NONE. A published address is never a basis by
 * itself (ACMA's June 2024 expectation, in migration 20261028201001): the basis is recorded whole only from the page the
 * address is actually published on, with the date seen and the no-messages check, by scripts/ops/outreach-basis.mjs.
 * Until then the database refuses any message to them.
 *
 * Idempotent: an organiser, contact or link already there is skipped. PRODUCTION: the written SQL ends in ROLLBACK, for
 * Lawal's APPLY (operating rule 4). This script never connects to production.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const args = process.argv.slice(2)
const arg = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null)
const by = arg('--by')
if (!by || !/^[0-9a-f-]{36}$/i.test(by)) {
  console.error('usage: node scripts/ops/outreach-cohort.mjs --by <auth user uuid> [--into <dir>] [--test]')
  process.exit(2)
}

const LISTINGS = 'C:/dev/design/listings'
const SMALL_HOSTS = 'C:/dev/design/amcf-21oct/Victoria small hosts v1.csv'
const LISTING_FILES = [
  'import-2026-10-26.csv',
  'import-2026-10-27-wi3-free-25.csv',
  'import-2026-10-27-wi3-ticketed-43.csv',
  'melbourne free week 2026-10-22.csv',
  'ballarat free week 2026-10-22.csv',
  'bendigo free week 2026-10-22.csv',
]

/** RFC 4180 enough for these files: quoted fields with commas, doubled quotes and line breaks. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row) }
  const [head, ...body] = rows
  const keys = head.map((h) => h.replace(/^\uFEFF/, '').trim())
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

const key = (name) => name.toLowerCase().replace(/\s+/g, ' ').trim()
const https = (u) => {
  const v = (u ?? '').trim()
  if (!v) return null
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(withScheme.replace(/^http:/i, 'https:')) ? withScheme.replace(/^http:/i, 'https:') : null
}
const instagram = (v) => {
  const h = (v ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null
}
const emailIn = (v) => {
  const m = (v ?? '').match(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/i)
  return m ? m[0].toLowerCase() : null
}

const cohort = new Map()
function add(o) {
  const k = key(o.name)
  if (!k) return
  const had = cohort.get(k)
  if (!had) cohort.set(k, o)
  else {
    for (const f of ['website', 'instagram', 'email', 'foundOn', 'runs', 'city']) if (!had[f] && o[f]) had[f] = o[f]
    had.rows += o.rows
  }
}

for (const r of parseCsv(readFileSync(SMALL_HOSTS, 'utf8'))) {
  const contact = r.email_or_contact_url
  add({
    name: r.name, source: 'Victoria small hosts v1', priority: Number(r.priority) || 9, rows: 1,
    website: emailIn(contact) ? null : https(contact), instagram: instagram(r.instagram), email: emailIn(contact),
    foundOn: https(r.source_url), runs: [r.what_they_run, r.frequency].filter(Boolean).join('; '), city: r.region,
  })
}

const listingHosts = new Map()
for (const f of LISTING_FILES) {
  const freeWeek = /free week/.test(f)
  for (const r of parseCsv(readFileSync(join(LISTINGS, f), 'utf8'))) {
    const k = key(r.host)
    if (!k) continue
    const h = listingHosts.get(k) ?? { name: r.host, rows: 0, recurring: false, website: null, instagram: null, email: null, foundOn: null, runs: null, city: null }
    h.rows++
    if (freeWeek || /weekly|fortnight|monthly/i.test(r.frequency ?? '')) h.recurring = true
    h.website ??= https(r.website)
    h.instagram ??= instagram(r.instagram)
    h.email ??= emailIn(r.venue_email)
    h.foundOn ??= https(r.source_url)
    h.runs ??= [r.name, r.frequency].filter(Boolean).join('; ')
    h.city ??= r.city || null
    listingHosts.set(k, h)
  }
}
for (const h of listingHosts.values()) {
  if (h.recurring || h.rows > 1) add({ ...h, source: 'design\\listings', priority: 5 })
}

const list = [...cohort.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const values = list
  .map((o) => `(${q(o.name)}, ${q(o.website)}, ${q(o.instagram)}, ${q(o.foundOn)}, ${q(`${o.source}. Runs: ${o.runs ?? 'not stated'}. City: ${o.city ?? 'not stated'}.`.slice(0, 2000))}, ${q(o.email)})`)
  .join(',\n')

// A row refused as a duplicate (its website or Instagram already belongs to an organiser) gives its contacts to that
// organiser, so a merged row's address is not lost. The organiser of its own name comes first.
const organiserOf = `select o.id from public.organisers o
     where o.name_key = lower(regexp_replace(btrim(c.name), '\\s+', ' ', 'g'))
        or (c.instagram is not null and o.instagram_handle = c.instagram)
        or (c.website is not null and o.website_key = lower(substring(c.website from '^[Hh][Tt][Tt][Pp][Ss]://(?:[Ww][Ww][Ww]\\.)?([^/:?#\\s]+)')))
     order by (o.name_key = lower(regexp_replace(btrim(c.name), '\\s+', ' ', 'g'))) desc
     limit 1`

const statements = `
create temp table w6_cohort (name text, website text, instagram text, found_on text, notes text, email text) on commit drop;
insert into w6_cohort values
${values};

-- Organisers: one per name, website and Instagram; a clash on any of the three skips the row.
insert into public.organisers (name, website_url, instagram_handle, found_on, notes, created_by)
select c.name, c.website, c.instagram, c.found_on, c.notes, ${q(by)}
  from w6_cohort c
on conflict do nothing;

-- The venue already listed under the same name, where it has no organiser yet.
insert into public.organiser_venues (venue_id, organiser_id, linked_by)
select distinct on (v.id) v.id, o.id, ${q(by)}
  from w6_cohort c
  join public.organisers o on o.name_key = lower(regexp_replace(btrim(c.name), '\\s+', ' ', 'g'))
  join public.venues v on lower(btrim(v.name)) = lower(btrim(c.name)) and v.removed_at is null
on conflict (venue_id) do nothing;

-- Their published Instagram handle, for a DM by hand. Basis none until it is recorded whole.
insert into public.organiser_contacts (organiser_id, role, channel, address, created_by)
select o.id, 'Instagram account', 'instagram', c.instagram, ${q(by)}
  from w6_cohort c
  join lateral (${organiserOf}) o on true
 where c.instagram is not null
on conflict do nothing;

-- The email address the file names. Basis none until it is recorded whole from the page it is published on.
insert into public.organiser_contacts (organiser_id, role, channel, address, created_by)
select o.id, 'Published contact address', 'email', c.email, ${q(by)}
  from w6_cohort c
  join lateral (${organiserOf}) o on true
 where c.email is not null
on conflict do nothing;
`
const out = arg('--into') ?? tmpdir()
writeFileSync(join(out, 'outreach-cohort.json'), JSON.stringify(list, null, 1))
writeFileSync(join(out, 'outreach-cohort-DRY-RUN.sql'), `-- The first outreach cohort, ${list.length} organisers. Dry run: ends in ROLLBACK.\nbegin;\n${statements}\nselect count(*) as organisers from public.organisers;\nrollback;\n`)
const counts = { organisers: list.length, smallHosts: list.filter((o) => o.source === 'Victoria small hosts v1').length, withWebsite: list.filter((o) => o.website).length, withInstagram: list.filter((o) => o.instagram).length, withEmail: list.filter((o) => o.email).length }
console.log(`cohort: ${JSON.stringify(counts)}; written to ${out}`)

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
  const read = await run(`select (select count(*) from public.organisers)::int as organisers, (select count(*) from public.organiser_venues)::int as venue_links,
    (select count(*) from public.organiser_contacts where channel = 'instagram')::int as instagram_contacts, (select count(*) from public.organiser_contacts where channel = 'email')::int as email_contacts,
    (select count(*) from public.organiser_contacts where basis <> 'none')::int as with_a_basis`)
  console.log(`TEST (${TEST_REF}) read back: ${JSON.stringify(read[0])}`)
}
