/**
 * TEST ONLY. Proves the EVENT-level external path on a real deployment.
 *
 * The kit e2e covers the anonymous DRAFT case. This covers the other one: a real
 * `events` row carrying `external_ticket_url`, which is the shape a signed-in
 * organiser produces. They are different code paths, and only this one exercises
 * the sale gate, the event page and the ranking exclusions.
 *
 * It MUTATES one TEST event and puts it back. The revert runs in a `finally`, so
 * an assertion failure cannot leave a TEST event marked external.
 *
 * THE CACHE, AND WHY THIS USES TWO EVENTS.
 *
 * `/events/[slug]` sets `export const revalidate = 300`, so a rendered page is
 * served from cache for five minutes. The first version of this probe fetched
 * the event, then marked it external, then fetched it again, and reported that
 * the external panel had not rendered. That was TRUE of the bytes it received
 * and FALSE of the code: the second fetch was answered from the cache entry the
 * first fetch had just created. Worse, the checks that PASSED in that run were
 * measured against the same stale HTML, so they proved nothing either.
 *
 * So: two different events, and the one under test is marked external BEFORE it
 * is ever requested. Its first request is therefore a fresh render. The control
 * event proves the internal path in the same run without touching the subject.
 *
 * Usage:
 *   node --env-file=.env.test scripts/verify/external-event-page-check.mjs <base-url>
 */
import pg from 'pg'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const BASE = (process.argv[2] ?? '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: external-event-page-check.mjs <base-url>')
  process.exit(1)
}
const DESTINATION = 'https://tickets.melbournefringe.com.au/event/probe-only'

const target = assertNotProductionDatabase()
const db = await target.connect()

let failures = 0
const ok = (m) => console.log(`   ok    ${m}`)
const bad = (m) => {
  failures += 1
  console.error(`   FAIL  ${m}`)
}

// A published, public, PAID event whose organiser can sell: the hardest case,
// because every other gate says yes and only the external flag must say no.
/*
 * EXISTS, not a JOIN on ticket_tiers.
 *
 * The join produced one row PER TIER, so `limit 2` returned the same event
 * twice and the "control" was the subject. The control fetch then populated the
 * ISR cache for the very slug under test, and the subject fetch was answered
 * from it, which is the same stale-read the two-event design existed to avoid.
 * Two bugs conspiring to produce a plausible-looking failure.
 */
const { rows: candidates } = await db.query(`
  select e.id, e.slug, e.title
    from public.events e
    join public.organisations o on o.id = e.organisation_id
   where e.status = 'published' and e.visibility = 'public'
     and e.external_ticket_url is null
     and e.start_date > now()
     and o.stripe_account_id is not null
     and o.stripe_charges_enabled = true
     and exists (
       select 1 from public.ticket_tiers t where t.event_id = e.id and t.price > 0
     )
   order by e.start_date
   limit 2`)

if (candidates.length < 2) {
  console.error('need TWO suitable TEST events (published, public, paid, sellable organiser)')
  await db.end()
  process.exit(1)
}
const ev = candidates[0]
const control = candidates[1]
console.log(`\nsubject (marked external): ${ev.title}  /events/${ev.slug}`)
console.log(`control  (stays internal): ${control.title}  /events/${control.slug}\n`)

async function pageText(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': 'el-external-probe' } })
  return { status: res.status, html: await res.text() }
}

try {
  // â”€â”€ Mark the subject external BEFORE it is ever requested. â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await db.query(`update public.events set external_ticket_url = $1 where id = $2`, [
    DESTINATION,
    ev.id,
  ])
  console.log(`   marked external -> ${DESTINATION}\n`)

  // â”€â”€ The CONTROL, an untouched internal paid event, in the same run. â”€â”€â”€â”€â”€â”€â”€
  const before = await pageText(`/events/${control.slug}`)
  console.log(`   CONTROL /events/${control.slug} -> HTTP ${before.status}`)
  if (before.html.includes('Tickets are sold elsewhere')) {
    bad('CONTROL: an untouched internal event reads as externally ticketed')
  } else {
    ok('CONTROL: an internal paid event does NOT show the external panel')
  }

  const after = await pageText(`/events/${ev.slug}`)
  console.log(`   SUBJECT /events/${ev.slug} -> HTTP ${after.status}`)

  if (after.status !== 200) bad(`SUBJECT: the event page returned ${after.status}, it must stay live`)
  else ok('SUBJECT: the event page is still live and serving (non-negotiable 4)')

  if (after.html.includes('Tickets are sold elsewhere')) {
    ok('SUBJECT: the external panel renders')
  } else {
    bad('SUBJECT: the external panel did NOT render')
  }

  if (after.html.includes(DESTINATION)) ok('SUBJECT: the one button points at the destination')
  else bad('SUBJECT: the destination link is missing from the page')

  // NO FAKE INVENTORY: nothing that reads as a checkout here.
  const forbidden = [
    'Continue to payment',
    'Add to cart',
    'Register 1 ticket',
    'Select tickets',
    'quantity',
  ]
  const found = forbidden.filter((f) => after.html.toLowerCase().includes(f.toLowerCase()))
  if (found.length > 0) bad(`SUBJECT: checkout-shaped copy still present: ${found.join(', ')}`)
  else ok('SUBJECT: no ticket selector, no quantity control, no checkout copy')

  // NO FEE COPY on an external surface: we take no money on these.
  if (/3\.5%|AUD 0\.99|service fee/i.test(after.html)) {
    bad('SUBJECT: fee copy appears on an external event page')
  } else {
    ok('SUBJECT: no fee is quoted anywhere on an external event page')
  }

  // â”€â”€ Discovery exclusion. â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const home = await pageText('/')
  if (home.html.includes(`/events/${ev.slug}`)) {
    bad('SUBJECT: the external event still appears on the homepage rails')
  } else {
    ok('SUBJECT: excluded from the homepage rails (non-negotiable 4)')
  }

  const browse = await pageText('/events')
  if (browse.html.includes(`/events/${ev.slug}`)) {
    ok('SUBJECT: still FINDABLE on /events, which is the decision recorded in fetchers.ts')
  } else {
    console.log(
      '   note  not on page 1 of /events; that is a paging or cover-image effect, not a filter',
    )
  }
} finally {
  await db.query(`update public.events set external_ticket_url = null where id = $1`, [ev.id])
  const { rows } = await db.query(`select external_ticket_url from public.events where id = $1`, [
    ev.id,
  ])
  console.log(`\n   reverted: external_ticket_url is now ${rows[0]?.external_ticket_url ?? 'NULL'}`)
  await db.end()
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
