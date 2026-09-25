/**
 * THE ONE FOUNDER STEP LEFT ON D1, AS ONE COMMAND (close-out D1, Law 10).
 *
 * ============================================================================
 * WHAT IS LEFT, AND WHY IT IS HIS
 * ============================================================================
 *
 * D1's acceptance names a production order: "pull the complete curve for the
 * Afro-Fusion slot including order EL-9HE57YNV and render it. Captured at 390,
 * 768 and 1440, no overflow."
 *
 * PULLED: done on 12 September, read-only, and the numbers are on record
 * (C:\dev\EVIDENCE\D1\2026-09-12\production-curve.txt).
 *
 * RENDERED: until 13 September there was nowhere on the platform the owner could
 * see it. That event belongs to MKLStudios, an outside organiser whose one member
 * is not the founder, and the curve was drawn only on the owning organiser's own
 * dashboard. /admin/events/[id] now draws it for the platform owner, which is the
 * half a machine could do and which is done.
 *
 * The half that is genuinely his is the CREDENTIAL. Signing into the production
 * admin console needs his password and a live six-digit code from his
 * authenticator, and neither exists on this machine or anywhere a script could
 * reach: there is no admin password in any environment file, nothing in the
 * Windows Credential Manager, and the TOTP secret is encrypted with a key held
 * only on production. That is Law 10's irreducible act. Everything wrapped around
 * it - finding the event, reading production's own ledger rows, computing the
 * expected curve with the product's own arithmetic, driving three widths,
 * comparing every number on screen against the rows, writing the evidence - is
 * this script.
 *
 * ============================================================================
 * WHAT IT WRITES TO PRODUCTION, STATED PLAINLY RATHER THAN GLOSSED
 * ============================================================================
 *
 * This script writes NOTHING of its own. It holds no service-role key, and the
 * only way it reads production is a SELECT-only reader
 * (scripts/lib/production-select.mjs) that refuses any statement but a select.
 *
 * The PRODUCT writes two of its own rows while this runs, exactly as it does when
 * the founder signs in with his own browser and looks at the page: the admin
 * session login audit row, and `admin.event.detail.view` from the event page
 * itself. Those are the audit trail working. Nothing else is touched, and the
 * script never opens a public event page, because a public event page writes a
 * page_view demand row into the very ledger this is here to read.
 *
 * ============================================================================
 * HOW TO RUN IT
 * ============================================================================
 *
 *   powershell -File scripts/ops/with-supabase-token.ps1 node --import ./scripts/lib/src-alias-loader.mjs scripts/ops/prove-d1-production-curve.mjs
 *
 * It asks for the admin email, then the password with the echo off, then the
 * six-digit code. Nothing typed is printed, logged, or written to the evidence.
 * Add --out <dir> to put the evidence somewhere other than
 * C:\dev\EVIDENCE\D1\production-render.
 */
import { mkdirSync, writeFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { buildCurve } from '@/lib/ledger/pace'
import { PRODUCTION_REF, lit, productionSelect } from '../lib/production-select.mjs'

const TAG = '[d1-production-render]'
const SITE = 'https://www.eventlinqs.com.au'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D1/production-render'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const report = []
const say = (line) => {
  report.push(line)
  console.log(line)
}
const checks = []
const check = (id, pass, detail) => {
  checks.push({ id, pass, detail })
  say(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
const money = (cents) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)

/* -------------------------------------------------------------------------
 * 0. IT REFUSES BEFORE IT ACTS.
 * ---------------------------------------------------------------------- */
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error(`${TAG} REFUSING: no SUPABASE_ACCESS_TOKEN, so production's own rows cannot be read and there`)
  console.error(`${TAG} would be nothing to compare the screen against. Run it through the helper:`)
  console.error(`${TAG}   powershell -File scripts/ops/with-supabase-token.ps1 node --import ./scripts/lib/src-alias-loader.mjs ${process.argv[1]}`)
  process.exit(1)
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`${TAG} REFUSING: a SERVICE_ROLE key is in this environment. This script must be incapable of`)
  console.error(`${TAG} writing, and a process holding that key is not. Run it in a shell without one.`)
  process.exit(1)
}

/**
 * Read a line from the terminal. `fs.readSync` on fd 0 rather than readline,
 * because a readline interface left open here has hung this repository's harness
 * before when a child process was spawned afterwards.
 */
function ask(prompt, { hidden = false } = {}) {
  process.stdout.write(prompt)
  let wasRaw = false
  if (hidden && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true)
      wasRaw = true
    } catch {
      wasRaw = false
    }
  }
  const buf = Buffer.alloc(1)
  let value = ''
  for (;;) {
    let read = 0
    try {
      read = readSync(0, buf, 0, 1, null)
    } catch (error) {
      if (error.code === 'EAGAIN') continue
      throw error
    }
    if (read === 0) break
    const ch = buf.toString('utf8')
    if (ch === '\n' || ch === '\r') break
    if (ch === '\u0003') {
      if (wasRaw) process.stdin.setRawMode(false)
      process.stdout.write('\n')
      console.error(`${TAG} cancelled at the prompt. Nothing was done.`)
      process.exit(130)
    }
    if (ch === '\u007f' || ch === '\b') {
      value = value.slice(0, -1)
      continue
    }
    value += ch
    if (!hidden) process.stdout.write(ch)
  }
  if (wasRaw) process.stdin.setRawMode(false)
  process.stdout.write('\n')
  return value.trim()
}

/* -------------------------------------------------------------------------
 * 1. ENUMERATE. Never a typed id: the slot is found by asking production which
 *    of its slots the ledger actually holds sale rows for.
 * ---------------------------------------------------------------------- */
const select = productionSelect(token)
say(`${TAG} project ${PRODUCTION_REF} (PRODUCTION), READ ONLY, through the Management API query endpoint`)

const installed = await select(
  "select to_regclass('public.ledger_slots')::text as slots, to_regclass('public.ledger_entries')::text as entries",
)
if (!installed[0]?.slots || !installed[0]?.entries) {
  console.error(`${TAG} REFUSING: production has no ledger tables, so there is no curve to render yet.`)
  console.error(`${TAG} The migration is the founder's step: npm run migrate:production`)
  process.exit(1)
}

const ranked = await select(
  'select s.source_ref, s.id as slot_id, count(*) as rows_held, ' +
    "sum(e.quantity) filter (where e.kind = 'sale') as units " +
    'from public.ledger_slots s join public.ledger_entries e on e.slot_id = s.id ' +
    "where s.source_system = 'eventlinqs' " +
    'group by 1, 2 order by units desc nulls last, rows_held desc limit 5',
)
if (ranked.length === 0) {
  console.error(`${TAG} REFUSING: production's ledger holds no rows for any slot, so nothing would be drawn.`)
  process.exit(1)
}
const top = ranked[0]
const events = await select(
  `select id, title, slug, organisation_id from public.events where id = ${lit(top.source_ref)}`,
)
const event = events[0]
if (!event) {
  console.error(`${TAG} REFUSING: the densest ledger slot names source_ref ${top.source_ref}, and no event on`)
  console.error(`${TAG} production has that id. That is a fault worth reporting rather than working around.`)
  process.exit(1)
}
say(
  `${TAG} slot enumerated from production: "${event.title}" (${event.id}), ` +
    `${top.rows_held} ledger row(s), ${top.units} unit(s) sold`,
)
if (ranked.length > 1) {
  for (const other of ranked.slice(1)) {
    say(`${TAG}   also held: slot ${other.slot_id} source_ref ${other.source_ref}, ${other.rows_held} row(s)`)
  }
}

/* -------------------------------------------------------------------------
 * 2. THE EXPECTED CURVE, through the product's OWN arithmetic.
 *    buildCurve is imported rather than reimplemented: a second implementation
 *    here would be a forecast, and a forecast that disagreed with the page would
 *    be worse than no forecast at all.
 * ---------------------------------------------------------------------- */
const slotRows = await select(
  'select id, category, subcategory, capacity, slot_at::text as slot_at, on_sale_at::text as on_sale_at ' +
    `from public.ledger_slots where id = ${lit(top.slot_id)}`,
)
const entryRows = await select(
  'select kind, occurred_at::text as occurred_at, days_out, quantity, amount_cents, unit_amount_cents, ' +
    'old_price_cents, new_price_cents, inventory_class, demand_action, final_sold, final_revenue_cents, ' +
    'fill_percent, attended, no_shows ' +
    `from public.ledger_entries where slot_id = ${lit(top.slot_id)} order by occurred_at asc`,
)
const expected = buildCurve(slotRows[0], entryRows)
writeFileSync(join(out, 'expected-curve.json'), JSON.stringify({ event, curve: expected }, null, 2), 'utf8')
say(
  `${TAG} expected, from production's rows through buildCurve: ${expected.totals.units} unit(s), ` +
    `${money(expected.totals.amountCents)}, ${expected.points.length} point(s) on the curve ` +
    `(days out ${expected.points.map((p) => p.daysOut).join(', ')})`,
)

/* -------------------------------------------------------------------------
 * 3. THE CREDENTIAL, WHICH IS HIS.
 * ---------------------------------------------------------------------- */
console.log('')
console.log(`${TAG} The production admin console needs your own sign-in. Nothing typed below is printed,`)
console.log(`${TAG} stored, or written into the evidence.`)
const adminEmail = process.env.EL_ADMIN_EMAIL || ask('  admin email: ')
const adminPassword = ask('  password (not echoed): ', { hidden: true })
const totp = ask('  6-digit code from your authenticator: ')
if (!adminEmail || !adminPassword) {
  console.error(`${TAG} REFUSING: an email and a password are both needed.`)
  process.exit(1)
}

/* -------------------------------------------------------------------------
 * 4. DRIVE THREE WIDTHS.
 * ---------------------------------------------------------------------- */
const VIEWPORTS = [
  { label: '390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { label: '768', width: 768, height: 1024, isMobile: false, hasTouch: true },
  { label: '1440', width: 1440, height: 1000, isMobile: false, hasTouch: false },
]

const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-AU',
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    })
    const page = await ctx.newPage()
    try {
      await page.goto(`${SITE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(adminPassword)
      if (totp) await page.locator('input[name="totp"]').fill(totp).catch(() => {})
      const submit = page.locator('button[type="submit"]')
      await submit.waitFor({ state: 'visible', timeout: 60_000 })
      await page
        .waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, {
          timeout: 60_000,
        })
        .catch(() => {})
      await submit.click()
      await page.waitForTimeout(9000)
      const landed = new URL(page.url()).pathname
      if (landed.endsWith('/admin/login')) {
        const shown = await page
          .locator('[role=alert]')
          .first()
          .innerText()
          .catch(() => '')
        check(`${vp.label}.signed-in`, false, `still on /admin/login. The page said: ${shown.trim() || 'nothing'}`)
        continue
      }
      check(`${vp.label}.signed-in`, true, `landed on ${landed}`)

      const res = await page.goto(`${SITE}/admin/events/${event.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
      check(`${vp.label}.event-page-200`, res?.status() === 200, `/admin/events/${event.id} -> ${res?.status()}`)

      const panel = await page.evaluate(() => {
        const head = [...document.querySelectorAll('h2')].find((x) =>
          /how this event sold/i.test(x.textContent || ''),
        )
        if (!head) return null
        const card = head.closest('div')
        if (!card) return null
        const table = card.querySelector('table')
        const rect = card.getBoundingClientRect()
        return {
          text: (card.innerText || '').split(/\s+/).join(' ').trim(),
          plots: card.querySelectorAll('svg').length,
          rows: table
            ? [...table.querySelectorAll('tbody tr')].map((tr) =>
                [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim()),
              )
            : [],
          right: Math.round(rect.x + rect.width),
          docScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }
      })
      check(`${vp.label}.panel-on-the-page`, Boolean(panel), panel ? `${panel.plots} plot(s)` : 'no panel heading found')
      if (!panel) continue

      const unitsShown = panel.text.match(/(\d+) sold/i)?.[1]
      const takenShown = panel.text.match(/(A?\$[\d,]+) taken/i)?.[1]
      check(
        `${vp.label}.units-equal-productions-ledger`,
        Number(unitsShown) === expected.totals.units,
        `the page says "${unitsShown} sold"; production's rows sum to ${expected.totals.units}`,
      )
      check(
        `${vp.label}.money-equals-productions-ledger`,
        Boolean(takenShown) &&
          money(expected.totals.amountCents).replace(/^A?\$/, '') === (takenShown ?? '').replace(/^A?\$/, ''),
        `the page says "${takenShown} taken"; production's rows sum to ${money(expected.totals.amountCents)}`,
      )
      check(
        `${vp.label}.every-point-is-on-the-page`,
        panel.rows.length === expected.points.length &&
          expected.points.every((point, i) => panel.rows[i]?.[0] === String(point.daysOut)),
        `${panel.rows.length} table row(s) against ${expected.points.length} point(s): ` +
          `${panel.rows.map((r) => r.join('/')).join(' | ') || 'none'}`,
      )
      check(
        `${vp.label}.no-overflow`,
        panel.docScrollWidth <= panel.innerWidth,
        `document.scrollWidth ${panel.docScrollWidth} against innerWidth ${panel.innerWidth}`,
      )
      check(
        `${vp.label}.panel-inside-the-viewport`,
        panel.right <= vp.width + 1,
        `panel right edge ${panel.right} against a ${vp.width} viewport`,
      )

      const shot = join(out, `admin-event-curve-${vp.label}.png`)
      await page.screenshot({ path: shot, fullPage: true })
      say(`${TAG} ${vp.label}: ${shot}`)
    } finally {
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.pass)
say('')
say(`${TAG} ${checks.length - failed.length}/${checks.length} check(s) passed on PRODUCTION`)
writeFileSync(join(out, 'report.txt'), report.join('\n') + '\n', 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify({ event, checks }, null, 2), 'utf8')
if (failed.length > 0) {
  console.error(`${TAG} FAIL: ${failed.length} check(s) failed. Evidence in ${out}`)
  process.exit(1)
}
console.log(`${TAG} PASS: production draws the curve its own ledger rows say it should, at 390, 768 and 1440.`)
console.log(`${TAG} Evidence in ${out}`)
