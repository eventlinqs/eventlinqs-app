/**
 * ACCESSIBILITY ON EVERY SURFACE THIS RUN TOUCHED, AT EVERY IMPACT LEVEL.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, and it is a gap this run found in its OWN work rather than
 * in the product.
 *
 * C:\dev\BUILD-BRIEF.md's COMPLETION LAW, clause 6, requires "axe zero
 * violations at every impact level on affected surfaces". The two drives this
 * run produced did not meet that: the notification drive asserted only SERIOUS
 * and CRITICAL, and the deep-link drive ran no axe at all. Both reported their
 * items complete.
 *
 * The repo's own operating standard is the narrower one - CLAUDE.md says
 * "axe-core 0 violations" and the surface-proof skill says serious or critical -
 * so this does not quietly adopt one standard over the other. It MEASURES every
 * level, reports each separately, and fails only on serious and critical, so a
 * minor or moderate finding is visible as a number rather than either hidden or
 * used to block a build over a colour contrast nobody has ruled on.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/lane-c-axe-sweep.mjs --tag lane-c-axe-1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/LANE-C-AXE'
let tag = `lane-c-axe-${Date.now().toString(36)}`
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
}
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3200'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

/** The surfaces this run's two items actually rendered to a person. */
const SURFACES = [
  { path: '/account/notifications', why: 'the promise the alert router makes' },
  { path: '/account/saved', why: 'the ?next= deep-link destination' },
  { path: '/tickets', why: 'the ?redirect= deep-link destination, the control' },
  { path: '/dashboard', why: 'where a refused off-origin redirect lands instead' },
]

const WIDTHS = [
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1440', 1440, 900],
]

/** React attaches these to the nodes it takes over; a direct hydration signal. */
async function waitForHydration(page, selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel)
      return !!node && Object.keys(node).some((key) => key.startsWith('__react'))
    },
    selector,
    { timeout: 30_000 },
  )
}

const email = `axe.${tag}@eventlinqs.test`
const password = `${randomUUID()}Aa1`
const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
if (created.error) throw new Error(`create account: ${created.error.message}`)
const userId = created.data.user.id
await db.from('profiles').upsert({
  id: userId,
  email,
  full_name: 'Lane C Axe',
  display_name: 'Lane C Axe',
  is_verified: true,
})

const browser = await chromium.launch()
const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const gate = await signIn.newPage()
let session = null
for (let attempt = 1; attempt <= 3 && !session; attempt += 1) {
  if (attempt > 1) await gate.reload({ waitUntil: 'domcontentloaded' })
  else await gate.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await waitForHydration(gate, 'button[type="submit"]')
  await gate.fill('input[type="email"]', email)
  await gate.fill('input[type="password"]', password)
  await gate.click('button[type="submit"]')
  try {
    await gate.waitForURL((url) => url.pathname !== '/login', { timeout: 25_000 })
    session = await signIn.storageState()
  } catch {
    const refusal = (await gate.locator('[role="alert"]').allTextContents().catch(() => [])).filter(Boolean)
    if (refusal.length > 0) throw new Error(`sign-in refused: ${refusal.join(' ')}`)
  }
}
await signIn.close()
if (!session) throw new Error('could not sign in to sweep the authed surfaces')

const rows = []
let serious = 0
for (const [label, width, height] of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height }, storageState: session })
  const page = await context.newPage()
  for (const surface of SURFACES) {
    await page.goto(`${BASE}${surface.path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    const landed = new URL(page.url()).pathname
    const results = await new AxeBuilder({ page }).analyze()
    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, none: 0 }
    for (const v of results.violations) byImpact[v.impact ?? 'none'] += 1
    serious += byImpact.critical + byImpact.serious
    rows.push({
      width: label,
      path: surface.path,
      landed,
      why: surface.why,
      ...byImpact,
      ids: results.violations.map((v) => `${v.impact}:${v.id}`),
    })
    console.log(
      `  ${label.padEnd(13)} ${surface.path.padEnd(24)} landed=${landed.padEnd(24)} ` +
        `critical=${byImpact.critical} serious=${byImpact.serious} ` +
        `moderate=${byImpact.moderate} minor=${byImpact.minor}` +
        (results.violations.length > 0 ? `  ${results.violations.map((v) => `${v.impact}:${v.id}`).join(', ')}` : ''),
    )
  }
  await context.close()
}
await browser.close()

writeFileSync(join(out, `${tag}-axe.json`), JSON.stringify(rows, null, 2))

await db.from('profiles').delete().eq('id', userId)
await tearDownAccountOrFailTheRun(db, userId)

const totals = rows.reduce(
  (acc, r) => ({
    critical: acc.critical + r.critical,
    serious: acc.serious + r.serious,
    moderate: acc.moderate + r.moderate,
    minor: acc.minor + r.minor,
  }),
  { critical: 0, serious: 0, moderate: 0, minor: 0 },
)
console.log(
  `\n  ${rows.length} sweeps: critical ${totals.critical}, serious ${totals.serious}, ` +
    `moderate ${totals.moderate}, minor ${totals.minor}`,
)
console.log(`  evidence: ${join(out, `${tag}-axe.json`)}`)
process.exit(serious === 0 ? 0 : 1)
