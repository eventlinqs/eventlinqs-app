/**
 * FT1. THE FREE FORECAST TOOL, DRIVEN.
 *
 * WHAT IT PROVES, in the order FT1's acceptance asks for it:
 *
 *   4. The stored run carries inputs, outputs, src and referrer, and a driven
 *      run at 390 produces a row. Driven through the real form, not by calling
 *      the action.
 *   5. At 390, 768 and 1440: the result is reachable without horizontal scroll
 *      and the call to action sits BELOW the result, measured by geometry
 *      rather than by source order.
 *   6. The copy gate laws hold on what the page actually prints: no banned
 *      word, no competitor named, no claim of accuracy the method does not
 *      support.
 *
 * Plus the two things the item's WHAT clauses ask for that a unit test cannot
 * see: the page is reachable with no account and shows the result with no email
 * wall, and the figures on screen move when the fee configuration moves.
 *
 * Run (dev server on 3100 against TEST):
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        --env-file=.env.local scripts/verify/ft1-forecast-drive.mjs \
 *        --out C:/dev/EVIDENCE/FT1
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.FT1_BASE_URL ?? 'http://localhost:3100'
const LANE = 'lane-b-ft1'
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only touches TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

/** The room, the price and the costs this drive types. Its own numbers. */
const CAPACITY = 137
const PRICE_DOLLARS = '41.50'
const COSTS_DOLLARS = '2750.00'
const DAYS = '23'

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

async function everyRouteThisDriveNeedsIsServed() {
  const missing = []
  for (const path of ['/', '/forecast', '/organisers']) {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' }).catch(() => null)
    if (!response) missing.push(`${path} did not answer`)
    else if (response.status === 404) missing.push(`${path} answered 404`)
  }
  return missing
}

async function answerTheCookieBanner(page) {
  for (const label of [/that is fine/i, /accept/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {})
      await page.waitForTimeout(400)
      return
    }
  }
}

const createdRunIds = []
let browser = null

try {
  const unserved = await everyRouteThisDriveNeedsIsServed()
  if (unserved.length > 0) {
    console.error('FAIL: this dev server is serving a partial route tree, so nothing measured against it would mean anything.')
    for (const line of unserved) console.error(`  ${line}`)
    process.exit(1)
  }

  browser = await chromium.launch({ headless: true })

  /* ---- acceptance 4 and 5: the real form, at three widths ---- */
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    /*
     * ARRIVING WITH A SOURCE, so the stored run can be shown to carry it. This
     * is what AN1's arrival cookie is for and it is why FT1 asks for src on the
     * row: a tool nobody can attribute is a tool nobody can justify.
     */
    await page.goto(`${BASE}/forecast?src=${LANE}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)

    check(
      `ft1.${vp.label}.the-tool-is-reachable-with-no-account`,
      page.url().includes('/forecast'),
      'a stranger reaches the tool with no account and no redirect',
    )

    const before = await page.evaluate(() => ({
      hasResult: Boolean(document.querySelector('[data-forecast="break-even"]')),
      hasMethod: Boolean(document.querySelector('[data-forecast="method"]')),
      methodText: document.querySelector('[data-forecast="method"]')?.textContent?.trim() ?? '',
    }))
    check(
      `ft1.${vp.label}.the-method-sentence-is-visible-before-anything-is-typed`,
      before.hasMethod && /arithmetic/i.test(before.methodText) && /not a prediction/i.test(before.methodText),
      before.hasMethod ? 'the page says what it is doing before it asks for anything' : 'no method sentence, which is the failure',
    )

    await page.locator('input[name="capacity"]').fill(String(CAPACITY))
    await page.locator('input[name="price"]').fill(PRICE_DOLLARS)
    await page.locator('input[name="costs"]').fill(COSTS_DOLLARS)
    await page.locator('input[name="days"]').fill(DAYS)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(u => u.searchParams.has('capacity'), { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await answerTheCookieBanner(page)

    const geometry = await page.evaluate(() => {
      const result = document.querySelector('[data-forecast="break-even"]')
      const cta = document.querySelector('[data-forecast="cta"]')
      const scenarios = document.querySelectorAll('[data-forecast="scenario"]')
      return {
        resultText: result?.textContent?.trim() ?? null,
        resultTop: result ? Math.round(result.getBoundingClientRect().top + window.scrollY) : null,
        ctaTop: cta ? Math.round(cta.getBoundingClientRect().top + window.scrollY) : null,
        scenarioCount: scenarios.length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        body: document.body.innerText,
      }
    })

    check(
      `ft1.${vp.label}.the-result-is-reachable-without-horizontal-scroll`,
      geometry.resultText !== null && !geometry.overflow,
      geometry.resultText === null
        ? 'no result rendered, which is the failure'
        : `the result reads "${geometry.resultText}" and the page fits ${vp.width} across`,
    )
    check(
      `ft1.${vp.label}.the-call-to-action-sits-below-the-result`,
      geometry.ctaTop !== null && geometry.resultTop !== null && geometry.ctaTop > geometry.resultTop,
      `the result sits at ${geometry.resultTop} and the call to action at ${geometry.ctaTop}`,
    )
    check(
      `ft1.${vp.label}.the-three-scenarios-render`,
      geometry.scenarioCount === 3,
      `${geometry.scenarioCount} scenario(s) on screen`,
    )
    check(
      `ft1.${vp.label}.no-email-was-required-to-see-it`,
      !/enter your email|email required/i.test(geometry.body),
      'the result is on screen and no address was asked for first',
    )
    check(
      `ft1.${vp.label}.the-copy-laws-hold-on-what-it-printed`,
      !/[\u2013\u2014]/.test(geometry.body) &&
        !/Eventbrite|Ticketmaster|Humanitix|TryBooking|Moshtix|Oztix/i.test(geometry.body) &&
        !/guarantee|accurate/i.test(geometry.body),
      'no dash, no competitor named, no claim of accuracy the method does not support',
    )

    await page.screenshot({ path: join(out, `${vp.label}-forecast.png`), fullPage: true })
    await context.close()
  }

  /* ---- acceptance 4: the row, read back from TEST ---- */
  {
    const { data: rows } = await db
      .from('forecast_runs')
      .select('id, capacity, ticket_price_cents, costs_cents, days_until_event, outputs, source_parameters, method, src, email')
      .eq('src', LANE)
      .order('created_at', { ascending: false })
      .limit(5)
    const found = rows ?? []
    for (const row of found) createdRunIds.push(row.id)

    check(
      'ft1.stored.a-driven-run-produced-a-row',
      found.length >= 1,
      `${found.length} row(s) carry this drive's source`,
    )
    const row = found[0]
    check(
      'ft1.stored.the-row-carries-the-inputs',
      row?.capacity === CAPACITY &&
        row?.ticket_price_cents === Math.round(Number(PRICE_DOLLARS) * 100) &&
        row?.costs_cents === Math.round(Number(COSTS_DOLLARS) * 100) &&
        row?.days_until_event === Number(DAYS),
      row
        ? `capacity ${row.capacity}, price ${row.ticket_price_cents}, costs ${row.costs_cents}, days ${row.days_until_event}`
        : 'no row to read',
    )
    check(
      'ft1.stored.the-row-carries-the-outputs-and-the-parameters-it-used',
      Boolean(row?.outputs?.breakEven) &&
        Array.isArray(row?.outputs?.scenarios) &&
        typeof row?.source_parameters?.platformFeePercent === 'number',
      row
        ? `break even ${row.outputs?.breakEven?.tickets}, ${row.outputs?.scenarios?.length} scenario(s), run at ${row.source_parameters?.platformFeePercent} per cent`
        : 'no row to read',
    )
    check(
      'ft1.stored.the-row-carries-the-source-and-the-method',
      row?.src === LANE && row?.method === 'arithmetic',
      `src ${JSON.stringify(row?.src)}, method ${JSON.stringify(row?.method)}`,
    )
    check(
      'ft1.stored.no-address-was-stored-because-none-was-given',
      row?.email === null,
      `email is ${JSON.stringify(row?.email)}`,
    )
  }

  /* ---- the database refuses an address with no consent wording ---- */
  {
    const refused = await db.from('forecast_runs').insert({
      capacity: 10,
      ticket_price_cents: 1000,
      costs_cents: 0,
      days_until_event: 1,
      outputs: {},
      source_parameters: {},
      method: 'arithmetic',
      src: `${LANE}-refusal`,
      email: `${LANE}-${STAMP}@eventlinqs.test`,
    })
    check(
      'ft1.consent.an-address-with-no-consent-wording-is-refused-by-the-database',
      Boolean(refused.error),
      refused.error
        ? `the database answered: ${refused.error.message.slice(0, 120)}`
        : 'the row was accepted, which is the failure',
    )
  }

  /* ---- the figures move when the fee configuration moves ---- */
  {
    const { data: rule } = await db
      .from('pricing_rules')
      .select('id, value_percentage')
      .eq('rule_type', 'platform_fee_percentage')
      .eq('country_code', 'AU')
      .is('effective_until', null)
      .is('organisation_id', null)
      .is('event_id', null)
      .limit(1)
      .maybeSingle()

    if (!rule) {
      check('ft1.configuration.the-fee-rule-was-found', false, 'no AU platform fee rule to move, so this could not be driven')
    } else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      const resultUrl = `${BASE}/forecast?capacity=100&price=5000&costs=100000&days=10&fee=absorb`
      const feeOnScreen = async () => {
        await page.goto(resultUrl, { waitUntil: 'domcontentloaded', timeout: 180000 })
        await page.waitForTimeout(2000)
        return page.evaluate(() => {
          const first = document.querySelector('[data-forecast="scenario"]')
          const cells = [...(first?.querySelectorAll('dd') ?? [])].map(d => d.textContent?.trim() ?? '')
          return cells[1] ?? ''
        })
      }
      const before = await feeOnScreen()
      await db.from('pricing_rules').update({ value_percentage: 9.5 }).eq('id', rule.id)
      const after = await feeOnScreen()
      await db.from('pricing_rules').update({ value_percentage: rule.value_percentage }).eq('id', rule.id)
      const restored = await feeOnScreen()
      check(
        'ft1.configuration.the-fee-on-screen-moves-when-the-configuration-moves',
        before !== after && before === restored && after.length > 0,
        `the fee read ${before}, then ${after} on a row update alone, and ${restored} once it was put back`,
      )
      await context.close()
    }
  }
} catch (error) {
  check('ft1.drive.completed', false, error instanceof Error ? error.message : String(error))
  console.error(error)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    await db.from('forecast_runs').delete().like('src', `${LANE}%`)
    const { count } = await db
      .from('forecast_runs')
      .select('id', { count: 'exact', head: true })
      .like('src', `${LANE}%`)
    check('ft1.teardown.left-as-found', (count ?? 0) === 0, `${count ?? 0} lane B FT1 run(s) remain`)
  } catch (error) {
    check('ft1.teardown.left-as-found', false, error instanceof Error ? error.message : String(error))
  }
}

const failed = checks.filter(c => !c.ok)
writeFileSync(
  join(out, 'ft1-drive-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, checks, failed: failed.length }, null, 2),
)
console.log('')
console.log(`FT1 DRIVE: ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) console.log(`  FAILED  ${f.name}  ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
