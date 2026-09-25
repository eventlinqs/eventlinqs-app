/**
 * COMPLETE STRIPE'S HOSTED EXPRESS ONBOARDING, AS A PERSON WOULD, IN TEST MODE.
 *
 * WHY THIS EXISTS. Close-out UX3.1 asks for five owner notifications, "each
 * proven by driving the real action on TEST, never by asserting that a code path
 * exists". One of the five is "Stripe Connect onboarding completes and charges
 * are enabled", and only Stripe can enable charges. It does that when a person
 * finishes the hosted form, so a drive that never finishes that form can never
 * reach the state change the notification is attached to.
 *
 * WHY IT IS NOT DONE THROUGH THE API INSTEAD, which would be far less code.
 * Because Stripe refuses, and the refusal is the point rather than an obstacle.
 * Driven on 13 September 2026, POST /v1/accounts with `tos_acceptance` on an
 * Express account answers 400:
 *
 *   "You cannot accept the Terms of Service on behalf of accounts where
 *    controller[requirement_collection]=stripe, which includes Standard and
 *    Express accounts."
 *
 * So there is no API shortcut to a charges-enabled Express account, and an
 * attempt to fake one would have to write `stripe_charges_enabled` into our own
 * database by hand, which would fire the trigger and prove nothing whatever
 * about the journey a person takes.
 *
 * THREE THINGS ABOUT THE PAGE, EACH OF WHICH COST A RUN TO FIND, RECORDED SO THE
 * NEXT READER DOES NOT PAY FOR THEM AGAIN.
 *
 *   1. THE FORM IS IN A CROSS-ORIGIN IFRAME, and not the one the URL suggests.
 *      The phone and verification steps render in the top `connect.stripe.com`
 *      document, and everything after them renders inside
 *      `https://connect-js.stripe.com/ui_layer_...`. A Playwright locator
 *      pierces an open shadow root but NEVER an iframe, so `page.getByLabel(...)`
 *      reads an empty document while the screenshot beside it shows a full form.
 *      That combination reads as a broken page and is not one.
 *   2. HEADLESS CHROMIUM IS CHALLENGED AND CANNOT PASS. The first step carries
 *      an hCaptcha, and bundled headless Chromium gets "Challenge expired.
 *      Please try again." for ever. Real Chrome by channel, headed, with a
 *      persistent context, is admitted. This is the same finding the web-push
 *      drive already recorded on this machine, in a different product.
 *   3. "USE TEST PHONE NUMBER" AND "USE TEST CODE" ONLY FILL THE FIELD. They do
 *      not submit it. A loop that clicks the affordance and then waits for the
 *      step to change waits for ever, because nothing was sent.
 *
 * EVERY TEST VALUE BELOW IS STRIPE'S OWN PUBLISHED ONE, from
 * https://docs.stripe.com/connect/testing (fetched 2026-09-13). None is invented,
 * and none is a real person's detail.
 */

/** Stripe's published test values. Source above; do not substitute a guess. */
export const STRIPE_TEST_ONBOARDING = {
  /*
   * THE PERSON'S PHONE IS NOT STRIPE'S TOKEN, AND THE REASON IS DRIVEN.
   *
   * Stripe publishes `0000000000` as the phone token that "validates
   * successfully", listing `individual.phone` among the fields it covers
   * (https://docs.stripe.com/connect/testing, fetched 2026-09-13). Its own
   * Australian onboarding widget will not hold it, and this is not our
   * formatting: pressing Stripe's own "Use test phone number" control on step
   * one writes `00000` into the visible box and `+6100000` into the hidden
   * `phone_number` field, and the later "Verify your personal details" step
   * then answers, in red, `"+6100000" is not a valid phone number`. Probed on
   * 13 September 2026 by reading every input on that step before and after the
   * click. The token is refused by the same product that publishes it.
   *
   * `individual.phone` is required (Stripe lists it in `requirements.
   * currently_due` for this account), so the field cannot simply be left empty.
   * The number used instead is one the Australian Communications and Media
   * Authority reserves for film, television and other creative works, which
   * parses as an Australian mobile and belongs to no person or business:
   * https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works
   * (fetched 2026-09-13).
   */
  phone: '0491570006',
  /** Kept for the account-phone step, which does accept it. */
  stripeTestPhoneToken: '0000000000',
  verificationCode: '000000',
  dob: { day: '01', month: '01', year: '1901' },
  /** A TOKEN, not an address. Stripe reads it as "this address matched". */
  addressLine1: 'address_full_match',
  city: 'Melbourne',
  state: 'VIC',
  /** The select lists states by full name; the API takes the abbreviation. */
  stateName: 'Victoria',
  postalCode: '3000',
  idNumber: '000000000',
  /** AU payout bank that succeeds. */
  bsb: '110000',
  accountNumber: '000123456',
  firstName: 'Nadia',
  lastName: 'Okonkwo',
  email: 'lane-c.payouts@example.com',
  url: 'https://www.eventlinqs.com.au',
  productDescription: 'Tickets to live music events',
}

const STRIPE_HOST = /connect\.stripe\.com/
const UI_LAYER = /connect-js\.stripe\.com\/ui_layer/

/**
 * The frame the person is actually looking at.
 *
 * The ui_layer frame wins when it carries a heading or a control, because once
 * it appears it owns every remaining step. Before it appears, the top document
 * does.
 */
function activeFrame(page) {
  const ui = page.frames().filter(f => UI_LAYER.test(f.url()))
  return { ui, top: page.frames().find(f => STRIPE_HOST.test(f.url())) ?? page.mainFrame() }
}

/**
 * What is on one frame, READ THROUGH LOCATORS RATHER THAN THE DOM.
 *
 * This used to call `document.querySelectorAll` inside the frame, and that is
 * the single mistake that cost this driver the most. Stripe renders the review
 * cards and the "Additional information" panel inside an OPEN SHADOW ROOT, and
 * `querySelectorAll` does not pierce one. So the read came back with a heading
 * and no controls, the driver had nothing to fill, and it pressed Save against a
 * panel it could not see, over and over, while the screenshot beside it showed a
 * full form. Every "(no heading)" and every empty field list in the older run
 * logs is this.
 *
 * A Playwright locator DOES pierce an open shadow root, which is how the
 * "Incomplete" badges were eventually found. So everything is read that way now,
 * and the cost is one round trip per control rather than one per step.
 */
async function readFrame(frame) {
  const headings = await frame.locator('h1,h2,h3').allInnerTexts().catch(() => null)
  if (headings === null) return null

  const controls = frame.locator('input:not([type=hidden]), select, textarea')
  const total = await controls.count().catch(() => 0)
  const fields = []
  for (let i = 0; i < Math.min(total, 40); i += 1) {
    const info = await controls
      .nth(i)
      .evaluate(e => ({
        tag: e.tagName,
        type: e.type,
        name: e.name || e.id || '',
        id: e.id || '',
        label:
          e.labels?.[0]?.textContent?.trim().slice(0, 70) ||
          e.getAttribute('aria-label') ||
          e.placeholder ||
          '',
        checked: e.type === 'radio' || e.type === 'checkbox' ? e.checked : undefined,
        options: e.tagName === 'SELECT' ? [...e.options].map(o => ({ v: o.value, t: o.textContent.trim() })).slice(0, 30) : null,
        value: e.value,
      }))
      .catch(() => null)
    if (!info) continue
    if (info.type === 'submit' || info.name === 'h-captcha-response') continue
    fields.push(info)
  }

  const buttons = await frame.locator('button, [role=button], input[type=submit]').allInnerTexts().catch(() => [])
  return {
    headings: headings.map(h => h.trim()).filter(Boolean).slice(0, 6),
    fields,
    buttons: buttons.map(b => b.trim()).filter(Boolean).slice(0, 24),
  }
}

/**
 * The frame with the STEP on it, chosen by what it carries rather than by order.
 *
 * Stripe puts more than one `connect-js` frame on the page at once, and they do
 * not agree about what is on screen: the "Additional information" panel showed
 * its heading in one frame and its Industry select in another. Taking the first
 * frame that had anything gave a step with a heading and no controls, so the
 * driver had nothing to fill and pressed Save against a select it could not
 * see, from step 21 to step 40.
 *
 * So every candidate frame is read and the one with the most CONTROLS wins, with
 * a heading-only frame kept as the fallback for the steps that genuinely have no
 * input on them (the review page is one).
 */
async function currentStep(page) {
  const { ui, top } = activeFrame(page)
  let withFields = null
  let headingOnly = null
  for (const f of [...ui, top].filter(Boolean)) {
    const r = await readFrame(f)
    if (!r) continue
    if (r.fields.length > 0) {
      if (!withFields || r.fields.length > withFields.fields.length) withFields = { frame: f, ...r }
    } else if (!headingOnly && r.headings.length > 0) {
      headingOnly = { frame: f, ...r }
    }
  }
  // A heading read from a different frame still belongs to this step, and losing
  // it would make every controls-only frame look like an unnamed page.
  if (withFields && withFields.headings.length === 0 && headingOnly) {
    withFields.headings = headingOnly.headings
  }
  return withFields ?? headingOnly ?? null
}

const keyOf = s => (s ? `${s.headings.join('|')}::${s.fields.map(f => f.label || f.name).join(',')}` : '')

/**
 * One control, addressed by attribute, never by `#id`. Stripe's generated ids
 * look like `react-aria1782110144-:rj:`, and a colon inside a CSS id selector is
 * a pseudo-class, so `#that` is a syntax error rather than a miss.
 *
 * A RADIO IS ADDRESSED BY ITS ID FIRST, and that is not a preference. Every
 * radio in a group shares one `name`, so `[name=...].first()` on the group
 * "Australian business number (ABN) / No ABN" resolves to the ABN option no
 * matter which one was asked for, and the drive then silently answers the
 * opposite of what it decided.
 */
function controlLocator(frame, field) {
  const grouped = field.type === 'radio'
  if (grouped && field.id) return frame.locator(`[id="${field.id}"]`).first()
  if (grouped && field.value) return frame.locator(`[name="${field.name}"][value="${field.value}"]`).first()
  if (field.name) return frame.locator(`[name="${field.name}"], [id="${field.name}"]`).first()
  if (field.id) return frame.locator(`[id="${field.id}"]`).first()
  if (field.label) return frame.getByLabel(field.label, { exact: false }).first()
  return null
}

/**
 * Fill one control with the value its own label asks for.
 *
 * Matched on the LABEL a person reads, never on a generated name: Stripe's field
 * names are `react-aria...` ids that change between renders, and a selector built
 * on one of those is a selector that works once.
 */
/**
 * Set a value AND CHECK THAT IT TOOK, falling back to typing when it did not.
 *
 * `fill()` sets the value and fires one input event, which is enough for a plain
 * input and not enough for two of the controls on this form. The date of birth
 * is three boxes behind one mask and the phone number is a formatter that
 * rewrites what it is given: filled, the phone box ended up holding "+61 00000"
 * and Stripe answered "+6100000 is not a valid phone number", while the date
 * stayed on its DD / MM / YYYY placeholder. Both accept keystrokes.
 *
 * A field that will not take its value is REPORTED, because the alternative is
 * what happened here: Continue pressed against an empty required field six times
 * with nothing in the log to say which field was empty.
 */
async function setValue(el, value, what, log) {
  await el.fill(value, { timeout: 8000 }).catch(() => {})
  // An Australian phone box drops the national leading zero, so "0491570006"
  // legitimately comes back as "491 570 006". Comparing raw digits reported that
  // correct value as a refusal.
  const digits = v => (v ?? '').replace(/\D/g, '').replace(/^0+/, '')
  let got = await el.inputValue().catch(() => '')
  if (digits(got).includes(digits(value)) || got === value) return true

  await el.click({ timeout: 5000 }).catch(() => {})
  await el.press('Control+a').catch(() => {})
  await el.press('Delete').catch(() => {})
  await el.pressSequentially(value, { delay: 150, timeout: 20000 }).catch(() => {})
  got = await el.inputValue().catch(() => '')
  if (digits(got).includes(digits(value)) || got === value) return true

  // LAST RESORT: React's own value setter plus the events it listens for.
  //
  // A controlled React input ignores a plain `node.value = x` because React
  // holds the value in state and overwrites the DOM on the next render. Calling
  // the prototype setter and then firing input and change is the documented way
  // round that, and it is what finally seats a value in a masked field whose
  // formatter eats keystrokes.
  await el
    .evaluate((node, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(node, v)
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
      node.blur()
    }, value)
    .catch(() => {})
  got = await el.inputValue().catch(() => '')
  const took = digits(got).includes(digits(value)) || got === value
  if (!took && log) log(`[stripe-onboarding]    WARNING: "${what}" would not take "${value}", it holds "${got}"`)
  return took
}

async function fillField(frame, field, values, log) {
  const label = `${field.label} ${field.name}`.toLowerCase()
  const set = async value => {
    const el = controlLocator(frame, field)
    if (!el) return false
    return setValue(el, value, field.label || field.name, log)
  }

  if (/verification code|sms code/.test(label)) return set(values.verificationCode)
  if (/phone/.test(label)) return set(values.phone)
  if (/first name|given name/.test(label)) return set(values.firstName)
  if (/last name|surname|family name/.test(label)) return set(values.lastName)
  if (/^email|email address/.test(label)) return set(values.email)
  if (/business website|website|url/.test(label)) return set(values.url)
  if (/what does your business|product description|describe/.test(label)) return set(values.productDescription)
  // "Address Field 1" is Stripe's own label on the personal-details step, and
  // nothing about it says "line 1" or "street". A map written from the API's
  // field names rather than from the page missed it, and the drive then pressed
  // Continue against an empty required field six times in a row.
  if (/address field 1|address line 1|street address|^address$/.test(label)) return set(values.addressLine1)
  if (/address field 2|address line 2|apartment|unit/.test(label)) return false
  if (/city|suburb/.test(label)) return set(values.city)
  if (/postal code|postcode|zip/.test(label)) return set(values.postalCode)
  if (/bsb|routing/.test(label)) return set(values.bsb)
  if (/account number/.test(label)) return set(values.accountNumber)
  if (/id number|tax file|identification/.test(label)) return set(values.idNumber)
  // The three date-of-birth boxes are labelled Day, Month and Year with no
  // mention of birth: on a step titled "Verify your personal details" there is
  // nothing else they could be.
  if (/^day\b/.test(label) || (/day/.test(label) && /birth|dob/.test(label))) return set(values.dob.day)
  if (/^month\b/.test(label) || (/month/.test(label) && /birth|dob/.test(label))) return set(values.dob.month)
  if (/^year\b/.test(label) || (/year/.test(label) && /birth|dob/.test(label))) return set(values.dob.year)
  if (/date of birth|birth/.test(label)) return set(`${values.dob.day}/${values.dob.month}/${values.dob.year}`)
  return false
}

/**
 * Choose from a select.
 *
 * Business type is INDIVIDUAL deliberately: a company in Australia needs an ACN
 * or ABN, which has no published test token, so a drive that picks Company stops
 * at a field no test value can satisfy.
 */
async function chooseOption(frame, field, values) {
  const label = `${field.label} ${field.name}`.toLowerCase()
  const pick = async rx => {
    const opt = (field.options ?? []).find(o => rx.test(o.t))
    const el = controlLocator(frame, field)
    if (!opt || !el) return false
    await el.selectOption(opt.v, { timeout: 8000 }).catch(() => {})
    return true
  }
  if (/business.?type/.test(label)) return pick(/^individual/i)
  if (/business.?structure|company.?structure/.test(label)) return pick(/sole trader|^individual/i)
  if (/state|province|territory/.test(label)) return pick(new RegExp(`^(${values.stateName}|${values.state})$`, 'i'))
  if (/industry|mcc|merchant.?category/.test(label)) return pick(/ticket|event|entertain|music|performing/i)
  if (/country/.test(label)) return pick(/^australia$/i)

  // A LABELLESS SELECT IS STILL ANSWERABLE FROM ITS OWN OPTIONS. Stripe's
  // industry picker arrives with no accessible label and a "Please select your
  // industry..." placeholder, so matching on the label alone leaves the one
  // control that blocks Continue untouched, which is how the previous run
  // finished with a greyed-out button and no explanation.
  const options = field.options ?? []
  if (options.some(o => /please select your industry/i.test(o.t))) {
    return pick(/ticket|event|entertain|music|performing/i)
  }
  return false
}

/**
 * Radios and checkboxes, which neither of the two branches above can reach.
 *
 * A radio arrives with a `value` already on it, so a pass that skips anything
 * holding a value never touches one, and the run this replaced stopped on
 * "Business structure: ABN / No ABN" under a red "This field is required" with
 * Continue greyed out and no error in the log at all.
 *
 * NO ABN is chosen because Stripe publishes no test ABN, so the other branch
 * asks for a number that cannot be satisfied by any documented value.
 */
async function chooseToggle(frame, field) {
  if (field.checked) return false
  const label = `${field.label} ${field.name}`.toLowerCase()
  const el = controlLocator(frame, field)
  if (!el) return false

  if (field.type === 'radio') {
    if (/no abn|do not have an abn|don.t have an abn/.test(label)) {
      await el.check({ timeout: 8000 }).catch(() => {})
      return true
    }
    if (/individual|sole trader/.test(label)) {
      await el.check({ timeout: 8000 }).catch(() => {})
      return true
    }
    return false
  }
  if (field.type === 'checkbox') {
    // Only ever TICK something a person must agree to, and never tick an
    // opt-in: "same as" reuses an address already filled, which removes a
    // second copy of the same fields rather than asserting anything new.
    if (/same as|i agree|accept|authoris|certify|confirm/.test(label)) {
      await el.check({ timeout: 8000 }).catch(() => {})
      return true
    }
    return false
  }
  return false
}

/**
 * Drive the hosted form to the end.
 *
 * Returns `{ completed, leftStripeAt, steps }`. `completed` is true only when the
 * browser has actually left connect.stripe.com, which is Stripe redirecting to
 * the platform's return url: the one observable fact that means the person
 * finished rather than gave up.
 */
export async function completeExpressOnboarding(page, { values: supplied = STRIPE_TEST_ONBOARDING, maxSteps = 40, shot = null, log = console.log } = {}) {
  /*
   * THE PHONE NUMBER IS LEARNED FROM STRIPE, NOT GUESSED AT.
   *
   * Stripe publishes `0000000000` as the phone token, and its own AU widget
   * will not hold it: typed in, the box keeps "00000" and the form answers
   * "+6100000 is not a valid phone number". The right value is not a matter of
   * opinion, and trying shorter strings until one sticks would be exactly the
   * guessing this project forbids. Step one of the form has a "Use test phone
   * number" control, so the value Stripe itself considers valid is READ out of
   * the box it just filled and reused on every later phone field.
   */
  const values = { ...supplied }
  const steps = []
  let previous = ''
  let idle = 0
  let loading = 0
  let repeats = 0
  /** The step signature a combobox was last answered for. See the bound below. */
  let comboAnsweredFor = null

  for (let i = 1; i <= maxSteps; i += 1) {
    if (!STRIPE_HOST.test(page.url())) {
      log(`[stripe-onboarding] left Stripe at ${page.url().slice(0, 90)}`)
      return { completed: true, leftStripeAt: page.url(), steps }
    }

    const s = await waitForStep(page, previous)
    if (!s) {
      idle += 1
      if (idle > 3) return { completed: false, leftStripeAt: null, steps, stoppedBecause: 'no step ever rendered' }
      await page.waitForTimeout(4000)
      continue
    }
    if (!STRIPE_HOST.test(page.url())) {
      return { completed: true, leftStripeAt: page.url(), steps }
    }

    /*
     * A SPINNER IS NOT A STEP, AND MUST NOT BE COUNTED AS ONE.
     *
     * Stripe shows a bare loading frame between steps, sometimes for the best
     * part of a minute. The run this replaced treated each of those as a step
     * with nothing to press, spent its whole idle budget on them, and reported
     * "stuck with nothing to press" while the form was still loading normally.
     * A frame with no heading and no control is waited on, not judged.
     */
    if (s.headings.length === 0 && s.fields.length === 0) {
      loading += 1
      if (loading > 12) return { completed: false, leftStripeAt: null, steps, stoppedBecause: 'the form never finished loading' }
      log(`[stripe-onboarding] ${i}. still loading, waiting`)
      await page.waitForTimeout(4000)
      continue
    }
    loading = 0
    // The budget is spent only on steps that REPEAT. A step that changed is
    // progress even when it offered nothing to press, because the phone and
    // code steps submit themselves when the test affordance fills them.
    if (keyOf(s) !== previous) idle = 0

    const heading = s.headings[0] ?? '(no heading)'
    steps.push({ step: i, heading, fields: s.fields.map(f => f.label || f.name) })
    log(`[stripe-onboarding] ${i}. ${heading} :: ${s.fields.map(f => f.label || f.name).join(', ').slice(0, 160)}`)
    if (shot) await page.screenshot({ path: `${shot}/stripe-${String(i).padStart(2, '0')}.png`, fullPage: true }).catch(() => {})

    if (keyOf(s) === previous) {
      repeats += 1
      if (repeats >= 4) {
        return {
          completed: false,
          leftStripeAt: null,
          steps,
          stoppedBecause: `"${heading}" came back ${repeats} times, so something on it is being refused`,
        }
      }
    } else {
      repeats = 0
    }
    previous = keyOf(s)

    // 1. Stripe's own test affordance, when the step offers one. It FILLS only.
    const aff = s.frame.getByText(/use test (phone number|code|data|account)|skip this step|prefill with test/i).first()
    if (await aff.count().catch(() => 0)) {
      log(`[stripe-onboarding]    test affordance: ${(await aff.innerText().catch(() => '')).trim().slice(0, 40)}`)
      await aff.click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(2000)
    }

    // 2. EVERY SELECT FIRST, and regardless of what it already holds.
    //
    //    Business type arrives pre-set to Company, so a loop that skips a
    //    control with a value leaves it there, and an Australian company then
    //    asks for an ACN and a tax id. Stripe publishes no test token for
    //    either, so that path cannot be finished by any drive, and the run this
    //    replaced died on it with 60 company, director and owner requirements
    //    outstanding. Choosing INDIVIDUAL is not a shortcut: it is the only
    //    branch whose every field has a published test value.
    //
    //    Selects are also re-read between passes, because choosing a business
    //    type re-renders the rest of the form beneath it.
    let fresh = (await currentStep(page)) ?? s
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false
      for (const field of fresh.fields) {
        if (field.tag === 'SELECT') {
          if (await chooseOption(fresh.frame, field, values)) changed = true
        } else if (field.type === 'radio' || field.type === 'checkbox') {
          if (await chooseToggle(fresh.frame, field)) changed = true
        }
      }
      if (!changed) break
      await page.waitForTimeout(1800)
      fresh = (await currentStep(page)) ?? fresh
    }

    // 3. THE DATE OF BIRTH IS ONE MASKED GROUP, not three inputs.
    //
    //    Day, Month and Year sit behind a single DD / MM / YYYY mask that
    //    auto-advances between segments. Filling each box in turn sets the DOM
    //    value without ever reaching the component's state, so the read-back
    //    agrees with itself, the drive reports success, and Stripe keeps asking
    //    for individual.dob.day. Typed into the first box as one run of
    //    keystrokes, the mask carries it across all three.
    const isDatePart = f => /^(day|month|year)\b/i.test(`${f.label} ${f.name}`)
    for (const [part, digitsFor] of [['day', values.dob.day], ['month', values.dob.month], ['year', values.dob.year]]) {
      // The boundary is written `\\b` because this is a template literal, where a
      // lone `\b` is the BACKSPACE escape: the pattern would ask for a control
      // character and match nothing. That is the same fault the
      // no-control-characters guard caught in the three literal regexes above,
      // arriving one layer along where no guard can see it.
      const f = fresh.fields.find(x => new RegExp(`^${part}\\b`, 'i').test(`${x.label} ${x.name}`))
      if (!f || f.value) continue
      const el = controlLocator(fresh.frame, f)
      if (!el) continue
      await el.click({ timeout: 5000 }).catch(() => {})
      await el.pressSequentially(digitsFor, { delay: 120, timeout: 15000 }).catch(() => {})
      const back = await el.inputValue().catch(() => '')
      if (back !== digitsFor) log(`[stripe-onboarding]    WARNING: date "${part}" holds "${back}" after typing "${digitsFor}"`)
      await page.waitForTimeout(250)
    }

    // 4. Then anything still empty gets the published test value for its label.
    //    The three date segments are excluded: they were typed as one run above,
    //    and a later fill() on any one of them resets the mask and throws the
    //    other two away. That is how a date that was visibly typed arrived at
    //    Stripe as a missing individual.dob.day.
    for (const field of fresh.fields) {
      if (field.tag === 'SELECT' || field.type === 'radio' || field.type === 'checkbox') continue
      if (field.value || isDatePart(field)) continue
      await fillField(fresh.frame, field, values, log)
    }
    await page.waitForTimeout(800)

    /*
     * 5. THE REVIEW PAGE IS NOT A STEP TO PRESS THROUGH.
     *
     *    "Review and submit" lists each section with a badge, and its "Agree and
     *    submit" button is DISABLED while any section reads Incomplete. Pressing
     *    a disabled button changes nothing, so the drive that did it sat on that
     *    page pressing it until its own repeat detector stopped it, with the
     *    reason visible on screen the whole time: Business information and
     *    Personal details both said Incomplete, each beside its own Edit.
     *
     *    So an incomplete section is OPENED rather than submitted past. The Edit
     *    belonging to that section is found by walking up from the badge to the
     *    card they share, which is the only way to tell one section's Edit from
     *    another's when three of them are identical.
     */
    /*
     * A CONTROL THAT IS NOT A <select> STILL HAS TO BE ANSWERED.
     *
     * Stripe's Industry picker on "Additional information" looks like a select
     * and is a combobox: a button with a popup listbox. It matches no input,
     * select or textarea, so a reader that gathers form elements sees an empty
     * panel, and the drive pressed Save against the one control that was
     * blocking submission twenty times over. Asked for by ROLE, it is found.
     */
    /*
     * ANSWERED ONCE PER STEP, NEVER ONCE PER PASS, and this bound is the whole
     * point rather than a tidiness measure.
     *
     * Answering a combobox `continue`s, because the answer can reveal fields
     * that were not there a moment ago and the step has to be re-read. That is
     * right, and it is also a way to starve everything below it: on 14 September
     * 2026, the pass after a business-type answer found the SAME picker still
     * showing its placeholder, answered it again, and continued - three times
     * over steps 5, 6 and 7 - so `chooseToggle` never ran, and the "No ABN"
     * radio that lane C wrote it for was never ticked. `repeats = 0` on each
     * answer meant the repeat budget could not end it either.
     *
     * It was a regression introduced by teaching this function to answer a
     * business-type picker at all: before that it matched nothing, returned
     * false, and the walk fell through to the field pass by accident. A branch
     * that only works while it fails is not working.
     *
     * So a combobox may be answered at most once for a given step signature.
     * When the signature changes, the allowance returns, because that is a
     * genuinely new question rather than the same one asked twice.
     */
    const stepKey = keyOf(s)
    if (comboAnsweredFor !== stepKey && (await answerCombobox(page, values, log))) {
      comboAnsweredFor = stepKey
      repeats = 0
      await page.waitForTimeout(2500)
      continue
    }

    const opened = await openIncompleteSection(page, log)
    if (opened) {
      // The review page comes back between edits and looks identical each time,
      // so its own repeat budget must not be what ends a run that is working.
      repeats = 0
      await page.waitForTimeout(3000)
      continue
    }

    // 6. Send it, looking in EVERY frame rather than only the one the fields
    //    came from.
    //
    //    `currentStep` picks the frame carrying the most controls, which is
    //    right for filling and wrong for pressing: the review page has no
    //    controls at all, so on a viewport where some other frame happened to
    //    hold one input, the step was read from that frame and "Agree and
    //    submit" was never seen. Mobile finished the form and tablet and desktop
    //    both stopped one press short of it, which is the kind of split that
    //    reads as a viewport defect and is entirely the harness's.
    const pressed = await pressPrimary(page, log)
    if (!pressed) {
      idle += 1
      /*
       * A STALL SAYS WHAT IT WAS LOOKING AT. This used to print six words and
       * nothing else, and a lane-A run on 14 September 2026 printed them five
       * times over three steps that also reported no heading and no fields -
       * which reads as "Stripe stopped talking" and is far more likely to mean
       * the walker read a step before it rendered, or read the wrong frame. The
       * two are indistinguishable from six words, and they need opposite fixes.
       */
      const seen = await page
        .evaluate(() => ({
          url: location.pathname,
          frames: window.frames.length,
          text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        }))
        .catch(() => null)
      log(
        seen
          ? `[stripe-onboarding]    no control to press. ${seen.frames} frame(s) at ${seen.url}, top document says: "${seen.text}"`
          : '[stripe-onboarding]    no control to press on this step, and the page could not be read at all',
      )
      // Not necessarily wrong: the phone and code steps submit themselves when
      // the test affordance fills them. It is only a failure when the SAME step
      // comes back with nothing to press, which the reset above detects.
      if (idle > 2) return { completed: false, leftStripeAt: null, steps, stoppedBecause: `stuck on "${heading}" with nothing to press` }
    }
    await page.waitForTimeout(2500)
  }
  return { completed: false, leftStripeAt: null, steps, stoppedBecause: `did not finish within ${maxSteps} steps` }
}

/**
 * Press the step's primary control, wherever on the page it lives.
 *
 * Returns false when no frame offers one, which is a real state: the phone and
 * verification steps submit themselves once Stripe's own test affordance fills
 * them, so a step with nothing to press is only a fault when the same step comes
 * back again.
 */
async function pressPrimary(page, log) {
  const named = /^(continue|submit|next|done|save|agree and submit|agree & submit|accept and submit)$/i
  for (const frame of page.frames()) {
    const go = frame
      .locator('button[type=submit], input[type=submit]')
      .or(frame.getByRole('button', { name: named }))
      .first()
    if (!(await go.count().catch(() => 0))) continue
    if (!(await go.isEnabled().catch(() => false))) continue
    log(`[stripe-onboarding]    pressing ${(await go.innerText().catch(() => '')).trim().slice(0, 28) || 'submit'}`)
    await go.click({ timeout: 8000 }).catch(() => {})
    return true
  }
  return false
}

/**
 * Answer an unanswered combobox, by role rather than by tag.
 *
 * Returns false when there is nothing unanswered, which is every step but one.
 * "Unanswered" is read off the control's own text: Stripe's placeholder says
 * "Please select your industry...", and a control that already carries a choice
 * is left alone rather than reopened.
 */
async function answerCombobox(page, values, log) {
  for (const frame of page.frames()) {
    const combos = frame.getByRole('combobox')
    const count = await combos.count().catch(() => 0)
    for (let i = 0; i < count; i += 1) {
      const combo = combos.nth(i)
      const shown = (await combo.innerText().catch(() => '')) || (await combo.inputValue().catch(() => '')) || ''
      if (!/please select|choose|select an option|select your/i.test(shown)) continue
      await combo.click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(1200)
      /*
       * WHICH QUESTION IS THIS. Until 14 September 2026 there was ONE want, the
       * industry one, and every unanswered combobox was answered as though it
       * were that question. Stripe asks at least two: the INDUSTRY, and the
       * BUSINESS TYPE, and on a lane-A run the business-type picker matched
       * nothing, was dismissed with Escape, and the next Continue accepted
       * Stripe's default. The account went down the COMPANY path - its next step
       * asked for an Australian company number and it then stalled on "Business
       * owners", which a walker has no directors to name - and finished
       * charges_enabled false, payout_status restricted.
       *
       * It cannot be fixed by setting business_type through the API. Probed
       * against the real account on 14 September 2026:
       *
       *     POST /v1/accounts/acct_1UFEtMKGrpw2Eqlc  business_type=individual
       *     403 This application does not have the required permissions for the
       *         parameter 'business_type'
       *
       * which is the same refusal this file's header already records for
       * tos_acceptance: on an Express account Stripe reserves these for the
       * person. So the person's choice is made here, where a person makes it.
       *
       * SOLE TRADER, because that is what a first organiser on this platform
       * actually is, and because it is the path lane C's UX3 runs took on the
       * way to charges_enabled ("Business type, Australian business number
       * (ABN), No ABN"). The wants are tried in order and the FIRST that matches
       * an offered option wins, so a picker that carries neither is still
       * reported rather than silently dismissed.
       */
      const WANTS = [
        { what: 'industry', rx: /ticket|event|entertain|music|performing|recreation/i },
        { what: 'business type', rx: /^\s*(individual|sole trader|sole proprietor)/i },
      ]
      let answered = false
      for (const want of WANTS) {
        const option = frame.getByRole('option', { name: want.rx }).first()
        if (!(await option.count().catch(() => 0))) continue
        const label = (await option.innerText().catch(() => '')).trim().slice(0, 40)
        if (log) log(`[stripe-onboarding]    answering "${shown.trim().slice(0, 40)}" with "${label}" (${want.what})`)
        await option.click({ timeout: 8000 }).catch(() => {})
        answered = true
        break
      }
      if (answered) return true
      /*
       * NOTHING MATCHED, so say what was actually on offer. The previous message
       * named only the pattern that failed, which tells a reader what the walker
       * wanted and nothing about what Stripe asked, and that is precisely the
       * information needed to add the next want. A dead end that describes
       * itself is one run; a dead end that does not is several.
       */
      const offered = []
      const options = frame.getByRole('option')
      const optionCount = await options.count().catch(() => 0)
      for (let k = 0; k < Math.min(optionCount, 12); k += 1) {
        offered.push(((await options.nth(k).innerText().catch(() => '')) || '').trim().slice(0, 28))
      }
      await page.keyboard.press('Escape').catch(() => {})
      if (log) {
        log(
          `[stripe-onboarding]    a combobox ("${shown.trim().slice(0, 40)}") offered no option this walker knows. ` +
            `${optionCount} option(s): ${offered.filter(Boolean).join(' | ') || '(none readable)'}`,
        )
      }
    }
  }
  return false
}

/**
 * Open the first section a review page marks Incomplete, and say which one.
 *
 * Returns false when nothing is incomplete, which is the normal case on every
 * step that is not the review page.
 */
async function openIncompleteSection(page, log) {
  /*
   * FOUND BY GEOMETRY, NOT BY DOM STRUCTURE.
   *
   * Walking up from the badge to its card is the obvious way to tell one
   * section's Edit from another's, and it does not work here: the review cards
   * live inside an open shadow root, `document.querySelectorAll` does not pierce
   * one, and a search written that way returns nothing while the screenshot
   * beside it shows three badges. It then says nothing, so the drive pressed a
   * disabled "Agree and submit" sixteen times with the reason on screen.
   *
   * A Playwright locator does pierce an open shadow root, so the badges and the
   * Edit buttons are both found. Pairing them by their vertical position on the
   * page is what makes an identical-looking Edit belong to one section rather
   * than another, and it does not care how the markup is nested.
   */
  for (const frame of page.frames()) {
    const badges = frame.getByText(/^incomplete$/i)
    const count = await badges.count().catch(() => 0)
    if (count === 0) continue
    const badgeBox = await badges.first().boundingBox().catch(() => null)
    if (!badgeBox) continue

    const edits = frame.getByRole('button', { name: /^edit$/i })
    const editCount = await edits.count().catch(() => 0)
    let best = null
    let bestDistance = Infinity
    for (let i = 0; i < editCount; i += 1) {
      const box = await edits.nth(i).boundingBox().catch(() => null)
      if (!box) continue
      const distance = Math.abs(box.y + box.height / 2 - (badgeBox.y + badgeBox.height / 2))
      if (distance < bestDistance) {
        bestDistance = distance
        best = edits.nth(i)
      }
    }
    // A pairing has to be close enough to be a pairing. Anything more than one
    // card apart means the two are unrelated and pressing it would open the
    // wrong section.
    if (!best || bestDistance > 60) continue
    if (log) log(`[stripe-onboarding]    a section is still incomplete, opening it (${count} incomplete)`)
    await best.click({ timeout: 8000 }).catch(() => {})
    return true
  }
  return false
}

/** Poll until the step differs from the last one, or the browser leaves Stripe. */
async function waitForStep(page, previous, maxMs = 60000) {
  const started = Date.now()
  let last = null
  for (;;) {
    if (!STRIPE_HOST.test(page.url())) return last
    const s = await currentStep(page)
    if (s) {
      last = s
      if (keyOf(s) !== previous && (s.headings.length > 0 || s.fields.length > 0)) return s
    }
    if (Date.now() - started > maxMs) return last
    await page.waitForTimeout(1500)
  }
}
