/**
 * LB-PRICEWHOLE. THE ORGANISER'S PRICE LADDER SURVIVES A BLINK AND A PAUSE.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES, and why each part is here rather than asserted.
 *
 * THE DEFECT WAS DATA LOSS, and it had two halves that met on one screen.
 *
 *   THE BLINK. `/dashboard/events/[id]/pricing` read the ladder with the error
 *   discarded and handed `rules ?? []` to an editor that substitutes ONE
 *   synthetic step at the base price when the list is empty. Save replaces the
 *   stored ladder with what the editor holds. A dropped socket plus one press
 *   of Save deleted the organiser's pricing decision.
 *
 *   THE PAUSE. The action sent the steps as `enabled ? normalise(steps) : []`
 *   and `save_dynamic_pricing` deleted every rule before deciding whether to
 *   insert any. So turning the switch OFF and pressing Save deleted the ladder
 *   as well, and the steps were hidden the moment the switch moved, so the
 *   organiser could not even see what they were losing.
 *
 * THE PAUSE IS DRIVEN WITH A MOUSE, at every viewport, because that is the
 * whole claim: switch off, Save, and the ladder is still there afterwards, in
 * the database and on the screen. A unit test cannot make that claim, because
 * the deletion was in a database function.
 *
 * THE LADDER IS BUILT THROUGH THE FORM, not seeded. BUILD-BRIEF's definition of
 * DRIVEN says a journey that only passes because a script seeded state a real
 * user could not create for themselves FAILS. So the first viewport types five
 * steps into the editor and saves them, and the later viewports pause and
 * resume the ladder that organiser made.
 *
 * WHAT IT LEAVES ON TEST: nothing. Everything hangs off one disposable
 * organisation under `lane-b-pricewhole-presents-`, deleted and then RE-READ to
 * prove it went.
 *
 * Run (dev server on 3100 against TEST):
 *   node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *        scripts/verify/lb-pricewhole-drive.mjs --out C:/dev/EVIDENCE/LB-PRICEWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'
import { readDynamicPricingLadders, readEventTicketTiers } from '@/lib/organisers/event-tier-config'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-PRICEWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-pricewhole-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

/** The ladder an organiser types in, five steps, rising. */
const LADDER = [
  { percent: 20, dollars: '30.00' },
  { percent: 40, dollars: '35.00' },
  { percent: 60, dollars: '40.00' },
  { percent: 80, dollars: '45.00' },
  { percent: 100, dollars: '50.00' },
]

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** What the database currently holds for one tier: the switch and the steps. */
async function ladderState(tierId) {
  const { data: tier, error: tierError } = await db
    .from('ticket_tiers')
    .select('dynamic_pricing_enabled')
    .eq('id', tierId)
    .single()
  if (tierError) throw new Error(`reading the tier back: ${tierError.message}`)
  const { data: steps, error: stepsError } = await db
    .from('dynamic_pricing_rules')
    .select('step_order, capacity_threshold_percent, price_cents')
    .eq('ticket_tier_id', tierId)
    .order('step_order', { ascending: true })
    .range(0, 99)
  if (stepsError) throw new Error(`reading the ladder back: ${stepsError.message}`)
  return { enabled: tier.dynamic_pricing_enabled, steps: steps ?? [] }
}

/**
 * AXE AT EVERY IMPACT LEVEL, not only serious and critical, per BUILD-BRIEF's
 * COMPLETION LAW clause 6. Run against a POPULATED screen: the paused band and
 * the step rows are states this screen can render, and a state that is not on
 * the screen is a state axe cannot judge.
 */
async function axeCheck(page, screen, viewport) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, null: 0 }
  for (const v of axe.violations) byImpact[v.impact ?? 'null'] += 1
  const named = axe.violations.map(v => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', ')
  check(
    `lb-pricewhole.axe.${screen}.${viewport}`,
    axe.violations.length === 0,
    axe.violations.length === 0
      ? `0 violations at any impact level across ${axe.passes.length} passing check(s)`
      : `${axe.violations.length} violation(s): ${named}`,
  )
  if (axe.violations.length) {
    log(`  axe detail ${screen} ${viewport} ${JSON.stringify(byImpact)}`)
    /*
     * THE NODES, NAMED. A count tells you there is a violation; the selector and
     * the colour pair tell you which element and let it be fixed rather than
     * guessed at. The first run of this drive reported "color-contrast(serious,
     * 2)" three times and that sentence is not actionable.
     */
    for (const v of axe.violations) {
      for (const n of v.nodes) {
        log(`    ${v.id} ${JSON.stringify(n.target)} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
      }
    }
  }
}

/** The editor's step rows, counted the way an organiser counts them. */
function stepRows(page) {
  return page.locator('input[aria-label^="Up to percent sold, step"]')
}

async function pressSave(page) {
  await page.getByRole('button', { name: /^save$/i }).first().click()
  await page.getByText(/pricing saved\./i).first().waitFor({ timeout: 30000 })
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  log('purging any prior lane-b-pricewhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const stamp = Date.now().toString(36)
  const ownerEmail = `lane-b-pricewhole+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`

  const { ownerId, org, event, tier } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 40,
    priceCents: 2500,
    log,
    brand: {
      org: 'Lane B Pricewhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Pricewhole Night',
      eventSlug: 'lane-b-pricewhole-night',
      owner: 'Lane B Pricewhole Owner',
    },
  })
  log(`organisation ${org.id}, event ${event.id}, tier ${tier.id}, organiser ${ownerId}`)

  let exitCode = 0
  try {
    // ------------------------------------------------ the constraint, in SQL
    /*
     * THE DATABASE REFUSES THE STATE THAT MAKES THE SCREEN LIE. A tier with the
     * switch ON and no steps renders as a one step ladder at the base price
     * that is not in the database, and the next Save writes that invention
     * back. Migration 20260920000040 makes it impossible; this is that claim
     * tested against the real database rather than read off the file.
     */
    const { error: enabledWithNoLadder } = await db
      .from('ticket_tiers')
      .update({ dynamic_pricing_enabled: true })
      .eq('id', tier.id)
    check(
      'lb-pricewhole.constraint.enabled-with-no-ladder-is-refused',
      Boolean(enabledWithNoLadder) && /no price steps/.test(enabledWithNoLadder?.message ?? ''),
      enabledWithNoLadder
        ? `refused: ${enabledWithNoLadder.code} ${enabledWithNoLadder.message.slice(0, 90)}`
        : 'ACCEPTED, which is the state the screen cannot render honestly',
    )
    const afterRefusal = await ladderState(tier.id)
    check(
      'lb-pricewhole.constraint.the-refusal-left-the-switch-off',
      afterRefusal.enabled === false,
      `dynamic_pricing_enabled is ${afterRefusal.enabled}`,
    )

    // ------------------------------------------------------------ the driving
    const browser = await chromium.launch()
    try {
      const signIn = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const signInPage = await signIn.newPage()
      await signInPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await answerTheCookieBanner(signInPage)
      await signInPage.getByLabel(/email/i).first().fill(ownerEmail)
      await signInPage.getByLabel(/password/i).first().fill(ownerPassword)
      await Promise.all([
        signInPage.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
        signInPage.getByRole('button', { name: /sign in|log in/i }).first().click(),
      ])
      await signInPage.waitForTimeout(2000)
      const state = await signIn.storageState()
      await signIn.close()
      check(
        'lb-pricewhole.organiser.is-signed-in',
        Boolean(state?.cookies?.length),
        `${state?.cookies?.length ?? 0} cookies held after sign-in`,
      )

      let ladderBuilt = false

      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: state,
        })
        const page = await context.newPage()
        const pageErrors = []
        page.on('pageerror', e => pageErrors.push(String(e)))

        const pricingPath = `/dashboard/events/${event.id}/pricing`
        const response = await page.goto(`${BASE}${pricingPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await answerTheCookieBanner(page)
        await page.waitForTimeout(1200)
        check(
          `lb-pricewhole.pricing.${vp.label}.answers-200`,
          response?.status() === 200,
          `HTTP ${response?.status()} at ${pricingPath}`,
        )

        if (!ladderBuilt) {
          /*
           * THE ORGANISER TYPES THE LADDER, at the first viewport, with a
           * mouse and a keyboard: the switch on, four presses of Add step, five
           * thresholds and five prices, one press of Save.
           *
           * THE SWITCH IS PRESSED FIRST AND THAT IS NOT A DETAIL. The fixture
           * tier arrives with dynamic pricing OFF, and the first run of this
           * drive typed the ladder without touching the switch and then
           * asserted the tier came back enabled. It came back PAUSED, which is
           * correct: the steps are editable whether or not the switch is on,
           * which is the whole point of the change, and saving with it off
           * stores a paused ladder. The harness was wrong, not the screen, and
           * every later failure in that run cascaded from this one.
           */
          await page.getByRole('switch').first().click()
          for (let i = 1; i < LADDER.length; i += 1) {
            await page.getByRole('button', { name: /add step/i }).first().click()
          }
          check(
            `lb-pricewhole.editor.${vp.label}.five-rows-after-adding`,
            (await stepRows(page).count()) === LADDER.length,
            `${await stepRows(page).count()} step row(s) in the editor`,
          )
          for (const [i, step] of LADDER.entries()) {
            const percent = page.locator(`input[aria-label="Up to percent sold, step ${i + 1}"]`)
            await percent.fill(String(step.percent))
            await percent.blur()
            const price = page.locator(`input[aria-label="Price at step ${i + 1}"]`)
            await price.fill(step.dollars)
            await price.blur()
          }
          await pressSave(page)

          const built = await ladderState(tier.id)
          check(
            'lb-pricewhole.editor.the-typed-ladder-is-stored',
            built.enabled === true && built.steps.length === LADDER.length,
            `switch ${built.enabled}, ${built.steps.length} step(s): ` +
              built.steps.map(s => `${Number(s.capacity_threshold_percent)}%@${s.price_cents}c`).join(' '),
          )
          check(
            'lb-pricewhole.editor.the-prices-are-the-ones-typed',
            built.steps.map(s => s.price_cents).join(',') ===
              LADDER.map(s => Math.round(Number(s.dollars) * 100)).join(','),
            built.steps.map(s => s.price_cents).join(',') || 'no steps stored',
          )
          ladderBuilt = true

          // ------------------------------------ the ceiling, against TEST
          /*
           * MEASURED, NOT ASSERTED. A single request for a window of two
           * returns two of five steps with HTTP 200 and `error` null, which is
           * the silence this whole defect family lives in. The pager reads past
           * it through the same client.
           */
          const { data: truncated, error: truncatedError } = await db
            .from('dynamic_pricing_rules')
            .select('id')
            .eq('ticket_tier_id', tier.id)
            .order('id', { ascending: true })
            .range(0, 1)
          check(
            'lb-pricewhole.ceiling.a-truncated-read-reports-no-error',
            truncated?.length === 2 && !truncatedError,
            `${truncated?.length ?? 0} of ${LADDER.length} steps came back, error=${truncatedError?.message ?? 'null'}`,
          )
          const pagedSmall = await readDynamicPricingLadders(db, [tier.id], { pageSize: 2 })
          check(
            'lb-pricewhole.ceiling.the-pager-reads-past-it',
            pagedSmall.length === LADDER.length,
            `${pagedSmall.length} step(s) through a page size of 2`,
          )

          /*
           * AND A REFUSED READ THROWS RATHER THAN ANSWERING "NO LADDER". Forced
           * against the live database by asking for a column that is not there,
           * which is a real PostgREST refusal rather than a stubbed one.
           */
          let threw = ''
          try {
            await readEventTicketTiers(db, event.id, 'id, a_column_that_is_not_there')
          } catch (error) {
            threw = String(error?.message ?? error)
          }
          check(
            'lb-pricewhole.reads.a-refused-read-throws',
            /could not be read in full/.test(threw),
            threw || 'it returned a list instead of throwing',
          )
        }

        // --------------------------------------------- the ladder is on screen
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1000)
        check(
          `lb-pricewhole.pricing.${vp.label}.every-step-is-drawn`,
          (await stepRows(page).count()) === LADDER.length,
          `${await stepRows(page).count()} of ${LADDER.length} step(s) on the screen`,
        )
        await page.screenshot({
          path: join(OUT, 'drive', `pricing-running-${vp.label}.png`),
          fullPage: true,
        })
        await axeCheck(page, 'pricing-running', vp.label)

        /*
         * THE SWITCH IS MEASURED, because the first run of this drive passed 57
         * checks while the screenshot at 390 showed the pill squeezed to a blob.
         * The report could not see it: nothing was asserting a size. The class
         * list says `w-11`, which is 44px, and flexbox was shrinking it because
         * the button carried no shrink guard. A number cannot be eyeballed away.
         */
        const switchBox = await page.getByRole('switch').first().boundingBox()
        check(
          `lb-pricewhole.pricing.${vp.label}.the-switch-is-its-full-width`,
          Math.round(switchBox?.width ?? 0) === 44,
          `the switch renders ${Math.round(switchBox?.width ?? 0)}px wide against the 44px its class list asks for`,
        )

        // ------------------------------------------- THE PAUSE, WITH A MOUSE
        await page.getByRole('switch').first().click()
        check(
          `lb-pricewhole.pause.${vp.label}.the-steps-stay-on-screen`,
          (await stepRows(page).count()) === LADDER.length,
          `${await stepRows(page).count()} step(s) visible with the switch off`,
        )
        check(
          `lb-pricewhole.pause.${vp.label}.says-what-buyers-pay`,
          await page.getByText(/paused\. buyers pay the base price/i).first().isVisible(),
          'the paused band names the base price and says the steps are kept',
        )
        await pressSave(page)

        const paused = await ladderState(tier.id)
        check(
          `lb-pricewhole.pause.${vp.label}.the-ladder-survived-the-pause`,
          paused.enabled === false && paused.steps.length === LADDER.length,
          `switch ${paused.enabled}, ${paused.steps.length} of ${LADDER.length} step(s) still stored`,
        )
        await page.screenshot({
          path: join(OUT, 'drive', `pricing-paused-${vp.label}.png`),
          fullPage: true,
        })
        await axeCheck(page, 'pricing-paused', vp.label)

        // ----------------------------------------------------- and resumed
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1000)
        check(
          `lb-pricewhole.resume.${vp.label}.a-paused-ladder-reloads-whole`,
          (await stepRows(page).count()) === LADDER.length,
          `${await stepRows(page).count()} step(s) after reloading a paused tier`,
        )
        await page.getByRole('switch').first().click()
        await pressSave(page)
        const resumed = await ladderState(tier.id)
        check(
          `lb-pricewhole.resume.${vp.label}.the-same-ladder-is-running-again`,
          resumed.enabled === true &&
            resumed.steps.map(s => s.price_cents).join(',') ===
              LADDER.map(s => Math.round(Number(s.dollars) * 100)).join(','),
          `switch ${resumed.enabled}, prices ${resumed.steps.map(s => s.price_cents).join(',')}`,
        )

        // ------------------------------------------------- the discount screen
        const discountsPath = `/dashboard/events/${event.id}/discounts`
        const discountsResponse = await page.goto(`${BASE}${discountsPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        })
        await answerTheCookieBanner(page)
        await page.waitForTimeout(1000)
        check(
          `lb-pricewhole.discounts.${vp.label}.answers-200`,
          discountsResponse?.status() === 200,
          `HTTP ${discountsResponse?.status()} at ${discountsPath}`,
        )

        /*
         * A CODE IS CREATED THROUGH THE FORM, once per viewport, and then the
         * LIST is read back after a reload. The defect was in the list read:
         * an empty list told an organiser their running promotion did not
         * exist, and the obvious response is to make it again, which the unique
         * constraint then refuses with a message about a code they cannot see.
         */
        const code = `LANEB${vp.width}`
        await page.getByRole('button', { name: /create code/i }).first().click()
        await page.locator('#discounts-code').fill(code)
        await page.locator('#discounts-value').fill('10')
        const tierBoxes = await page.locator('input[type="checkbox"]').count()
        check(
          `lb-pricewhole.discounts.${vp.label}.the-tier-list-is-drawn`,
          tierBoxes >= 1,
          `${tierBoxes} ticket type checkbox(es) in the restrict list`,
        )
        await page.getByRole('button', { name: /^create code$/i }).first().click()
        await page.waitForTimeout(1500)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1000)
        check(
          `lb-pricewhole.discounts.${vp.label}.the-code-is-in-the-list`,
          await page.getByText(code, { exact: false }).first().isVisible(),
          `${code} is on the screen after a reload`,
        )
        const { count: storedCodes } = await db
          .from('discount_codes')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id)
        check(
          `lb-pricewhole.discounts.${vp.label}.the-list-matches-the-database`,
          storedCodes === VIEWPORTS.indexOf(vp) + 1,
          `${storedCodes} code(s) stored after ${VIEWPORTS.indexOf(vp) + 1} viewport(s) created one`,
        )
        await page.screenshot({
          path: join(OUT, 'drive', `discounts-${vp.label}.png`),
          fullPage: true,
        })
        await axeCheck(page, 'discounts', vp.label)

        check(
          `lb-pricewhole.${vp.label}.no-page-error`,
          pageErrors.length === 0,
          pageErrors.length ? pageErrors.join(' | ') : 'no uncaught error on either screen',
        )

        await context.close()
      }
    } finally {
      await browser.close()
    }

    // ------------------------------- the constraint again, now with a ladder
    /*
     * DELETING THE LAST STEP OUT FROM UNDER A RUNNING LADDER IS REFUSED. The
     * tier is left switched ON by the resume above, so this is the live shape:
     * the rows go, the commit is refused, and the ladder is still whole.
     */
    const { error: deletedUnderIt } = await db
      .from('dynamic_pricing_rules')
      .delete()
      .eq('ticket_tier_id', tier.id)
    check(
      'lb-pricewhole.constraint.emptying-a-running-ladder-is-refused',
      Boolean(deletedUnderIt) && /no price steps/.test(deletedUnderIt?.message ?? ''),
      deletedUnderIt
        ? `refused: ${deletedUnderIt.code} ${deletedUnderIt.message.slice(0, 90)}`
        : 'ACCEPTED, which leaves a running ladder with nothing in it',
    )
    const afterDelete = await ladderState(tier.id)
    check(
      'lb-pricewhole.constraint.the-refused-delete-changed-nothing',
      afterDelete.steps.length === LADDER.length,
      `${afterDelete.steps.length} of ${LADDER.length} step(s) still stored`,
    )
  } finally {
    // ------------------------------------------------------ leave it as found
    log('purging the lane-b-pricewhole fixture')
    await purgeFixtures(db, log, SLUG_PREFIX)
    const { count: left, error: leftError } = await db
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${SLUG_PREFIX}%`)
    check(
      'lb-pricewhole.test-is-left-as-found',
      left === 0 && !leftError,
      `${left ?? 'unknown'} lane-b-pricewhole organisation(s) left, error=${leftError?.message ?? 'null'}`,
    )
  }

  const failed = results.filter(r => !r.ok)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
  writeFileSync(
    join(OUT, 'results.json'),
    `${JSON.stringify({ base: BASE, ladder: LADDER, results }, null, 2)}\n`,
    'utf8',
  )
  log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    for (const f of failed) log(`STILL FAILING: ${f.name} :: ${f.detail}`)
    exitCode = 1
  }
  process.exit(exitCode)
}

main().catch(err => {
  log(`FATAL ${err?.stack ?? err}`)
  writeFileSync(join(OUT, 'drive.log'), `${lines.join('\n')}\n`, 'utf8')
  process.exit(1)
})
