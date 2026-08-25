/**
 * MINT A PREVIEW SESSION for an EXISTING TEST organiser, so the authenticated
 * surfaces can be walked and driven.
 *
 * WHY THIS AND NOT THE SAVED-SESSION SETUP. The surface-proof harness opens a
 * headed browser and waits for a human to sign in, which is right when a human
 * is at the keyboard and impossible on an unattended run. This does the same
 * job without ever typing a credential and without touching the auth core: it
 * asks Supabase Admin for a magic-link token for an account that already
 * exists, and hands that token to the application's OWN /auth/confirm route,
 * which is the same route a real magic link uses. The session that results is
 * the real thing, established by the app, not a forged cookie.
 *
 * IT IS TEST-ONLY AND THE PREFLIGHT ENFORCES THAT, not a comment. The preview
 * deployment reads the TEST project, which is checked here against the URL the
 * deployment actually serves before anything is minted.
 *
 * Usage:
 *   node scripts/mint-preview-session.mjs <previewUrl> [--out .auth/organiser.json]
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const { assertNotProduction } = require('./lib/production-write-preflight.mjs')
assertNotProduction({ envFile: '.env.test' })

const BASE = (process.argv[2] || '').replace(/\/$/, '')
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx === -1 ? '.auth/organiser.json' : process.argv[outIdx + 1]
if (!BASE) {
  console.error('usage: node scripts/mint-preview-session.mjs <previewUrl> [--out file]')
  process.exit(2)
}

const env = {}
for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const TEST_REF = 'vkapkibzokmfaxqogypq'
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(TEST_REF)) {
  throw new Error('refusing: .env.test does not point at the TEST project')
}

// THE DEPLOYMENT MUST AGREE. A preview wired to a different project would
// receive a token minted against TEST and fail in a way that reads as a broken
// login rather than as a wiring mistake, so it is checked rather than assumed.
const html = await (await fetch(BASE + '/')).text()
if (!html.includes(TEST_REF)) {
  throw new Error(`refusing: ${BASE} does not serve the TEST project ref`)
}

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Pick an organiser who actually owns something, so the dashboard has content
// to look at rather than an empty state that flatters the layout.
const { data: orgs, error: orgErr } = await admin
  .from('organisations')
  .select('id, name, owner_id')
  .not('owner_id', 'is', null)
  .limit(50)
if (orgErr) throw new Error(`organisation lookup failed: ${orgErr.message}`)

/*
 * OPTIONAL --org-id, added 21 August 2026.
 *
 * "The first organisation that owns any event" is the right default for walking
 * the dashboard, and useless when a specific defect only reproduces on specific
 * DATA. Screenshotting the refund states needed an organiser who owns an order
 * that has actually been refunded, and the default pick owned events with no
 * paid orders at all, so every capture would have been of an empty state.
 */
const orgIdx = process.argv.indexOf('--org-id')
const WANT_ORG = orgIdx === -1 ? null : process.argv[orgIdx + 1]

let chosen = null
if (WANT_ORG) {
  const { data: one, error: oneErr } = await admin
    .from('organisations')
    .select('id, name, owner_id')
    .eq('id', WANT_ORG)
    .maybeSingle()
  if (oneErr || !one) throw new Error(`--org-id ${WANT_ORG} not found on TEST`)
  if (!one.owner_id) throw new Error(`--org-id ${WANT_ORG} has no owner to sign in as`)
  chosen = { org: one, events: null }
}
for (const org of chosen ? [] : (orgs ?? [])) {
  const { count } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', org.id)
  if ((count ?? 0) > 0) {
    chosen = { org, events: count }
    break
  }
}
if (!chosen) throw new Error('no TEST organisation with events was found')

const { data: userData, error: userErr } = await admin.auth.admin.getUserById(chosen.org.owner_id)
if (userErr || !userData?.user?.email) {
  throw new Error(`could not resolve the owner account: ${userErr?.message ?? 'no email'}`)
}
const email = userData.user.email

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
})
if (linkErr || !link?.properties?.hashed_token) {
  throw new Error(`could not mint a link: ${linkErr?.message ?? 'no token'}`)
}

const confirmUrl =
  `${BASE}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}` +
  `&type=magiclink&next=/dashboard`

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
await page.goto(confirmUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
const landed = new URL(page.url()).pathname

if (landed.startsWith('/login')) {
  await browser.close()
  throw new Error(`sign-in was refused; landed on ${landed}`)
}

mkdirSync(dirname(OUT), { recursive: true })
await context.storageState({ path: OUT })
await browser.close()

console.log(`[session] signed in as ${email}`)
console.log(`[session] organisation "${chosen.org.name}"${chosen.events === null ? " (selected by --org-id)" : ` with ${chosen.events} event(s)`}`)
console.log(`[session] landed on ${landed}`)
console.log(`[session] state saved to ${OUT}${existsSync(OUT) ? '' : ' (MISSING, that is a failure)'}`)
