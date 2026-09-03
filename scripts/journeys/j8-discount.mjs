/**
 * JOURNEY 8: AN ORGANISER CREATES A DISCOUNT CODE.
 *
 * This journey failed for three months and nobody could see why. "Create Code"
 * was pressed, nothing happened, and every layer people looked at was innocent:
 * the button was type="submit", it was inside the form, client validation
 * passed, and there was no network request, no error on screen and no row in
 * discount_codes. Diagnosed 29 August 2026 (02a17426) and fixed. This is the
 * proof that it stays fixed, driven in the DOM and confirmed in the database.
 *
 * THE THREE DEFECTS, and what each assertion below is actually guarding.
 *
 *   1. THE FORM COULD NOT BE SUBMITTED AT ALL. #discounts-value carried
 *      min="0.01" with step="1". HTML steps FROM min, not from zero, so the
 *      submittable values were 0.01, 1.01, 2.01 ... and every round number a
 *      person would type was a stepMismatch. form.checkValidity() was false and
 *      the browser refused the submit before React saw the event, which is why
 *      handleSubmit never ran and why instrumenting it would have found
 *      nothing. Asserted directly: validity.stepMismatch and checkValidity().
 *
 *   2. THE WRITE WOULD HAVE FAILED ANYWAY. createDiscountCode wrote
 *      discount_value, a column dropped by migration 20260520000001 on 20 May
 *      2026, so every insert answered PGRST204. Asserted by reading the row
 *      back out of the database, not by trusting the screen.
 *
 *   3. A REFUSAL HAD NOWHERE TO GO. The panel dropped the action's error, so
 *      even a real refusal was invisible. Asserted by submitting a DUPLICATE
 *      code and requiring a visible message: a control that says nothing when
 *      it fails is a broken control, which is what scripts/guards/
 *      no-silent-submit.mjs now enforces at build time.
 *
 * Usage: node scripts/journeys/j8-discount.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import {
  chromium, BASE, makeJourney, note, attach, finish,
  messagesOnScreen, fillIf, clickText, signUpAndConfirm, createEventThroughWizard,
} from './harness.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const j = makeJourney('j8-discount', 'Journey 8: an organiser creates a discount code')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const browser = await chromium.launch()
const results = []

function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${(ok ? 'PASS' : 'FAIL').padEnd(6)} ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail}`)
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)

  const EMAIL = `disc.${stamp}@example.com`
  const PASSWORD = `Str0ng-${stamp}-Pass!`
  if (!(await signUpAndConfirm(j, p, { name: 'Discount Organiser', email: EMAIL, password: PASSWORD }))) {
    verdict('organiser account', false, 'could not create an account, so nothing below could be driven')
    throw new Error('no account')
  }

  const made = await createEventThroughWizard(j, p, {
    title: `Discount Night ${stamp}`,
    summary: 'Proving the discount panel.',
    description: 'An event that exists only so a discount code can be created against it.',
    price: '25',
    orgName: `Discount Presents ${stamp}`,
  })
  /*
   * THE EVENT IS A FIXTURE, AND THAT IS DELIBERATE.
   *
   * The subject of this journey is the DISCOUNT FORM, not the create-event
   * wizard, which has its own journeys and its own break attempts. Two runs on
   * 29 August were reported as "no event" when the real situation was that the
   * wizard had timed out on a slow local server three steps before it writes
   * anything: the wizard creates the ORGANISATION on its first step and the
   * EVENT only much later, so a run that stops early leaves an org and no event.
   * Blaming the discount panel for that would be a false negative on the wrong
   * surface.
   *
   * So the organisation is the one the wizard really made, for the account that
   * really signed up, and the event is inserted under it. The organiser then
   * reaches the panel through the real authorisation path, which is what the
   * journey is actually asking about.
   */
  const { data: org } = await db
    .from('organisations')
    .select('id, name, owner_id')
    .eq('name', `Discount Presents ${stamp}`)
    .maybeSingle()
  if (!org) {
    verdict('an organisation to own the event', false, 'the wizard did not create the organisation, so the account owns nothing')
    throw new Error('no organisation')
  }

  let { data: ev } = await db
    .from('events')
    .select('id, title')
    .ilike('title', `Discount Night ${stamp}%`)
    .limit(1)
    .maybeSingle()

  if (!ev) {
    const { data: cat } = await db.from('categories').select('id').limit(1).single()
    const start = new Date(Date.now() + 30 * 864e5)
    const { data: made2, error: evErr } = await db
      .from('events')
      .insert({
        title: `Discount Night ${stamp}`,
        slug: `discount-night-${stamp}`,
        summary: 'Proving the discount panel.',
        description: 'An event that exists only so a discount code can be created against it.',
        organisation_id: org.id,
        created_by: org.owner_id,
        category_id: cat?.id ?? null,
        start_date: start.toISOString(),
        end_date: new Date(start.getTime() + 3 * 36e5).toISOString(),
        timezone: 'Australia/Melbourne',
        event_type: 'in_person',
        venue_name: 'The Corner Hotel',
        venue_address: '57 Swan Street',
        venue_city: 'Melbourne',
        venue_state: 'VIC',
        venue_country: 'Australia',
        status: 'draft',
        visibility: 'public',
        max_capacity: 100,
        is_free: false,
      })
      .select('id, title')
      .single()
    if (evErr) {
      verdict('an event to discount', false, `could not stage the event: ${evErr.message}`)
      throw new Error('no event row')
    }
    ev = made2
  }
  verdict('an event to discount', true, `event ${ev.id} "${ev.title}" under org ${org.id} (wizard reached Review: ${made.reachedReview})`)

  await p.goto(`${BASE}/dashboard/events/${ev.id}/discounts`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)

  const CODE = `SAVE${stamp}`

  /*
   * TWO CONTROLS READ "Create Code" AND ONLY ONE OF THEM SUBMITS.
   *
   * The panel opens with a "+ Create Code" TOGGLE and renders the form only
   * when it is pressed; the form's own submit button then also says
   * "Create Code". A text match therefore hits the toggle, closes the form it
   * just opened, and reports a page with no fields on it, which is precisely
   * the false negative this journey exists to avoid. The toggle is pressed by
   * text and the submit is pressed by `form button[type="submit"]`.
   */
  const openForm = async () => {
    if (await p.$('#discounts-value')) return true
    await clickText(p, 'Create Code')
    await p.waitForSelector('#discounts-value', { timeout: 15000 }).catch(() => {})
    return Boolean(await p.$('#discounts-value'))
  }
  const submitForm = async () => {
    const btn = await p.$('form button[type="submit"]')
    if (!btn) return false
    await btn.click()
    return true
  }

  const formOpened = await openForm()
  verdict(
    'the discount form opens',
    formOpened,
    formOpened ? 'the + Create Code toggle rendered the form' : 'the form never appeared, so nothing below could be driven',
  )

  // -- 1. THE FORM MUST BE SUBMITTABLE WITH A ROUND NUMBER -------------------
  await fillIf(p, '#discounts-code', CODE)
  await p.selectOption('#discounts-type', 'percentage').catch(() => {})
  await fillIf(p, '#discounts-value', '20')
  await fillIf(p, '#discounts-max-total-uses', '5')
  await p.waitForTimeout(400)

  const validity = await p.evaluate(() => {
    const v = document.querySelector('#discounts-value')
    const form = v ? v.closest('form') : null
    return {
      found: Boolean(v),
      value: v ? v.value : null,
      min: v ? v.getAttribute('min') : null,
      step: v ? v.getAttribute('step') : null,
      stepMismatch: v ? v.validity.stepMismatch : null,
      valueValid: v ? v.checkValidity() : null,
      formValid: form ? form.checkValidity() : null,
      submitInsideForm: Boolean(form && form.querySelector('button[type="submit"]')),
    }
  })
  verdict(
    'a round number is submittable in the value field',
    validity.found && validity.stepMismatch === false && validity.valueValid === true && validity.formValid === true,
    `#discounts-value value="${validity.value}" min="${validity.min}" step="${validity.step}" ` +
      `stepMismatch=${validity.stepMismatch} valueValid=${validity.valueValid} formValid=${validity.formValid} ` +
      `submitInsideForm=${validity.submitInsideForm}`,
  )

  // -- 2. PRESSING IT MUST REACH THE SERVER AND WRITE A ROW ------------------
  let sawRequest = false
  p.on('request', r => {
    if (r.method() === 'POST' && r.url().includes(`/dashboard/events/${ev.id}/discounts`)) sawRequest = true
  })

  await submitForm()
  await p.waitForTimeout(7000)

  const { data: row, error: readErr } = await db
    .from('discount_codes')
    .select('id, code, discount_type, discount_percentage, discount_amount_cents, max_uses, current_uses, is_active')
    .eq('event_id', ev.id)
    .eq('code', CODE)
    .maybeSingle()

  verdict(
    'the code exists in the database',
    Boolean(row) && !readErr,
    row
      ? `discount_codes row ${row.id}: code=${row.code} type=${row.discount_type} ` +
        `percentage=${row.discount_percentage} amount_cents=${row.discount_amount_cents} ` +
        `max_uses=${row.max_uses} current_uses=${row.current_uses} active=${row.is_active}`
      : `NO ROW for code ${CODE} on event ${ev.id}${readErr ? ` (${readErr.message})` : ''}. A POST ${sawRequest ? 'was' : 'was NOT'} observed.`,
  )

  // The value must land in the column the schema actually has. Writing 20% into
  // discount_percentage rather than the dropped discount_value is the whole of
  // defect 2, and only the row can say which happened.
  verdict(
    'the percentage landed in a column that exists',
    Number(row && row.discount_percentage) === 20,
    row ? `discount_percentage=${row.discount_percentage} (expected 20)` : 'no row to read',
  )

  const onScreen = await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '))
  verdict(
    'the new code is visible on the screen that created it',
    onScreen.includes(CODE),
    onScreen.includes(CODE) ? `"${CODE}" is rendered in the panel` : `"${CODE}" is NOT on screen after the create`,
  )

  // -- 3. A REFUSAL MUST BE VISIBLE -----------------------------------------
  // The same code again. Whatever the platform decides to do, it must not do it
  // in silence: this is the class the no-silent-submit guard exists for.
  await openForm()
  await fillIf(p, '#discounts-code', CODE)
  await p.selectOption('#discounts-type', 'percentage').catch(() => {})
  await fillIf(p, '#discounts-value', '20')
  await p.waitForTimeout(300)
  await submitForm()
  await p.waitForTimeout(7000)

  const shown = (await messagesOnScreen(p)).join(' // ')
  const { count: dupes } = await db
    .from('discount_codes')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', ev.id)
    .eq('code', CODE)

  verdict(
    'a duplicate code is refused OUT LOUD, not in silence',
    dupes === 1 ? Boolean(shown) : dupes === 2,
    dupes === 1
      ? shown
        ? `refused and said so: ${shown.slice(0, 160)}`
        : 'REFUSED IN SILENCE: the second create wrote nothing and the screen says nothing. That is the exact class journey 8 was.'
      : `${dupes} rows now carry code ${CODE}; duplicates are permitted, so there was nothing to refuse`,
  )

  await ctx.close()
} catch (err) {
  note(j, 'ABORTED', String(err?.message ?? err))
} finally {
  await browser.close()
}

console.log('\n== JOURNEY 8 ==')
for (const r of results) console.log(`  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.name}\n         ${r.detail}`)
const failed = results.filter(r => !r.ok).length
console.log(`\n  ${results.length - failed} of ${results.length} passed.`)
await finish(j)
process.exit(failed > 0 ? 1 : 0)
