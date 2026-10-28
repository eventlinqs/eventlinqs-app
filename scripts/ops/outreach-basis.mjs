/**
 * RECORD A CONTACT's BASIS WHOLE, FROM THE PAGE THE ADDRESS IS PUBLISHED ON, OR NOT AT ALL (window 6, 28 October 2026).
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/ops/outreach-basis.mjs --by <auth user uuid> --test [--evidence <dir>]
 *
 * Spam Act Schedule 2 clause 4 and ACMA's June 2024 expectation, as migration 20261028201001 records them: a published
 * address is a basis only when (1) it is conspicuously published, (2) the publication carries no statement that they do
 * not want messages, and (3) the message relates to their role. So, for each organiser with a website:
 *
 *   1. fetch their own site's home, contact and about pages (and the page they were found on);
 *   2. take an address only if it appears ON one of those pages (written out or as a mailto link), at their own domain
 *      or already named for them in the cohort files; an address appearing nowhere is left with no basis;
 *   3. read that page for a statement against messages ("no unsolicited", "not for marketing", "no sales enquiries" and
 *      the like); one found leaves the address with no basis and says so;
 *   4. otherwise record the basis whole: the page, the date seen, the no-messages check, why the message fits their
 *      role (they run the nights EventLinqs lists), and the saved copy of the page as the evidence file.
 *
 * Every decision is written to a report beside the saved pages. Nothing here sends anything. TEST only; for
 * production the same run is a dry run for Lawal's APPLY (operating rule 4).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const args = process.argv.slice(2)
const arg = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null)
const by = arg('--by')
const evidence = arg('--evidence') ?? 'C:/dev/EVIDENCE/CRM-28OCT/basis'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!by || !/^[0-9a-f-]{36}$/i.test(by) || !args.includes('--test') || !token) {
  console.error('usage: scripts\\ops\\with-supabase-token.ps1 node scripts/ops/outreach-basis.mjs --by <uuid> --test [--evidence <dir>]')
  process.exit(2)
}
mkdirSync(evidence, { recursive: true })

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) })
  const body = await r.text()
  if (!r.ok) throw new Error(`TEST refused (HTTP ${r.status}): ${body.slice(0, 400)}`)
  return JSON.parse(body)
}
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

/** Statements against receiving messages, as publications word them. A hit leaves the address without a basis. */
const AGAINST = [
  /\b(no|not for|do not send|don'?t send)\s+(unsolicited|marketing|commercial|promotional|sales)\b/i,
  /\bunsolicited\s+(commercial\s+)?(e-?mails?|messages?|marketing|solicitations?)\b/i,
  /\bnot\s+(to\s+be\s+)?used\s+for\s+(marketing|commercial|promotional|unsolicited)\b/i,
  /\bno\s+(sales|marketing|cold)\s+(calls?|e-?mails?|enquiries|inquiries|pitches)\b/i,
  /\b(we\s+do\s+not|we\s+don'?t)\s+(accept|want|welcome)\s+(solicitations|marketing|sales)\b/i,
]

const PATHS = ['', '/contact', '/contact-us', '/about', '/about-us']
const today = new Date().toISOString().slice(0, 10)

function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}
function addresses(html) {
  const found = new Set()
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase())
  for (const m of text(html).matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) found.add(m[0].toLowerCase())
  return [...found].filter((a) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(a) && !/(sentry|wixpress|example\.com|domain\.com)/i.test(a))
}
const domainOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * One page, or null. The 15 second limit covers the body as well as the headers: the first run hung for half an hour on
 * a site that sent its headers and then stalled, because the timer was cleared before the body was read.
 */
async function get(url) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'EventLinqs listing check (hello@eventlinqs.com)' } })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.includes('html')) return null
    return { url: r.url, html: await r.text() }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const organisers = await sql(`select o.id, o.name, o.website_url, o.found_on, o.notes,
    coalesce(json_agg(json_build_object('id', c.id, 'address', c.address, 'basis', c.basis)) filter (where c.channel = 'email'), '[]') as emails,
    coalesce(json_agg(json_build_object('id', c.id, 'address', c.address, 'basis', c.basis)) filter (where c.channel = 'instagram'), '[]') as instagram
  from public.organisers o left join public.organiser_contacts c on c.organiser_id = o.id and c.channel in ('email', 'instagram')
 group by o.id order by o.name`)

const report = []
let recorded = 0
// Four organisers at a time: the pages are slow to answer, not heavy to read.
async function check(o, n) {
  console.log(`[${n}/${organisers.length}] ${o.name}`)
  const known = o.emails.map((e) => e.address)
  const site = o.website_url ?? (known[0] ? `https://${known[0].split('@')[1]}` : null)
  if (!site) {
    report.push({ organiser: o.name, outcome: 'no website and no address: nothing to check' })
    return
  }
  const siteDomain = domainOf(site)
  const pages = []
  for (const p of PATHS) {
    const page = await get(site.replace(/\/+$/, '') + p)
    if (page && !pages.some((x) => x.url === page.url)) pages.push(page)
  }
  if (o.found_on && domainOf(o.found_on) === siteDomain) {
    const page = await get(o.found_on)
    if (page && !pages.some((x) => x.url === page.url)) pages.push(page)
  }
  if (pages.length === 0) {
    report.push({ organiser: o.name, outcome: `${site} could not be read: no basis recorded` })
    return
  }
  // Their own addresses on their own pages: at their domain, or one the cohort files already named for them.
  const candidates = new Map()
  for (const page of pages) {
    for (const a of addresses(page.html)) {
      const d = a.split('@')[1]
      if (d === siteDomain || d.endsWith(`.${siteDomain}`) || known.includes(a)) if (!candidates.has(a)) candidates.set(a, page)
    }
  }
  // Their Instagram handle, published by a link from their own site to the profile: the same reading as an address.
  for (const ig of o.instagram ?? []) {
    if (ig.basis !== 'none') continue
    const page = pages.find((p) => new RegExp(`instagram\\.com/${ig.address.replace(/\./g, '\\.')}(?![a-z0-9._])`, 'i').test(p.html))
    if (!page) {
      report.push({ organiser: o.name, instagram: ig.address, outcome: 'their site does not link to this profile: no basis recorded' })
      continue
    }
    const words = text(page.html)
    const against = AGAINST.find((re) => re.test(words))
    if (against) {
      report.push({ organiser: o.name, instagram: ig.address, page: page.url, outcome: `a statement against messages on the page (${words.match(against)[0]}): no basis recorded` })
      continue
    }
    const file = join(evidence, `instagram-${ig.address}-${today}.html`)
    writeFileSync(file, `<!-- ${page.url}, read ${new Date().toISOString()} by scripts/ops/outreach-basis.mjs for instagram.com/${ig.address} -->\n${page.html}`)
    const runs = (o.notes ?? '').match(/Runs: ([^.]*)\./)?.[1]
    const relevance = `${o.name} runs ${runs && runs !== 'not stated' ? runs : 'nights'} that EventLinqs lists; an invitation to list and feature them free relates to their role as organiser.`.slice(0, 500)
    await sql(`update public.organiser_contacts set basis = 'conspicuous_publication', published_on_url = ${q(page.url)}, seen_on = ${q(today)}, no_marketing_statement_checked = true,
      relevance = ${q(relevance)}, evidence_file = ${q(file)}, basis_recorded_by = ${q(by)}, basis_recorded_at = now() where id = ${q(ig.id)} and basis = 'none'`)
    recorded++
    report.push({ organiser: o.name, instagram: ig.address, page: page.url, outcome: 'basis recorded whole (their site links to the profile)', evidence: file })
  }
  for (const k of known) if (!candidates.has(k)) report.push({ organiser: o.name, address: k, outcome: `not found on ${pages.map((p) => p.url).join(', ')}: no basis recorded` })
  if (candidates.size === 0) {
    report.push({ organiser: o.name, outcome: `no address of theirs published on ${pages.length} page(s) of ${site}` })
    return
  }
  for (const [address, page] of candidates) {
    const words = text(page.html)
    const against = AGAINST.find((re) => re.test(words))
    const existing = o.emails.find((e) => e.address === address)
    if (existing && existing.basis !== 'none') {
      report.push({ organiser: o.name, address, outcome: 'basis already recorded' })
      continue
    }
    if (against) {
      report.push({ organiser: o.name, address, page: page.url, outcome: `a statement against messages on the page (${words.match(against)[0]}): no basis recorded` })
      continue
    }
    const file = join(evidence, `${address.replace(/[^a-z0-9.@-]/gi, '_')}-${today}.html`)
    writeFileSync(file, `<!-- ${page.url}, read ${new Date().toISOString()} by scripts/ops/outreach-basis.mjs for ${address} -->\n${page.html}`)
    const runs = (o.notes ?? '').match(/Runs: ([^.]*)\./)?.[1]
    const relevance = `${o.name} runs ${runs && runs !== 'not stated' ? runs : 'nights'} that EventLinqs lists; an invitation to list and feature them free relates to their role as organiser.`.slice(0, 500)
    const basis = `basis = 'conspicuous_publication', published_on_url = ${q(page.url)}, seen_on = ${q(today)}, no_marketing_statement_checked = true,
      relevance = ${q(relevance)}, evidence_file = ${q(file)}, basis_recorded_by = ${q(by)}, basis_recorded_at = now()`
    if (existing) await sql(`update public.organiser_contacts set ${basis} where id = ${q(existing.id)} and basis = 'none'`)
    else
      await sql(`insert into public.organiser_contacts (organiser_id, role, channel, address, created_by) values (${q(o.id)}, 'Published contact address', 'email', ${q(address)}, ${q(by)})
                 on conflict do nothing; update public.organiser_contacts set ${basis} where channel = 'email' and address = ${q(address)} and basis = 'none'`)
    recorded++
    report.push({ organiser: o.name, address, page: page.url, outcome: 'basis recorded whole', evidence: file })
  }
}
const queue = organisers.map((o, i) => [o, i + 1])
async function worker() {
  while (queue.length) {
    const [o, n] = queue.shift()
    await check(o, n)
  }
}
await Promise.all([worker(), worker(), worker(), worker()])

writeFileSync(join(evidence, `basis-report-${today}.json`), JSON.stringify(report, null, 1))
const read = (await sql(`select (select count(*) from public.organiser_contacts where channel = 'email')::int as email_contacts,
  (select count(*) from public.organiser_contacts where channel = 'email' and basis <> 'none')::int as with_a_whole_basis,
  (select count(distinct organiser_id) from public.organiser_contacts where channel = 'email' and basis <> 'none')::int as organisers_writable,
  (select count(*) from public.organiser_contacts where channel = 'instagram' and basis <> 'none')::int as instagram_with_a_whole_basis`))[0]
console.log(`organisers checked ${organisers.length}; bases recorded this run ${recorded}; TEST read back ${JSON.stringify(read)}; report ${join(evidence, `basis-report-${today}.json`)}`)
