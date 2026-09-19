/**
 * DRIVEN: THE FOUNDER CHANGES THE PLATFORM FEE ON /admin/pricing, TWICE, AND IT
 * SAVES.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES, by pressing what the founder presses.
 *
 *   1. A REGION DEFAULT SAVES AT ALL. This is the defect. Since migration
 *      20260727000002 added uq_pricing_rules_one_open_per_scope on 27 July
 *      2026, writePricingField inserted a row with effective_until NULL and
 *      left the previous row open, so every save of a scope that already had a
 *      rule was refused by the index. Driven against TEST before the fix:
 *
 *        ERROR: 23505 duplicate key ... "uq_pricing_rules_one_open_per_scope"
 *        DETAIL: Key (rule_type, country_code, currency, ...)
 *                =(platform_fee_percentage, AU, AUD, , ) already exists.
 *
 *      Every region default on the screen was in that state. The constitution
 *      says the founder edits the fee here with no code deploy; for fifty five
 *      days the screen could not save anything.
 *
 *   2. IT SAVES TWICE. One save could pass by luck on a scope with no open row,
 *      which is exactly how the 19 September drive missed this: it wrote a
 *      FIRST override for a brand new event, where there is nothing to collide
 *      with. The second write to the same scope is the one that used to fail,
 *      so this drive makes it and then makes a third.
 *
 *   3. THE INVARIANT HOLDS AFTER EACH SAVE. Exactly one open row for the scope,
 *      the version incremented, and the previous row STAMPED rather than
 *      deleted, so a past order can still be explained by the rule that priced
 *      it. Asserted against the database, not inferred from a green banner.
 *
 *   4. THE ZERO IS REFUSED WITH A SENTENCE. pricing_rules_value_split_check
 *      requires value_percentage > 0, and the override form used to ship
 *      defaultValue={0}, so the form as rendered submitted the one value the
 *      database rejects and the screen blamed the target id for it. The control
 *      now refuses 0 in the browser, and the server refuses it too when the
 *      control is bypassed, with a sentence naming the real rule.
 *
 *   5. NOTHING ELSE MOVED. The AU launch fee is never touched by this drive.
 *
 * ---------------------------------------------------------------------------
 * WHICH SCOPE IS DRIVEN, AND WHY IT IS NOT AU.
 *
 * AU/AUD carries the live launch fee on TEST at version 3. A drive that moves
 * it and then puts it back is one crash away from leaving the platform fee
 * wrong for every other lane on this machine. GB/GBP has the same shape, an
 * open row with history behind it, and nothing on this machine reads it. So the
 * region half runs on GB and AU is read at the start and at the end and proven
 * untouched.
 *
 * The restore is a LAWFUL WRITE, not a delete: the original value is written
 * back through the same screen, so GB ends on its original number with its
 * history intact. That is the design, and a drive that cleaned up by deleting
 * rows would be proving the opposite of the thing being built.
 *
 * TEST ONLY, and it refuses to run anywhere else.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { MEASURE_VIEWPORT_FIT, judgeSurface } from './lib/viewport-fit.mjs'
import { createProofAdmin, removeProofAdmin, signInAsOwner } from './lib/fo1-founding-admin.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

const TEST_REF = 'vkapkibzokmfaxqogypq'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://localhost:3100'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(TEST_REF)) {
  console.error(`FAIL: this drive only touches TEST ${TEST_REF}, not ${url}`)
  process.exit(1)
}
if (!serviceKey) {
  console.error('FAIL: SUPABASE_SERVICE_ROLE_KEY is not set')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const TAG = 'lane-b-fee-writer'

/** Remove anything a previous run of THIS drive left behind. Lane B rows only. */
async function purge() {
  const { data: orgs } = await db.from('organisations').select('id').like('slug', `${TAG}%`)
  for (const org of orgs ?? []) {
    await db.from('pricing_rules').delete().eq('organisation_id', org.id)
    await db.from('organisation_members').delete().eq('organisation_id', org.id)
    await db.from('organisations').delete().eq('id', org.id)
  }
  const { data: profiles } = await db.from('profiles').select('id').like('email', `${TAG}%`)
  for (const profile of profiles ?? []) await tearDownAccountOrFailTheRun(db, profile.id)
}

/*
 * organisations.owner_id is NOT NULL, so the fixture needs a person. They own
 * the organisation and nothing else, and they are torn down with it.
 */
async function makeOwner(stamp) {
  const email = `${TAG}-owner-${stamp}@eventlinqs.test`
  const created = await db.auth.admin.createUser({ email, password: `${randomUUID()}Aa1`, email_confirm: true })
  if (created.error) throw new Error(`create owner: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: 'Lane B Fee Writer Owner' })
  return id
}

/*
 * THE OVERRIDE TARGET IS LANE B'S OWN ORGANISATION, never a real one. An
 * organisation override changes what that organiser is charged, so pointing
 * this proof at an existing row would move somebody else's fee on a shared TEST
 * database. The row carries the lane-B tag in its slug so it is ours on sight,
 * and it is deleted at the end along with every pricing rule written against it.
 */
async function buildOrg() {
  const stamp = Date.now().toString(36)
  const ownerId = await makeOwner(stamp)
  const { data, error } = await db
    .from('organisations')
    .insert({ name: `Lane B Fee Writer ${stamp}`, slug: `${TAG}-${stamp}`, owner_id: ownerId })
    .select('id, name')
    .single()
  if (error) throw new Error(`create organisation: ${error.message}`)
  return data
}

/** Pick the override target through the screen's own picker, as an admin does. */
async function pickOrg(page, orgName) {
  await page.locator('#ov-scope').selectOption('organisation')
  await page.locator('#ov-search').fill(orgName)
  const option = page.locator('ul li button', { hasText: orgName }).first()
  await option.waitFor({ state: 'visible', timeout: 30000 })
  await option.click()
}

/** Every pricing rule row for one organisation scope, newest version first. */
async function orgRows(orgId, ruleType = 'platform_fee_percentage') {
  const { data, error } = await db
    .from('pricing_rules')
    .select('id, version, value_percentage, effective_until')
    .eq('rule_type', ruleType)
    .eq('organisation_id', orgId)
    .order('version', { ascending: false })
  if (error) throw new Error(`read org rules: ${error.message}`)
  return data ?? []
}

const checks = []
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

/** The scope this drive is allowed to move, and the one it must never touch. */
const DRIVEN = { country: 'GB', currency: 'GBP' }
const UNTOUCHED = { country: 'AU', currency: 'AUD' }

/** Every row for one region-default scope, newest version first. */
async function rowsFor({ country, currency }) {
  const { data, error } = await db
    .from('pricing_rules')
    .select('id, version, value_percentage, effective_until')
    .eq('rule_type', 'platform_fee_percentage')
    .eq('country_code', country)
    .eq('currency', currency)
    .is('organisation_id', null)
    .is('event_id', null)
    .order('version', { ascending: false })
  if (error) throw new Error(`read ${country}: ${error.message}`)
  return data ?? []
}

const openRows = (rows) => rows.filter((r) => r.effective_until === null)

/**
 * Save one region row on /admin/pricing the way the founder does: type into the
 * percent box in that scope's row and press its Save.
 */
async function saveRegionPercent(page, scopeLabel, percent, shotPath) {
  await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const label = page.getByLabel(`Platform fee percent for ${scopeLabel}`)
  await label.waitFor({ state: 'attached', timeout: 60000 })
  await label.fill(String(percent))
  /*
   * The Save button sits in the same table ROW as the input, and there is one
   * per scope. Scoping by row rather than by nth() means a new region added to
   * ADMIN_PRICING_SCOPES cannot silently move this press onto another country.
   */
  const row = page.locator('tr', { has: page.getByLabel(`Platform fee percent for ${scopeLabel}`) })
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: /^save$/i }).click()
  await page.waitForURL(/status=/, { timeout: 60000 }).catch(() => {})
  if (shotPath) await page.screenshot({ path: shotPath, fullPage: true })
  return new URL(page.url()).searchParams.get('status')
}

async function main() {
  await purge()
  const org = await buildOrg()
  const admin = await createProofAdmin(db, { label: 'Lane B Fee Writer Proof' })
  const browser = await chromium.launch()

  const auBefore = await rowsFor(UNTOUCHED)
  const gbOriginal = openRows(await rowsFor(DRIVEN))[0]
  if (!gbOriginal) throw new Error(`${DRIVEN.country} has no open platform_fee_percentage row to drive`)
  const originalPercent = Number(gbOriginal.value_percentage)
  console.log(`\n${DRIVEN.country} starts at ${originalPercent}% on version ${gbOriginal.version}`)
  console.log(`${UNTOUCHED.country} starts at ${auBefore.length} row(s), open version ${openRows(auBefore)[0]?.version}\n`)

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()

      try {
        const reached = await signInAsOwner(page, BASE, admin)
        record(`${viewport.name}: signed in at the real /admin/login`, reached, page.url())
        if (!reached) {
          await context.close()
          continue
        }

        await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        /*
         * WAIT FOR A CONTROL, NOT FOR A LOAD EVENT. /admin/pricing redirects an
         * admin who has not enrolled 2FA, and `next dev` can serve a partial
         * route tree that answers without the page. Both look like a clean
         * surface to a screenshot.
         */
        await page.locator('#ov-scope').waitFor({ state: 'visible', timeout: 60000 })
        record(`${viewport.name}: /admin/pricing rendered its controls`, true, page.url())
        await page.screenshot({ path: join(out, `${viewport.name}-1-pricing.png`), fullPage: true })

        const fit = await page.evaluate(`(${MEASURE_VIEWPORT_FIT})()`)
        const faults = judgeSurface({ label: '/admin/pricing', width: viewport.width, fit, totals: [] })
        record(`${viewport.name}: nothing on /admin/pricing is clipped past the right edge`, faults.length === 0, faults.join('; '))

        /*
         * THE CONTROL NO LONGER OFFERS THE ZERO. Read off the rendered element
         * rather than the source, because what the founder can type is decided
         * by the attribute the browser received.
         */
        const pct = await page.evaluate(() => {
          const el = document.querySelector('#ov-pct')
          return el ? { min: el.getAttribute('min'), required: el.hasAttribute('required'), value: el.value } : null
        })
        record(
          `${viewport.name}: the override percent control will not offer a zero`,
          pct !== null && pct.min === '0.01' && pct.required === true && pct.value === '',
          JSON.stringify(pct),
        )

        const before = await rowsFor(DRIVEN)
        const openBefore = openRows(before)
        record(
          `${viewport.name}: ${DRIVEN.country} starts with exactly one open row`,
          openBefore.length === 1,
          `open=${openBefore.length} versions=${before.map((r) => r.version).join(',')}`,
        )

        /*
         * THE SAVE THAT USED TO BE REFUSED. A distinct value per viewport, so
         * three real saves happen to a scope that already had an open row, which
         * is precisely the collision uq_pricing_rules_one_open_per_scope raised.
         */
        const target = Number((originalPercent + 0.11 * (VIEWPORTS.indexOf(viewport) + 1)).toFixed(2))
        const status = await saveRegionPercent(
          page,
          'United Kingdom',
          target,
          join(out, `${viewport.name}-2-region-saved.png`),
        )
        record(`${viewport.name}: the region default save is accepted`, status === 'saved', `status=${status}`)

        const after = await rowsFor(DRIVEN)
        const openAfter = openRows(after)
        record(
          `${viewport.name}: exactly one open row survives the save`,
          openAfter.length === 1,
          `open=${openAfter.length}`,
        )
        record(
          `${viewport.name}: the new version carries the value that was typed`,
          openAfter.length === 1 && Number(openAfter[0].value_percentage) === target,
          `stored=${openAfter[0]?.value_percentage} typed=${target}`,
        )
        record(
          `${viewport.name}: the version moved up rather than being reused`,
          openAfter.length === 1 && openAfter[0].version > openBefore[0].version,
          `${openBefore[0]?.version} -> ${openAfter[0]?.version}`,
        )
        const previous = after.find((r) => r.id === openBefore[0].id)
        record(
          `${viewport.name}: the previous row is stamped and still there`,
          Boolean(previous && previous.effective_until !== null),
          previous ? `effective_until=${previous.effective_until}` : 'the previous row is gone',
        )

        /*
         * SAVING THE SAME NUMBER AGAIN IS NOT A WRITE. Versions are the audit
         * trail of decisions; churning one on every submit makes it useless.
         */
        const repeat = await saveRegionPercent(page, 'United Kingdom', target, null)
        const afterRepeat = openRows(await rowsFor(DRIVEN))
        record(
          `${viewport.name}: re-saving the same value changes nothing`,
          repeat === 'saved' && afterRepeat[0].version === openAfter[0].version,
          `status=${repeat} version=${afterRepeat[0]?.version}`,
        )

        /*
         * THE SERVER REFUSES THE ZERO EVEN WHEN THE CONTROL IS BYPASSED. The
         * attributes are stripped in the page first, because a proof that only
         * showed the browser blocking it would be consistent with the server
         * still writing a 23514 into the founder's face.
         */
        await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.locator('#ov-scope').waitFor({ state: 'visible', timeout: 60000 })
        /*
         * THE TARGET IS REAL AND VALID, chosen through the screen's own picker.
         * A blank or invented target would ALSO answer override_invalid, and the
         * assertion below would pass for the wrong reason: the refusal has to be
         * about the zero and nothing else. The save immediately after it, with
         * the same target and a legal percent, is what proves the target was
         * never the problem.
         */
        await pickOrg(page, org.name)
        await page.evaluate(() => {
          const el = document.querySelector('#ov-pct')
          el.removeAttribute('min')
          el.removeAttribute('required')
        })
        await page.locator('#ov-pct').fill('0')
        await page.locator('#ov-fixed').fill('0')
        page.once('dialog', (d) => d.accept())
        await page.getByRole('button', { name: /save override/i }).click()
        await page.waitForURL(/status=override_/, { timeout: 60000 }).catch(() => {})
        const zeroStatus = new URL(page.url()).searchParams.get('status')
        await page.screenshot({ path: join(out, `${viewport.name}-3-zero-refused.png`), fullPage: true })
        record(
          `${viewport.name}: a zero percent override is refused as invalid, not as a database error`,
          zeroStatus === 'override_invalid',
          `status=${zeroStatus}`,
        )
        const zeroSentence = await page
          .getByRole('alert')
          .filter({ hasText: /Founding Organiser waiver/i })
          .count()
        record(
          `${viewport.name}: the refusal names the lawful way to charge nothing`,
          zeroSentence > 0,
          `alerts naming the waiver: ${zeroSentence}`,
        )

        /*
         * THE SAME TARGET, A LEGAL PERCENT, SAVED TWICE. The first write to a
         * brand new scope has nothing to collide with, which is exactly how the
         * 19 September drive passed over this defect. The SECOND is the one
         * uq_pricing_rules_one_open_per_scope used to refuse.
         */
        for (const attempt of [1, 2]) {
          const percent = attempt === 1 ? 1.5 : 2.25
          await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'domcontentloaded', timeout: 120000 })
          await page.locator('#ov-scope').waitFor({ state: 'visible', timeout: 60000 })
          await pickOrg(page, org.name)
          await page.locator('#ov-pct').fill(String(percent))
          await page.locator('#ov-fixed').fill('55')
          page.once('dialog', (d) => d.accept())
          await page.getByRole('button', { name: /save override/i }).click()
          await page.waitForURL(/status=override_/, { timeout: 60000 }).catch(() => {})
          const ovStatus = new URL(page.url()).searchParams.get('status')
          await page.screenshot({
            path: join(out, `${viewport.name}-4-override-save-${attempt}.png`),
            fullPage: true,
          })
          const rows = await orgRows(org.id)
          const open = openRows(rows)
          record(
            `${viewport.name}: override save ${attempt} of 2 is accepted`,
            ovStatus === 'override_saved',
            `status=${ovStatus}`,
          )
          record(
            `${viewport.name}: the organisation override has exactly one open row after save ${attempt}`,
            open.length === 1 && Number(open[0].value_percentage) === percent,
            `open=${open.length} value=${open[0]?.value_percentage} versions=${rows.map((r) => r.version).join(',')}`,
          )
        }
      } finally {
        await context.close()
      }
    }

    /*
     * THE RESTORE IS A SAVE, THROUGH THE SAME SCREEN. It is also the fourth
     * consecutive write to this scope, so it is evidence as well as tidiness.
     */
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await signInAsOwner(page, BASE, admin)
    const restoreStatus = await saveRegionPercent(
      page,
      'United Kingdom',
      originalPercent,
      join(out, 'restore-1440.png'),
    )
    const restored = openRows(await rowsFor(DRIVEN))
    record(
      `${DRIVEN.country} is restored to the value it started on`,
      restoreStatus === 'saved' && Number(restored[0].value_percentage) === originalPercent,
      `status=${restoreStatus} now=${restored[0]?.value_percentage} was=${originalPercent}`,
    )
    record(
      `${DRIVEN.country} still has exactly one open row at the end`,
      restored.length === 1,
      `open=${restored.length}`,
    )
    await context.close()

    const auAfter = await rowsFor(UNTOUCHED)
    record(
      `${UNTOUCHED.country}, the launch fee, was never touched`,
      auAfter.length === auBefore.length &&
        openRows(auAfter)[0]?.id === openRows(auBefore)[0]?.id &&
        openRows(auAfter)[0]?.value_percentage === openRows(auBefore)[0]?.value_percentage,
      `rows ${auBefore.length} -> ${auAfter.length}, open version ${openRows(auAfter)[0]?.version}`,
    )

    /*
     * THE WHOLE TABLE, not just the scope that was driven. One open row per
     * scope is the invariant the index enforces and the writer now maintains.
     */
    const { data: allOpen } = await db
      .from('pricing_rules')
      .select('rule_type, country_code, currency, organisation_id, event_id')
      .is('effective_until', null)
    const seen = new Map()
    for (const r of allOpen ?? []) {
      const key = `${r.rule_type}|${r.country_code}|${r.currency}|${r.organisation_id ?? ''}|${r.event_id ?? ''}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const doubled = [...seen.entries()].filter(([, n]) => n > 1)
    record(
      'every scope in pricing_rules still has at most one open row',
      doubled.length === 0,
      `scopes=${seen.size} doubled=${doubled.map(([k]) => k).join(', ')}`,
    )
  } finally {
    await browser.close()
    await removeProofAdmin(db, admin)
    /*
     * The organisation and every pricing rule written against it are lane B's
     * own rows, created by this run. Deleting them restores TEST exactly, and
     * it destroys no history that existed before the drive started.
     */
    await purge()
    /*
     * THE TEAR-DOWN IS OBSERVED, NOT CLAIMED. Twenty lane B drives once reported
     * "left as found" from a check that could not fail, so this reads the
     * database back and records a real check that can go red.
     */
    const { data: leftovers } = await db.from('organisations').select('id').like('slug', `${TAG}%`)
    const { data: leftProfiles } = await db.from('profiles').select('id').like('email', `${TAG}%`)
    const { data: strayRules } = await db
      .from('pricing_rules')
      .select('id')
      .eq('organisation_id', org.id)
    record(
      'the drive left no organisation, account or pricing rule of its own behind',
      (leftovers ?? []).length === 0 && (strayRules ?? []).length === 0 && (leftProfiles ?? []).length === 0,
      `organisations=${(leftovers ?? []).length} pricing_rules=${(strayRules ?? []).length} profiles=${(leftProfiles ?? []).length}`,
    )
  }

  const passed = checks.filter((c) => c.ok).length
  const report = [
    'ONE LAWFUL WRITER OF THE FEE, DRIVEN',
    `base ${BASE}`,
    `database ${TEST_REF} (TEST)`,
    `driven scope ${DRIVEN.country}/${DRIVEN.currency}, untouched ${UNTOUCHED.country}/${UNTOUCHED.currency}`,
    '',
    ...checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `\n        ${c.detail}` : ''}`),
    '',
    `${passed} of ${checks.length}`,
  ].join('\n')
  writeFileSync(join(out, 'one-lawful-writer-of-the-fee-drive.txt'), report)

  console.log(`\n=== ${passed} of ${checks.length} ===`)
  if (passed !== checks.length) process.exit(1)
}

main().catch((err) => {
  console.error(`FAIL: ${err.stack ?? err.message}`)
  process.exit(1)
})
