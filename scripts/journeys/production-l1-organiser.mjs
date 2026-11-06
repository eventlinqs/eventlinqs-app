/**
 * LAUNCH READINESS ROWS 1, 2, 3, 5, 6, 7, 13 AND 15 ON PRODUCTION: PREPARED, NOT RUN (the CONTROLLER's 23:42 item 6, 6 November
 * 2026). One clearly named test organiser and one test event, both removed at the end. It runs only after a CONTROLLER line
 * quotes Lawal's yes, and refuses without it.
 *
 *   scripts\ops\with-supabase-token.ps1 node scripts/journeys/production-l1-organiser.mjs --yes "<the CONTROLLER line>" \
 *     --email <an inbox the person can read> --out <evidence folder>
 *
 * WHAT ONLY A PERSON DOES, and the script waits for: pasting the confirmation link from the inbox (row 1), Stripe's own
 * onboarding for the test organiser when a paid tier is published (row 3), reading the emails (row 15). Everything else the
 * script drives and reads, in a HEADED browser so the person sees every step; every step is a note and a screenshot in --out.
 *
 * THE TEST NAMES: organisation 'EventLinqs L1 Test Organiser <date>', event 'EventLinqs L1 Test Event <date>', so nobody can
 * mistake either for a real one. THE CLEANUP: row 6 ends by deleting the zero-sales test event through the dashboard; the
 * account goes through scripts/verify/lib/teardown-account.mjs (the one way an account is deleted), which asks 'is it gone'
 * and fails the run if it is not. The production key is read through the token wrapper and never printed.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'
import { tearDownAccountOrFailTheRun } from '../verify/lib/teardown-account.mjs'

const PRODUCTION = 'https://www.eventlinqs.com.au'
const REF = 'gndnldyfudbytbboxesk'
const args = process.argv.slice(2)
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const YES = argOf('--yes')
const EMAIL = argOf('--email')
const OUT = argOf('--out')
const BASE = (process.env.BASE ?? PRODUCTION).replace(/\/$/, '')
const DAY = new Date().toISOString().slice(0, 10)
const ORG = `EventLinqs L1 Test Organiser ${DAY}`
const EVENT = `EventLinqs L1 Test Event ${DAY}`
// A real Geelong address, so row 2's coordinates have something true to resolve.
const VENUE = { name: 'Geelong Library and Heritage Centre', address: '51 Little Malop Street, Geelong VIC 3220' }

function refuse(why) {
  console.error(`REFUSED, nothing done: ${why}`)
  process.exit(2)
}
if (!YES || !/CONTROLLER/.test(YES) || !/Lawal/.test(YES) || !/yes/i.test(YES)) refuse("--yes must carry the CONTROLLER line that quotes Lawal's yes")
if (BASE !== PRODUCTION) refuse(`this script is for production only (${PRODUCTION}); the TEST forms are scripts/journeys/j1.mjs, j2.mjs, j8-discount.mjs and c13-archive-delete.mjs`)
if (!EMAIL || !OUT) refuse('--email and --out are required')
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) refuse('run it through scripts\\ops\\with-supabase-token.ps1, so the cleanup can remove the test account')
mkdirSync(OUT, { recursive: true })

const notes = []
const note = (row, detail) => {
  const line = `${new Date().toISOString()} ${row}: ${detail}`
  notes.push(line)
  console.log(line)
  writeFileSync(join(OUT, 'notes.txt'), notes.join('\n') + '\n')
}
const ask = async (q) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await rl.question(q)
  rl.close()
  return a.trim()
}
const password = randomBytes(18).toString('base64url') // the test account's, held in memory only

const browser = await chromium.launch({ headless: false })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {})
const main = async () => (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ')
const go = async (path, name) => {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(name)
  return res?.status() ?? 0
}
let eventId = null

try {
  // Row 1: sign up, verify, sign in.
  await go('/signup', '1-signup')
  await page.getByLabel(/email/i).first().fill(EMAIL)
  await page.getByLabel(/password/i).first().fill(password)
  const nameField = page.getByLabel(/name/i).first()
  if (await nameField.count()) await nameField.fill('EventLinqs L1 Test')
  await page.getByRole('button', { name: /sign up|create account|continue/i }).first().click()
  await page.waitForTimeout(4000)
  note('row 1: sign up submitted', (await main()).slice(0, 160))
  const link = await ask(`Paste the confirmation link from ${EMAIL}'s inbox here, then Enter: `)
  if (!/^https:\/\/www\.eventlinqs\.com\.au\//.test(link) && !/supabase\.co\/auth/.test(link)) refuse('that is not a confirmation link')
  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  note('row 1: verified', page.url())
  if (!/dashboard|account|onboarding/.test(page.url())) {
    await go('/login', '1-login')
    await page.getByLabel(/email/i).first().fill(EMAIL)
    await page.getByLabel(/password/i).first().fill(password)
    await page.getByRole('button', { name: /sign in|log in/i }).first().click()
    await page.waitForTimeout(4000)
  }
  note('row 1: signed in', page.url())
  await shot('1-signed-in')

  // Row 2: the organisation, then the event with a real venue address; coordinates must be saved, not null.
  await go('/dashboard/organisation/create', '2-org')
  await page.getByLabel(/organisation name|name/i).first().fill(ORG)
  await page.getByRole('button', { name: /create|continue|save/i }).first().click()
  await page.waitForTimeout(4000)
  note('row 2: organisation', `${ORG} -> ${page.url()}`)
  await go('/dashboard/events/create', '2-create')
  await ask(`In the browser: create '${EVENT}' at ${VENUE.name}, ${VENUE.address}, a date next week, and save it as a draft. Press Enter here when the event's dashboard page is open: `)
  eventId = page.url().match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  note('row 2: event created', eventId ?? `NO EVENT ID IN ${page.url()}`)
  if (eventId) {
    const db = createClient(`https://${REF}.supabase.co`, await serviceKey(), { auth: { persistSession: false } })
    const { data, error } = await db.from('events').select('venue_latitude, venue_longitude, venue_address').eq('id', eventId).maybeSingle()
    note('row 2: coordinates saved', error ? `READ FAILED ${error.message}` : data?.venue_latitude != null && data?.venue_longitude != null ? `${data.venue_latitude}, ${data.venue_longitude} (${data.venue_address})` : 'NULL: row 2 FAILS')
  }

  // Row 3: tiers and pricing, a discount code, publish.
  if (eventId) {
    await go(`/dashboard/events/${eventId}/pricing`, '3-pricing')
    await ask('Add a paid tier and a free tier on this page and save; press Enter: ')
    await go(`/dashboard/events/${eventId}/discounts`, '3-discounts')
    await ask('Add the discount code L1TEST (10% off) and save; press Enter: ')
    await go(`/dashboard/events/${eventId}`, '3-event')
    await ask("Press Publish. If Stripe's onboarding opens for the test organiser, complete it (that is Lawal's own act); press Enter when published: ")
    note('row 3: published', (await main()).match(/published|live|on sale/i)?.[0] ?? 'NOT SEEN AS PUBLISHED')
  }

  // Row 5: the Launch Kit, every card rendered with real ink.
  if (eventId) {
    await go(`/dashboard/events/${eventId}/launch-kit`, '5-launch-kit')
    const imgs = await page.$$eval('main img', (els) => els.map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })))
    note('row 5: launch kit cards', `${imgs.filter((i) => i.ok).length} of ${imgs.length} rendered`)
  }

  // Row 7: attendees, orders, and the GST report.
  if (eventId) {
    for (const [path, name] of [[`/dashboard/events/${eventId}/attendees`, '7-attendees'], [`/dashboard/events/${eventId}/orders`, '7-orders'], ['/dashboard/reports/gst', '7-gst']]) {
      note(`row 7: ${path}`, `HTTP ${await go(path, name)}; ${(await main()).slice(0, 100)}`)
    }
  }

  // Row 13: the payout path resolves and reports.
  note('row 13: /dashboard/payouts', `HTTP ${await go('/dashboard/payouts', '13-payouts')}; ${(await main()).slice(0, 140)}`)

  // Row 15: the emails, read by the person.
  await ask(`Read every email ${EMAIL} received (confirmation, publish, any other) and that each renders; press Enter: `)
  note('row 15', 'emails read by the person; record which arrived in the notes by hand')

  // Row 6, last, which also removes the event: pause, unpause, archive, restore, delete.
  if (eventId) {
    for (const act of ['Pause', 'Unpause', 'Archive', 'Restore', 'Delete']) {
      await go(`/dashboard/events/${eventId}`, `6-before-${act.toLowerCase()}`)
      await ask(`Press ${act} on the event (confirm if asked); press Enter: `)
      await page.waitForTimeout(2000)
      note(`row 6: ${act}`, (await main()).slice(0, 120))
      await shot(`6-after-${act.toLowerCase()}`)
    }
    const after = await page.goto(`${BASE}/dashboard/events/${eventId}`, { waitUntil: 'domcontentloaded' })
    note('row 6: the deleted event', `HTTP ${after?.status()}`)
  }
} catch (err) {
  note('STOPPED', String(err).slice(0, 300))
  process.exitCode = 1
} finally {
  await browser.close()
  // The cleanup: the test account, through the one way an account is deleted; it fails the run if the account remains.
  try {
    const db = createClient(`https://${REF}.supabase.co`, await serviceKey(), { auth: { persistSession: false } })
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = data?.users?.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
    if (user) {
      await tearDownAccountOrFailTheRun(db, user.id)
      note('cleanup', `the test account ${EMAIL} removed`)
    } else note('cleanup', `no account for ${EMAIL}: nothing to remove`)
  } catch (err) {
    note('CLEANUP FAILED', String(err).slice(0, 300))
    process.exitCode = 1
  }
}

async function serviceKey() {
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const k = keys.find((x) => x.name === 'service_role')?.api_key
  if (!k) throw new Error('the production key could not be read')
  return k
}
