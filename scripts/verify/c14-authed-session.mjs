/**
 * C14: MINT THE SIGNED-IN STATE THE ORGANISER DASHBOARD AND CHECKOUT NEED, on
 * TEST, through the real forms, and write what the rubric harness needs to
 * measure them as a person sees them.
 *
 *   1. An organiser signs up through /signup, confirms from the console inbox,
 *      and publishes a FREE event through the wizard (so the dashboard's first
 *      screen and events list carry a real published event).
 *   2. A guest opens the live PAID event named by --paid-slug, takes one ticket
 *      and reaches /checkout/<id> (a paid event needs Stripe onboarding to
 *      publish, which is a different journey).
 *
 * Output (never printed, never committed): <out>/session.json with the
 * organiser's cookie header, the guest's cookie header, the event slug and the
 * checkout path. Feed them to c14-rubric-measure.mjs with --cookie.
 *
 * Usage (shell must not carry the production Supabase URL; see clean-env.sh):
 *   BASE=http://localhost:3311 node --env-file=.env.local scripts/verify/c14-authed-session.mjs --out C:/dev/EVIDENCE/C14/session
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'

const args = process.argv.slice(2)
let out = null
let paidSlug = null
// --reservation-only: a hold lasts minutes and a measurement pass can outlive
// it; re-mint the guest reservation alone and keep the organiser session.
let reservationOnly = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--paid-slug') paidSlug = args[++i]
  else if (args[i] === '--reservation-only') reservationOnly = true
}
if (!out || !paidSlug) {
  console.error('FAIL: --out and --paid-slug <slug of a live paid event on TEST> are required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
if (/gndnldyfudbytbboxesk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('refusing to run against production')
  process.exit(1)
}

const j = makeJourney('c14-authed-session', 'C14: organiser session and a guest checkout')
const stamp = String(Date.now()).slice(-7)
const mint = () => randomBytes(12).toString('base64url') + '-Aa1'
const ORGANISER = { name: 'Amara Okafor', email: `amara.design.${stamp}@example.com`, password: mint() }
const TITLE = `Laneway Sessions ${stamp}`

const browser = await chromium.launch()
const cookieHeader = async (ctx) => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

const previous = reservationOnly ? JSON.parse(readFileSync(join(out, 'session.json'), 'utf8')) : null

// 1. Organiser
const orgCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const p = await orgCtx.newPage()
await attach(j, p)
if (!reservationOnly && !(await signUpAndConfirm(j, p, ORGANISER))) throw new Error('organiser signup failed: ' + j.blockers.join(' // '))
let eventId = previous?.eventId ?? null
let slug = previous?.slug ?? null
let organiserCookie = previous?.organiserCookie ?? null
if (!reservationOnly) {
const review = await createEventThroughWizard(j, p, {
  title: TITLE,
  summary: 'Three acts, one laneway, doors at seven.',
  description: 'A paid night for the C14 design proof: three local acts in a Geelong laneway bar, doors at seven, first act at eight. General admission, all ages until ten.',
  // FREE: a paid event needs the organiser's Stripe onboarding before the publish
  // gate opens, which is a different journey. The dashboard still carries a real
  // published event; the checkout capture uses an existing live PAID event.
  price: null,
  capacity: '120',
  wantCover: true,
})
if (!review.publishButton) throw new Error('never reached publish: ' + j.blockers.join(' // '))
if (review.publishDisabled) throw new Error('publish is disabled on review: ' + (review.reviewText ?? '').slice(0, 600))
await review.publishButton.click()
await p.waitForTimeout(12000)
eventId = p.url().match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
slug = await p.evaluate(() => {
  const skip = new Set(['create', 'browse', 'map', 'search'])
  for (const a of document.querySelectorAll('a[href]')) {
    const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
    if (m && !skip.has(m[1])) return m[1]
  }
  return null
})
note(j, 'Published', `${TITLE} -> ${p.url().replace(BASE, '')} slug=${slug}`)
if (!eventId || !slug) {
  const shown = await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 600))
  throw new Error('the event did not publish: ' + p.url() + ' :: ' + shown)
}
organiserCookie = await cookieHeader(orgCtx)
}

// 2. Guest reservation
const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const g = await guestCtx.newPage()
await attach(j, g)
await g.goto(`${BASE}/events/${paidSlug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await g.waitForTimeout(3000)
const clickAny = async (page, rx) => {
  for (const el of await page.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}
if (!(await clickAny(g, /^(get tickets|buy tickets|select tickets)/i))) throw new Error('no way to start buying')
await g.waitForTimeout(2500)
for (const b of await g.$$('button')) {
  const t = ((await b.innerText().catch(() => '')) || '').trim()
  if (t === '+') {
    await b.click().catch(() => {})
    break
  }
}
await g.waitForTimeout(2500)
if (!(await clickAny(g, /^checkout\b/i))) throw new Error('no way to continue to checkout')
await g.waitForURL(/\/checkout\//, { timeout: 30000 })
await g.waitForTimeout(3000)
const checkoutPath = new URL(g.url()).pathname
const guestCookie = await cookieHeader(guestCtx)
note(j, 'Reserved', `${checkoutPath}`)

writeFileSync(
  join(out, 'session.json'),
  JSON.stringify({ mintedAt: new Date().toISOString(), base: BASE, organiserEmail: previous?.organiserEmail ?? ORGANISER.email, eventId, slug, paidSlug, checkoutPath, organiserCookie, guestCookie }, null, 2),
)
console.log(`session: organiser=${ORGANISER.email} event=${slug} checkout=${checkoutPath} (cookies written to ${join(out, 'session.json')}, never printed)`)
await browser.close()
