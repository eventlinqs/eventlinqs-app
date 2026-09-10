/**
 * DRIVEN PROOF: A FREED PLACE IS OFFERED DOWN THE QUEUE, AND THE OFFER RUNS OUT.
 * Close-out D2, the acceptance line:
 *
 *     "Driven proof of waitlist: sell out, join, refund, confirm the email fires
 *      and the hold expires to the next person."
 *
 * ----------------------------------------------------------------------------
 * IT SELLS OUT FOR REAL, because there was no other way to get there honestly.
 * TEST carries no sold-out tier at all, and every nearly-sold-out one is PAID,
 * so buying the last place would need the Stripe TEST key this machine does not
 * have. So the drive builds what it needs, entirely through the interface:
 *
 *   1. a real organiser signs up at /signup and publishes a real event through
 *      the real wizard, with ONE free place;
 *   2. a real attendee takes that place through the real public checkout, which
 *      sells the tier out;
 *   3. two more real attendees join the real waiting list, in order.
 *
 * Nothing above is seeded. Every account, event, order and queue position is
 * produced by pressing what a person presses.
 *
 * ----------------------------------------------------------------------------
 * WHAT CANNOT BE PULLED HERE, SAID PLAINLY. The trigger the close-out names is a
 * REFUND, and a refund is a Stripe call. `promoteWaitlist` is also called from
 * the squad expiry cron and the waitlist expiry cron, and all three paths call
 * the same function with the same arguments. That function IS driven, through
 * `d2-run-engine.mjs`, which is the same code the webhook reaches. What is not
 * exercised is Stripe's side of the refund, for the same reason UX6's payment
 * step is not: both keys answer `api_key_expired` and every Vercel record is
 * sensitive. One founder command closes it.
 *
 * Usage:
 *   BASE=... SERVER_LOG=... node --env-file=.env.local \
 *     scripts/verify/d2-waitlist-proof.mjs --out C:/dev/EVIDENCE/D2
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'

const TAG = '[d2-waitlist]'
const SERVER_LOG = process.env.SERVER_LOG ?? '.tmp-serve.log'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D2'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
out = join(out, 'waitlist')
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} REFUSING: this is the PRODUCTION Supabase project and this drive WRITES.`)
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const checks = []
const report = []
const say = line => {
  report.push(line)
  console.log(line)
}
function check(id, pass, detail) {
  checks.push({ id, pass, detail })
  say(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const PASSWORD = 'D2Waitlist!2026Proof'

function inbox() {
  if (!existsSync(SERVER_LOG)) return []
  const text = readFileSync(SERVER_LOG, 'utf8')
  const messages = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\[email:console\]\s+(to|subject|link)\s+(.*)$/)
    if (!m) {
      if (/\[email:console\] ---/.test(line) && current) {
        messages.push(current)
        current = null
      }
      continue
    }
    if (m[1] === 'to') current = { to: m[2].trim(), subject: '', links: [] }
    else if (m[1] === 'subject' && current) current.subject = m[2].trim()
    else if (m[1] === 'link' && current) current.links.push(m[2].trim())
  }
  if (current) messages.push(current)
  return messages
}
const offersTo = address =>
  inbox().filter(m => m.to.toLowerCase() === address.toLowerCase() && /just opened up/i.test(m.subject))

function engine(...engineArgs) {
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      'scripts/verify/d2-run-engine.mjs',
      ...engineArgs,
    ],
    { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, EMAIL_TRANSPORT: 'console' } },
  )
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`
  appendFileSync(SERVER_LOG, `\n${text}`, 'utf8')
  const line = `${r.stdout ?? ''}`.trim().split(/\r?\n/).filter(Boolean).pop() ?? ''
  let parsed = null
  try {
    parsed = JSON.parse(line)
  } catch {
    parsed = null
  }
  return { code: r.status ?? 1, parsed, text }
}

const clickText = async (page, rx) => {
  for (const el of await page.$$('button, a[role=button], a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

const fillByLabel = async (page, rx, value) => {
  for (const el of await page.$$('input')) {
    if (!(await el.isVisible().catch(() => false))) continue
    const name = await el.evaluate(
      e => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
    )
    if (rx.test(name)) {
      await el.fill(value).catch(() => {})
      return true
    }
  }
  return false
}

/* =========================================================================
 * THE RUN
 * ====================================================================== */
const j = makeJourney('d2-waitlist', 'D2: a freed place goes down the queue')
say(`${TAG} against ${BASE}; the inbox is ${SERVER_LOG}`)

const browser = await chromium.launch()
let slug = null
let eventId = null
let tierId = null

const organiser = `d2-org-${RUN}@example.com`
const first = `d2-first-${RUN}@example.com`
const second = `d2-second-${RUN}@example.com`
const third = `d2-third-${RUN}@example.com`

try {
  /* ---- 1. A REAL ORGANISER, AND A REAL EVENT WITH ONE FREE PLACE ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    const signedUp = await signUpAndConfirm(j, page, { name: 'Ada Waitlist', email: organiser, password: PASSWORD })
    check('the-organiser-signs-up', signedUp, signedUp ? organiser : (j.blockers.at(-1) ?? 'signup refused'))
    if (!signedUp) throw new Error('no organiser')

    const review = await createEventThroughWizard(j, page, {
      title: `Queue Proof Night ${RUN}`,
      summary: 'One place, and a queue behind it.',
      description: 'A real event with a single free place, so a real waiting list can form behind it.',
      price: 0,
      capacity: '1',
    })
    check(
      'the-event-reaches-a-publishable-review',
      Boolean(review?.reachedReview) && review?.publishDisabled === false,
      review?.reachedReview ? `Review offers Publish, disabled=${review.publishDisabled}` : 'never reached Review',
    )
    if (!review?.reachedReview || review.publishDisabled !== false) throw new Error('could not publish')
    await review.publishButton.click()
    await page.waitForTimeout(9000)
    await page.screenshot({ path: join(out, '01-published.png'), fullPage: false }).catch(() => {})
    await ctx.close()
  }

  {
    const { data: created } = await db
      .from('events')
      .select('id, slug, status, title')
      .ilike('title', `Queue Proof Night ${RUN}%`)
      .maybeSingle()
    eventId = created?.id ?? null
    slug = created?.slug ?? null
    check('the-event-published', created?.status === 'published' && Boolean(slug), `status=${created?.status} slug=${slug}`)
    if (!eventId || !slug) throw new Error('the event did not publish')

    const { data: tier } = await db
      .from('ticket_tiers')
      .select('id, name, price, total_capacity, sold_count, reserved_count')
      .eq('event_id', eventId)
      .maybeSingle()
    tierId = tier?.id ?? null
    check(
      'the-tier-has-exactly-one-free-place',
      tier?.price === 0 && (tier?.total_capacity ?? 0) === 1,
      `price=${tier?.price} capacity=${tier?.total_capacity}`,
    )
  }

  /* ---- 2. A REAL ATTENDEE TAKES THE ONE PLACE, SELLING IT OUT ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2500)
    const plus = await clickText(page, /^\+$/)
    check('the-last-place-can-be-taken', Boolean(plus), plus ? 'the stepper answered' : 'no quantity control')
    await page.waitForTimeout(1200)
    const onward =
      (await clickText(page, /^checkout\b/i)) ?? (await clickText(page, /^(continue|proceed|register)/i))
    await page.waitForURL(/\/checkout\//, { timeout: 45_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    check('the-buyer-reaches-checkout', /\/checkout\//.test(page.url()), `"${onward}" -> ${page.url().replace(BASE, '')}`)

    await fillByLabel(page, /full name/i, 'Bo Early')
    await fillByLabel(page, /^email/i, first)
    await page.waitForTimeout(500)
    const reused = await clickText(page, /use my details for all tickets/i)
    if (!reused) {
      await fillByLabel(page, /first name/i, 'Bo')
      await fillByLabel(page, /last name/i, 'Early')
      for (const e of await page.$$('input[type="email"]')) await e.fill(first).catch(() => {})
    }
    await page.waitForTimeout(1000)
    const submitted = await clickText(page, /^register for free/i)
    check('the-free-place-is-taken', Boolean(submitted), submitted ?? 'no way to complete a free registration')
    await page.waitForTimeout(9000)
    await page.screenshot({ path: join(out, '02-sold-out.png'), fullPage: false }).catch(() => {})
    await ctx.close()
  }

  {
    const { data: tier } = await db
      .from('ticket_tiers')
      .select('total_capacity, sold_count, reserved_count')
      .eq('id', tierId)
      .maybeSingle()
    const left = (tier?.total_capacity ?? 0) - (tier?.sold_count ?? 0) - (tier?.reserved_count ?? 0)
    check('the-tier-is-now-sold-out', left <= 0, `capacity ${tier?.total_capacity}, sold ${tier?.sold_count}, left ${left}`)
  }

  /* ---- 3. TWO REAL PEOPLE JOIN THE REAL WAITING LIST, IN ORDER ---- */
  for (const [address, who] of [
    [second, 'second'],
    [third, 'third'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
    const page = await ctx.newPage()
    await attach(j, page)
    const signedUp = await signUpAndConfirm(j, page, {
      name: `Kit ${who}`,
      email: address,
      password: PASSWORD,
    })
    check(`the-${who}-person-signs-up`, signedUp, signedUp ? address : (j.blockers.at(-1) ?? 'signup refused'))
    if (!signedUp) {
      await ctx.close()
      continue
    }

    const queueLength = async () => {
      const { count } = await db
        .from('waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
      return count ?? 0
    }
    const wanted = (await queueLength()) + 1

    await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2500)
    const joined =
      (await clickText(page, /join (the )?wait ?list/i)) ?? (await clickText(page, /notify me/i))
    await page.waitForTimeout(2500)

    /*
     * THE MODAL SUBMIT, NOT THE BUTTON THAT OPENED IT. An earlier run clicked
     * `^(join|confirm|add me)` and matched the TRIGGER again, because it is
     * still in the DOM and still visible behind the dialog, so the form was
     * never submitted: three PASSes about joining a queue, and an empty
     * waitlist table underneath them. The submit reads "Join Waitlist: 1
     * ticket", inside a dialog, and that is what is pressed.
     */
    const submit = page.locator('[role=dialog][aria-labelledby=waitlist-modal-title] button[type=submit]').first()
    let confirmed = null
    if (await submit.count()) {
      confirmed = (await submit.innerText().catch(() => '')).trim()

      /*
       * PRESSED WHERE A FINGER LANDS, not through Playwright's own click.
       *
       * `locator.click()` timed out on this button, twice, and its call log says
       * why: "element is visible, enabled and stable", then "scrolling into view
       * if needed", and then nothing. The modal is `position: fixed` inside a
       * document whose `html, body` carry `overflow-x: clip` (globals.css), and
       * the scroll step never settles on that combination. Nothing about the
       * button is wrong, and a person never scrolls to reach it.
       *
       * So the drive does what a person does and what Playwright's own click
       * would have done next: it reads the button's box, CHECKS THAT THE BUTTON
       * IS WHAT IS ACTUALLY AT THAT POINT, which is the reachability question
       * worth asking, and presses the mouse there.
       */
      /*
       * THE POINT IS MEASURED INSIDE THE PAGE, with `getBoundingClientRect`,
       * which is viewport-relative by definition. The run before this one used
       * Playwright's `boundingBox()` and then asked `elementFromPoint`, and the
       * answer came back "covered by the hero": two different coordinate spaces,
       * and a reachability check that was measuring the wrong pixel. A drive
       * that indicts the product for its own arithmetic is worse than no drive.
       */
      const at = await page.evaluate(() => {
        const button = document.querySelector(
          '[role=dialog][aria-labelledby=waitlist-modal-title] button[type=submit]',
        )
        if (!button) return null
        const box = button.getBoundingClientRect()
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        const topmost = document.elementFromPoint(x, y)
        return {
          x,
          y,
          reached: Boolean(topmost && topmost.closest('button') === button),
          topmost: topmost
            ? `${topmost.tagName.toLowerCase()} "${(topmost.textContent ?? '').trim().slice(0, 40)}"`
            : 'nothing',
        }
      })
      if (at) {
        check(
          `the-${who}-can-actually-reach-the-join-button`,
          at.reached,
          at.reached
            ? `the button is the topmost element at ${Math.round(at.x)},${Math.round(at.y)}`
            : `covered by ${at.topmost} at ${Math.round(at.x)},${Math.round(at.y)}`,
        )
        await page.mouse.click(at.x, at.y)
      } else {
        check(`the-${who}-can-actually-reach-the-join-button`, false, 'the join button has no box on the page')
      }
    } else {
      confirmed = await clickText(page, /^join waitlist:/i)
    }
    await page.waitForTimeout(3000)
    /*
     * WHAT THE DIALOG SAYS AFTER THE PRESS. A join that does not happen has a
     * reason and the dialog is where it is written; a drive that reports only
     * "0 rows" is asking somebody to guess.
     */
    const dialogSaid = await page
      .locator('[role=dialog][aria-labelledby=waitlist-modal-title]')
      .first()
      .innerText()
      .then(t => t.replace(/\s+/g, ' ').trim().slice(0, 200))
      .catch(() => '(the dialog is gone, which is what a join looks like)')
    say(`${TAG}   after the press, ${who} is on ${page.url().replace(BASE, '')} and the dialog says: ${dialogSaid}`)

    /*
     * WAIT FOR THE ROW, NOT FOR A CLOCK. The run before this one gave the join
     * five seconds and then counted, and the second person's row arrived at
     * about six: the drive recorded a FAILED join and then attributed that same
     * row to the third person, who had actually never submitted anything. A
     * fixed timeout does not measure a server, it measures a guess.
     */
    let queued = await queueLength()
    for (let i = 0; i < 20 && queued < wanted; i += 1) {
      await page.waitForTimeout(1000)
      queued = await queueLength()
    }
    await page.screenshot({ path: join(out, `03-joined-${who}.png`), fullPage: false }).catch(() => {})
    /*
     * THE ROW IS THE ANSWER, not which control was pressed. There are two ways
     * in: the tickets panel opens the dialog, and the ticket selector joins
     * directly with no dialog at all. An earlier version of this check required
     * a dialog submit and reported a perfectly good direct join as a failure.
     */
    check(
      `the-${who}-person-joins-the-waiting-list`,
      Boolean(joined) && queued >= wanted,
      `"${joined ?? 'nothing to click'}"${confirmed ? ` then "${confirmed}"` : ' (joined directly, no dialog)'}; ` +
        `${queued} row(s) on the list, wanted ${wanted}`,
    )
    await ctx.close()

    /*
     * THE LEDGER ROW LANDS AFTER THE RESPONSE, by D1's reversal condition, so
     * the drive waits for THAT too before the next person joins. The queue is
     * ordered by when the demand row landed, and two rows racing would make the
     * "in join order" assertion a coin toss rather than a check.
     */
    const { data: slotSoFar } = await db.from('ledger_slots').select('id').eq('source_ref', eventId).maybeSingle()
    if (slotSoFar?.id) {
      for (let i = 0; i < 15; i += 1) {
        const { count } = await db
          .from('ledger_entries')
          .select('id', { count: 'exact', head: true })
          .eq('slot_id', slotSoFar.id)
          .eq('demand_action', 'waitlist_join')
        if ((count ?? 0) >= wanted) break
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  const { data: slotRow } = await db.from('ledger_slots').select('id').eq('source_ref', eventId).maybeSingle()
  const slotId = slotRow?.id ?? null
  check('the-ledger-knows-this-slot', Boolean(slotId), slotId ?? 'no slot')

  const { data: joins } = await db
    .from('ledger_entries')
    .select('id, contact_email, occurred_at, quantity, inventory_class')
    .eq('slot_id', slotId)
    .eq('demand_action', 'waitlist_join')
    .order('occurred_at', { ascending: true })
  const queue = (joins ?? []).map(r => r.contact_email)
  check(
    'the-queue-is-in-the-ledger-in-join-order',
    queue.length === 2 && queue[0] === second && queue[1] === third,
    `queue: ${queue.join(' then ') || 'empty'}`,
  )
  check(
    'the-queue-row-carries-what-the-offer-must-name',
    (joins ?? []).every(r => r.inventory_class && (r.quantity ?? 0) > 0),
    (joins ?? []).map(r => `${r.inventory_class} x${r.quantity}`).join(', ') || 'nothing recorded',
  )

  /* ---- 4. A PLACE FREES UP. The same call the refund webhook makes. ---- */
  const promoted = engine('promote', '--event', eventId, '--tier', tierId, '--units', '1')
  say(`${TAG} the release said: ${JSON.stringify(promoted.parsed ?? promoted.text.slice(0, 400))}`)
  await new Promise(r => setTimeout(r, 1500))

  check(
    'the-offer-goes-to-the-person-who-joined-first',
    offersTo(second).length === 1,
    offersTo(second).length === 1 ? `subject "${offersTo(second)[0].subject}"` : `${offersTo(second).length} offer(s)`,
  )
  check(
    'and-not-to-the-person-behind-them',
    offersTo(third).length === 0,
    `${offersTo(third).length} offer(s) to the third person`,
  )
  if (offersTo(second).length === 1) {
    const offer = offersTo(second)[0]
    check(
      'the-offer-links-somewhere-they-can-claim-it',
      offer.links.some(l => l.includes(`/events/${slug}`)),
      offer.links.join(' | ') || 'no links',
    )
    check(
      'the-offer-carries-a-way-to-stop',
      offer.links.some(l => l.includes('/unsubscribe/recovery/')),
      offer.links.find(l => l.includes('/unsubscribe/recovery/')) ?? 'no stop link',
    )
  }

  const { data: holds } = await db
    .from('recovery_holds')
    .select('id, contact_email, units, expires_at, claimed_at, released_at, demand_entry_id')
    .eq('slot_id', slotId)
  check(
    'the-offer-is-recorded-with-the-moment-it-runs-out',
    (holds ?? []).length === 1 && Boolean(holds[0].expires_at) && Number(holds[0].demand_entry_id) > 0,
    (holds ?? []).map(h => `${h.contact_email} until ${h.expires_at} (entry ${h.demand_entry_id})`).join(', ') || 'no hold',
  )

  /* ---- 5. NOTHING HAPPENS TWICE ---- */
  const beforeRepeat = offersTo(second).length + offersTo(third).length
  engine('activate', '--slot', slotId, '--units', '1')
  await new Promise(r => setTimeout(r, 1200))
  check(
    'a-second-sweep-inside-the-window-offers-nobody-else',
    offersTo(second).length + offersTo(third).length === beforeRepeat,
    `offers ${beforeRepeat} -> ${offersTo(second).length + offersTo(third).length}`,
  )

  /* ---- 6. THE HOLD RUNS OUT AND THE PLACE PASSES DOWN THE LIST ---- */
  const lapsed = engine('activate', '--slot', slotId, '--units', '1', '--hours-ahead', '1')
  say(`${TAG} an hour later: ${JSON.stringify(lapsed.parsed ?? lapsed.text.slice(0, 400))}`)
  await new Promise(r => setTimeout(r, 1500))

  check(
    'the-hold-that-ran-out-is-handed-back',
    (lapsed.parsed?.released ?? 0) === 1,
    `released ${lapsed.parsed?.released}, offered ${lapsed.parsed?.offered}`,
  )
  check(
    'and-the-place-passes-to-the-next-person',
    offersTo(third).length === 1,
    offersTo(third).length === 1 ? `subject "${offersTo(third)[0].subject}"` : `${offersTo(third).length} offer(s)`,
  )
  check(
    'the-person-whose-turn-ran-out-is-not-offered-it-again',
    offersTo(second).length === 1,
    `${offersTo(second).length} offer(s) to the first person`,
  )

  const { data: afterHolds } = await db
    .from('recovery_holds')
    .select('contact_email, released_at, expires_at')
    .eq('slot_id', slotId)
    .order('id', { ascending: true })
  check(
    'both-outcomes-are-on-the-record',
    (afterHolds ?? []).length === 2 && Boolean(afterHolds[0].released_at) && !afterHolds[1].released_at,
    (afterHolds ?? [])
      .map(h => `${h.contact_email}: ${h.released_at ? `released ${h.released_at}` : `holding until ${h.expires_at}`}`)
      .join(' | ') || 'no holds',
  )

  /* ---- 7. AND IT STOPS. There is nobody else in the queue. ---- */
  const beforeEnd = offersTo(second).length + offersTo(third).length
  engine('activate', '--slot', slotId, '--units', '1', '--hours-ahead', '2')
  await new Promise(r => setTimeout(r, 1200))
  check(
    'when-the-queue-is-exhausted-nobody-is-written-to-again',
    offersTo(second).length + offersTo(third).length === beforeEnd,
    `offers ${beforeEnd} -> ${offersTo(second).length + offersTo(third).length}`,
  )
} catch (cause) {
  say(`${TAG} THREW: ${cause instanceof Error ? cause.message : String(cause)}`)
  checks.push({ id: 'the-run-completed', pass: false, detail: String(cause) })
} finally {
  await browser.close()
}

const failed = checks.filter(c => !c.pass)
say('')
say(`${TAG} ${checks.length - failed.length} of ${checks.length} checks passed`)
for (const f of failed) say(`${TAG}   FAILED  ${f.id}  ${f.detail}`)
note(j, 'waitlist proof finished', `${checks.length - failed.length}/${checks.length}`)
writeFileSync(join(out, 'report.txt'), report.join('\n'), 'utf8')
writeFileSync(join(out, 'checks.json'), JSON.stringify(checks, null, 2), 'utf8')

if (failed.length > 0) process.exit(1)
console.log(`${TAG} every check passed.`)
