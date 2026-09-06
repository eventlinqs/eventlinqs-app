/**
 * C14.10: MINT AN ORGANISER WHO HAS NO EVENTS, on TEST, through the real
 * signup form, so the dashboard's first screen and events list can be measured
 * in the state a venue sees in a demo before anything is listed. Writes the
 * cookie header to <out>/session.json under emptyOrganiserCookie (merged into
 * the file c14-authed-session.mjs writes; never printed, never committed).
 *
 * Usage (shell must not carry the production Supabase URL; see clean-env.sh):
 *   BASE=http://localhost:3311 node --env-file=.env.local scripts/verify/c14-empty-organiser.mjs --out C:/dev/EVIDENCE/C14/session
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { chromium, makeJourney, attach, signUpAndConfirm } from '../journeys/harness.mjs'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
if (/gndnldyfudbytbboxesk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('refusing to run against production')
  process.exit(1)
}

const j = makeJourney('c14-empty-organiser', 'C14.10: an organiser with no events yet')
const stamp = String(Date.now()).slice(-7)
const ORGANISER = { name: 'Tariq Haddad', email: `tariq.venue.${stamp}@example.com`, password: randomBytes(12).toString('base64url') + '-Aa1' }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)
if (!(await signUpAndConfirm(j, page, ORGANISER))) throw new Error('signup failed: ' + j.blockers.join(' // '))
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
await browser.close()

const file = join(out, 'session.json')
const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
writeFileSync(file, JSON.stringify({ ...previous, emptyOrganiserEmail: ORGANISER.email, emptyOrganiserCookie: cookie }, null, 2))
console.log(`session: empty organiser=${ORGANISER.email} (cookie written to ${file})`)
