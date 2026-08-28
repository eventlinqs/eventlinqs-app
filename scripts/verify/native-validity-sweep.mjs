/**
 * CAN THIS FORM BE SUBMITTED AT ALL? ASKED OF THE BROWSER, ON THE REAL PAGE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE THE GUARD.
 *
 * scripts/guards/no-silent-submit.mjs decides the same class from SOURCE, and
 * it is the blocking gate. This is the other half, and neither replaces the
 * other:
 *
 *   THE GUARD SEES WHAT IS WRITTEN. It reads JSX, so an attribute computed at
 *   runtime is a guess to it. The very input that caused journey 8 is written
 *   `min={form.discount_type === 'percentage' ? '1' : '0.01'}`: two different
 *   forms depending on state, and only one of them was broken. A source scan
 *   has to reason about both branches and hope it enumerated them.
 *
 *   THIS SEES WHAT THE BROWSER GOT. It asks Chrome itself, through
 *   input.validity, on the page as actually rendered, in the state it is
 *   actually in. There is no arithmetic of mine to be wrong about.
 *
 * Static scans have been wrong on this project eight times and four false
 * blockers died that way, which is the whole reason the DOM is the authority
 * here and the guard is the cheap early warning.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT ACTUALLY DOES, and why it is a search rather than a check.
 *
 * For every constrained input on every surface it can reach, it TRIES values
 * and asks the browser whether each one is acceptable. A field is reported only
 * when EVERY candidate is refused, because that is the condition that makes the
 * form unsubmittable no matter what the person types, which is the defect. A
 * field that merely rejects some values is working correctly.
 *
 * Forms hidden behind a toggle are opened first. The discount form is rendered
 * only after "+ Create Code" is pressed, so a sweep that does not press
 * anything would have walked past the exact defect this class is named for and
 * reported a clean run.
 *
 * A sweep that prints nothing proves nothing: this prints every surface it
 * reached, every surface it could NOT reach, and how many fields it measured,
 * and it FAILS when it measured none.
 *
 * Usage:
 *   node scripts/verify/native-validity-sweep.mjs
 *   BASE=http://localhost:3311 node scripts/verify/native-validity-sweep.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium, BASE, makeJourney, attach, finish, signUpAndConfirm } from '../journeys/harness.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const j = makeJourney('native-validity-sweep', 'Every form: can the browser ever accept it?')

/**
 * THE MEASUREMENT, run inside the page.
 *
 * Candidate values are chosen to cover what a person would plausibly type plus
 * the boundaries the constraints themselves name. Each is written through the
 * NATIVE value setter and followed by an input event, so a React-controlled
 * field updates rather than silently reverting, which would make every
 * controlled input look broken.
 *
 * The original value is restored afterwards. This is a read-only sweep in
 * intent and must leave the page as it found it.
 */
const MEASURE = () => {
  /*
   * THE CANDIDATES ARE WHAT A PERSON WOULD TYPE, AND THAT DISTINCTION IS THE
   * WHOLE TEST.
   *
   * The first version of this sweep offered `min` itself as a candidate, and
   * that made it useless against the defect it was written for: the journey 8
   * input had min="0.01" with step="1", so 0.01 WAS a valid value and the
   * sweep would have reported the form submittable and passed. It was, and no
   * human being has ever typed 0.01 into a percentage field.
   *
   * So the question is not "does any value pass" but "does any value A PERSON
   * WOULD TYPE pass". For a number field that means a WHOLE NUMBER inside the
   * allowed range. A fractional min is offered only as a last resort, and when
   * that is the only thing that passes the field is still reported, because a
   * field whose sole submittable value is 0.01 is unusable in practice even
   * though the browser would accept it.
   */
  const CANDIDATES_FOR = el => {
    const min = el.min === '' ? null : Number(el.min)
    const max = el.max === '' ? null : Number(el.max)
    const lo = min !== null && Number.isFinite(min) ? Math.ceil(min) : null
    const hi = max !== null && Number.isFinite(max) ? Math.floor(max) : null
    const inRange = n => (lo === null || n >= lo) && (hi === null || n <= hi)

    const whole = new Set()
    for (const n of [1, 2, 5, 10, 20, 50, 100]) if (inRange(n)) whole.add(String(n))
    if (lo !== null) whole.add(String(lo))
    if (hi !== null) whole.add(String(hi))
    if (lo !== null && hi !== null && hi >= lo) whole.add(String(Math.floor((lo + hi) / 2)))
    if (whole.size === 0) whole.add('1')
    return [...whole]
  }

  const setNative = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, v)
    else el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const results = []
  const inputs = [...document.querySelectorAll('input, textarea')]

  for (const el of inputs) {
    if (el.disabled || el.readOnly) continue
    if (el.type === 'hidden' || el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') continue
    if (el.offsetParent === null && el.type !== 'hidden') continue // not visible

    const constrained =
      el.hasAttribute('min') || el.hasAttribute('max') || el.hasAttribute('step') || el.hasAttribute('pattern')
    if (!constrained) continue

    const before = el.value
    const candidates = el.type === 'number' ? CANDIDATES_FOR(el) : [el.value || 'A1', 'test', '1', 'AAA111']
    let anyValid = false
    const refusals = []

    for (const c of candidates) {
      setNative(el, c)
      if (el.validity.valid) {
        anyValid = true
        break
      }
      const v = el.validity
      const why = [
        v.stepMismatch && 'stepMismatch',
        v.rangeUnderflow && 'rangeUnderflow',
        v.rangeOverflow && 'rangeOverflow',
        v.patternMismatch && 'patternMismatch',
        v.typeMismatch && 'typeMismatch',
        v.badInput && 'badInput',
        v.valueMissing && 'valueMissing',
      ]
        .filter(Boolean)
        .join('+')
      refusals.push(`${c}:${why || 'invalid'}`)
    }

    setNative(el, before)

    results.push({
      id: el.id || el.name || `(${el.type}, no id)`,
      type: el.type,
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      step: el.getAttribute('step'),
      pattern: el.getAttribute('pattern'),
      anyValid,
      tried: candidates.length,
      refusals: refusals.slice(0, 6).join(' '),
      inForm: Boolean(el.closest('form')),
    })
  }

  return results
}

/** Press the controls that reveal a form, so hidden forms are measured too. */
const REVEAL = async page => {
  const opened = []
  const buttons = await page.$$('button')
  for (const b of buttons.slice(0, 40)) {
    const t = ((await b.innerText().catch(() => '')) || '').trim()
    if (!t || t.length > 40) continue
    if (!/^\+|^add\b|^create\b|^new\b|create code|add tier|add ticket|add venue|add discount/i.test(t)) continue
    if (!(await b.isVisible().catch(() => false))) continue
    if (!(await b.isEnabled().catch(() => false))) continue
    await b.click().catch(() => {})
    await page.waitForTimeout(900)
    opened.push(t)
  }
  return opened
}

/**
 * THE SELF-TEST, run before anything else, on every run.
 *
 * A DETECTOR THAT CANNOT DETECT PROVES NOTHING, and a passing sweep is exactly
 * the output a broken sweep produces. That is not hypothetical here: the first
 * version of this file offered `min` as a candidate value, so against the real
 * journey 8 input (min="0.01", step="1") it would have found 0.01 acceptable,
 * reported the form submittable, and printed PASS. The defect that motivated
 * the sweep would have sailed through the sweep.
 *
 * Restoring the defect in the product to check would not work either, because
 * scripts/guards/no-silent-submit.mjs blocks the build the moment it comes
 * back, which is the guard doing its job. So the proof runs against a synthetic
 * page carrying the exact shape, and the product is never touched.
 */
const SELF_TEST_HTML = `<!doctype html><meta charset="utf-8"><body><form>
  <input type="number" id="probe-journey-8" min="0.01" step="1" value="">
  <input type="number" id="probe-no-step" min="0.5" value="">
  <input type="number" id="probe-impossible-range" min="10" max="5" value="">
  <input type="number" id="probe-healthy" min="1" max="100" step="any" value="">
  <button type="submit">Go</button>
</form></body>`

const SELF_TEST_EXPECTED = {
  'probe-journey-8': false,
  'probe-no-step': false,
  'probe-impossible-range': false,
  'probe-healthy': true,
}

async function selfTest(browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.setContent(SELF_TEST_HTML)
  const measured = await page.evaluate(MEASURE)
  await ctx.close()

  const wrong = []
  for (const [id, expectValid] of Object.entries(SELF_TEST_EXPECTED)) {
    const row = measured.find(m => m.id === id)
    if (!row) {
      wrong.push(`${id}: not measured at all`)
      continue
    }
    if (row.anyValid !== expectValid) {
      wrong.push(
        `${id}: expected anyValid=${expectValid}, got ${row.anyValid} (tried ${row.tried}: ${row.refusals || 'a value passed'})`,
      )
    }
  }
  return { measured: measured.length, wrong }
}

const browser = await chromium.launch()
const findings = []
const reached = []
const unreachable = []
let fieldsMeasured = 0

{
  const st = await selfTest(browser)
  if (st.wrong.length > 0) {
    console.error('\n[validity-sweep] SELF-TEST FAILED. The measurement is wrong, so nothing it says about')
    console.error('                 the product can be believed, and a PASS below would be meaningless.')
    for (const w of st.wrong) console.error(`    ${w}`)
    await browser.close()
    process.exit(1)
  }
  console.log(
    `[validity-sweep] self-test OK: ${st.measured} synthetic field(s) judged correctly, ` +
      'including the exact journey 8 shape (min="0.01" step="1"), a fractional min with no step, ' +
      'and an impossible min/max range.',
  )
}

const sweepSurface = async (page, path) => {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
  await page.waitForTimeout(2500)
  const landed = new URL(page.url()).pathname
  if (!res || res.status() >= 400 || landed !== path) {
    unreachable.push(`${path} -> ${res ? res.status() : 'no response'} at ${landed}`)
    return
  }
  const opened = await REVEAL(page)
  const measured = await page.evaluate(MEASURE)
  fieldsMeasured += measured.length
  reached.push(`${path}  ${measured.length} constrained field(s)${opened.length ? `, opened: ${opened.join(', ')}` : ''}`)
  for (const m of measured) {
    if (m.anyValid) continue
    findings.push({ path, ...m })
  }
}

try {
  /*
   * THE PUBLIC PASS RUNS SIGNED OUT, IN ITS OWN CONTEXT.
   *
   * The first version signed up first and then visited /signup and /login,
   * which redirect a signed-in visitor to /dashboard. Both were recorded as
   * unreachable, and the two forms every stranger meets first were the two the
   * sweep never measured.
   */
  const anon = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const anonPage = await anon.newPage()
  await attach(j, anonPage)
  for (const path of ['/signup', '/login', '/forgot-password', '/contact', '/waitlist', '/organisers']) {
    await sweepSurface(anonPage, path)
  }
  await anon.close()

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const page = await ctx.newPage()
  await attach(j, page)

  // AUTHED SURFACES need a real organiser, and the discount panel needs an
  // event to hang off. Both are staged the way journey 8 stages them.
  const EMAIL = `sweep.${stamp}@example.com`
  const PASSWORD = `Str0ng-${stamp}-Pass!`
  const signedIn = await signUpAndConfirm(j, page, { name: 'Sweep Organiser', email: EMAIL, password: PASSWORD })

  let authedPaths = []
  if (signedIn) {
    const { data: profile } = await db.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
    let orgId = null
    if (profile) {
      const { data: orgs } = await db.from('organisations').select('id').eq('owner_id', profile.id).limit(1)
      orgId = orgs?.[0]?.id ?? null
      if (!orgId) {
        // slug, email and status are NOT NULL on this table. The first version
        // inserted name and owner_id only, the insert was refused, the error
        // was never read, and the sweep reported "no event could be staged"
        // while blaming the event.
        const { data: made, error: orgErr } = await db
          .from('organisations')
          .insert({
            name: `Sweep Presents ${stamp}`,
            slug: `sweep-presents-${stamp}`,
            email: EMAIL,
            description: 'A fixture organisation for the validity sweep.',
            status: 'active',
            owner_id: profile.id,
          })
          .select('id')
          .single()
        if (orgErr) unreachable.push(`could not stage an organisation: ${orgErr.message}`)
        orgId = made?.id ?? null
      }
    } else {
      unreachable.push(`no profile row for ${EMAIL}, so nothing could be staged under it`)
    }
    let eventId = null
    if (orgId && profile) {
      const { data: cat } = await db.from('categories').select('id').limit(1).single()
      const start = new Date(Date.now() + 30 * 864e5)
      const { data: ev, error: evErr } = await db
        .from('events')
        .insert({
          title: `Sweep Night ${stamp}`,
          slug: `sweep-night-${stamp}`,
          summary: 'A fixture for the validity sweep.',
          description: 'An event that exists only so the constrained forms behind it can be measured.',
          organisation_id: orgId,
          created_by: profile.id,
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
        .select('id')
        .single()
      if (evErr) unreachable.push(`could not stage an event: ${evErr.message}`)
      eventId = ev?.id ?? null
    }
    authedPaths = [
      '/dashboard/events/create',
      '/dashboard/venues',
      '/dashboard/profile',
      ...(eventId
        ? [
            `/dashboard/events/${eventId}/discounts`,
            `/dashboard/events/${eventId}/edit`,
            `/dashboard/events/${eventId}/tickets`,
            `/dashboard/events/${eventId}/settings`,
          ]
        : []),
    ]
    if (!eventId) unreachable.push('event-scoped dashboard forms (no event could be staged)')
  } else {
    unreachable.push('every authed dashboard form (no account could be created)')
  }

  for (const path of authedPaths) await sweepSurface(page, path)

  /*
   * A COVERAGE GAP, NAMED RATHER THAN LEFT IMPLICIT.
   *
   * /dashboard/events/create is a multi-step wizard and this sweep loads only
   * its FIRST step, so the ticketing step's price and capacity fields, which
   * are the money-shaped number inputs on this platform, are not measured here.
   * They are covered by the static guard (no-silent-submit scans all 47 number
   * inputs in the tree, and the drill set carries the ticket tier group as an
   * explicit no-false-positive case), but "covered by the guard" is a weaker
   * claim than "measured in the browser" and must not be reported as the same
   * thing.
   */
  unreachable.push(
    'the create-event wizard past its first step (ticket price and capacity fields) - static guard only, not measured in the browser',
  )

  await ctx.close()
} finally {
  await browser.close()
}

console.log('\n[validity-sweep] what this sweep reached:')
for (const r of reached) console.log(`    ${r}`)
if (unreachable.length) {
  console.log('[validity-sweep] what it could NOT reach, so has NOT judged:')
  for (const u of unreachable) console.log(`    ${u}`)
}
console.log(`[validity-sweep] measured ${fieldsMeasured} constrained field(s) across ${reached.length} surface(s).`)

if (fieldsMeasured === 0) {
  console.error('\n[validity-sweep] FAIL: measured nothing. A sweep that scans zero fields proves zero.')
  await finish(j)
  process.exit(1)
}

if (findings.length > 0) {
  console.error(`\n[validity-sweep] FAIL: ${findings.length} field(s) the browser refuses for EVERY value tried.`)
  for (const f of findings) {
    console.error(
      `    ${f.path}  #${f.id} (${f.type}) min=${f.min} max=${f.max} step=${f.step} pattern=${f.pattern}\n` +
        `        ${f.tried} candidates, all refused: ${f.refusals}\n` +
        `        No WHOLE NUMBER in the allowed range is submittable, so the form is refused by the
        browser before any handler runs, whatever a person types.`,
    )
  }
  await finish(j)
  process.exit(1)
}

console.log('[validity-sweep] PASS - every constrained field accepts at least one value a person could type.')
await finish(j)
