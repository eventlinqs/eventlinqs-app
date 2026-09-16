/**
 * THE THREE STATES, THE CALENDAR FILE AND THE ACCESS SECTION, ON RUNNING PAGES,
 * AT 390, 768 AND 1440.
 *
 * ============================================================================
 * WHAT THE CLOSE-OUT ASKS FOR, AND WHICH HALF THIS IS
 * ============================================================================
 *
 * SEO5 acceptance 2: "A driven proof downloads the ICS from a lane-C event and
 * asserts it parses with the correct start, end and timezone."
 * SEO5 acceptance 3: "A driven proof at 390, 768 and 1440 of the normal, sold
 * out and past states."
 *
 * Both are here, in one drive, because both need the same three fixtures and
 * starting a browser three times to prove three halves of one item is a way of
 * spending four minutes to look thorough.
 *
 * `scripts/guards/no-false-urgency.mjs` proves the WIRING cannot regress.
 * `tests/component/seo5-states.test.tsx` proves the components behave in
 * isolation. Neither can see a real page: the sold-out panel only appears when
 * the inventory cache and the organiser sale gate both agree, the past banner
 * only appears for a row whose status the lifecycle allows, and the ICS only
 * exists once a browser has run the code that composes it. That is what this
 * does.
 *
 * ============================================================================
 * THE FIXTURES ARE OWNED, NOT BORROWED, AND THAT WAS LEARNED THE EXPENSIVE WAY
 * ============================================================================
 *
 * `scripts/verify/all-in-pricing-drive.mjs` records three failed attempts at
 * borrowing an event from TEST: an organiser who had not finished Stripe setup,
 * a dynamic pricing rule that made the page right and the drive wrong, and a
 * sale gate that reads five organisation fields where the query asked about
 * two. The same lesson applies harder here, because a SOLD OUT event and a PAST
 * event are states the catalogue does not contain at all: the platform has one
 * future event, which is exactly why the close-out says these states "have
 * never been observed".
 *
 * So this creates three lane-C events, drives them, and deletes them in a
 * `finally`. Every row it writes carries `lane-c` in the slug and the title.
 *
 * Run: node --env-file=.env.local scripts/verify/seo5-states-drive.mjs [baseUrl]
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

assertNotProduction()

const BASE = (process.argv[2] || process.env.SEO5_BASE || 'http://localhost:3200').replace(/\/$/, '')
const OUT = process.env.SEO5_OUT || ''
const TAG = '[seo5-states]'

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop-1440', width: 1440, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const log = []
const faults = []
const say = m => {
  log.push(m)
  console.log(`${TAG} ${m}`)
}
const pass = m => say(`PASS  ${m}`)
const fail = m => {
  faults.push(m)
  log.push(`FAIL: ${m}`)
  console.error(`${TAG} FAIL: ${m}`)
}

const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url.includes(TEST_PROJECT_REF)) {
  console.error(`${TAG} REFUSING: NEXT_PUBLIC_SUPABASE_URL is not the TEST project ${TEST_PROJECT_REF}.`)
  process.exit(2)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const created = []
const createdVenues = []
const REVERSAL_FLAG = 'event_availability_and_access'
let flagRowWritten = false
let venueAccessibilityAvailable = true

/* ------------------------------------------------------------------ fixtures */

/**
 * The one donor lookup, asking all five sale-gate fields in one question.
 *
 * `src/lib/payments/sale-status.ts` fails CLOSED on any of the five, so a query
 * about two of them picks an organisation whose page correctly refuses to sell
 * and the drive then reports the page as broken. That exact mistake is recorded
 * in the all-in-pricing drive and is not repeated here.
 */
async function findDonor() {
  const { data, error } = await db
    .from('events')
    .select(
      'organisation_id, created_by, category_id, organisation:organisations!inner(id, slug, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status)',
    )
    .eq('organisation.status', 'active')
    .eq('organisation.stripe_charges_enabled', true)
    .eq('organisation.stripe_payouts_enabled', true)
    .not('organisation.stripe_account_id', 'is', null)
    .not('organisation.stripe_account_country', 'is', null)
    .eq('organisation.payout_status', 'active')
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    throw new Error(`no event on TEST belongs to a sale-ready organisation: ${error?.message ?? 'none found'}`)
  }
  const { data: cover } = await db
    .from('events')
    .select('cover_image_url')
    .not('cover_image_url', 'is', null)
    .limit(1)
    .maybeSingle()
  if (!cover?.cover_image_url) throw new Error('no published event on TEST carries a cover image to borrow')
  return {
    organisationId: data.organisation_id,
    organisationSlug: data.organisation.slug,
    createdBy: data.created_by,
    categoryId: data.category_id,
    coverImageUrl: cover.cover_image_url,
  }
}

/** The zone every fixture uses, and the zone the ICS assertion converts back to. */
const ZONE = 'Australia/Melbourne'

/**
 * 10 October 2026, 7:00 pm to 11:30 pm Melbourne time.
 *
 * DELIBERATELY INSIDE DAYLIGHT SAVING, so the offset is +11 rather than the +10
 * a reader assumes from the zone name. A formatter that drops the zone, or that
 * appends `Z` to a local time, produces a visibly different answer for this
 * instant and the same answer for a winter one.
 */
const START_UTC = '2026-10-10T08:00:00.000Z'
const END_UTC = '2026-10-10T12:30:00.000Z'
const EXPECTED_LOCAL_START = '10/10/2026, 19:00'
const EXPECTED_LOCAL_END = '10/10/2026, 23:30'

async function createEvent(donor, { kind, status, startIso, endIso, capacity, sold, accessibility }) {
  const stamp = Date.now().toString(36)
  const slug = `lane-c-seo5-${kind}-${stamp}`
  const { data: event, error } = await db
    .from('events')
    .insert({
      title: `Lane C SEO5 ${kind} probe`,
      slug,
      organisation_id: donor.organisationId,
      created_by: donor.createdBy,
      category_id: donor.categoryId,
      cover_image_url: donor.coverImageUrl,
      start_date: startIso,
      end_date: endIso,
      timezone: ZONE,
      status,
      // A real published event carries this, and several surfaces read it to
      // decide whether the event has ever been public. A fixture that omits it
      // is testing a shape the platform does not produce.
      published_at: status === 'draft' ? null : new Date().toISOString(),
      visibility: 'public',
      venue_name: 'Lane C Proof Room',
      venue_address: '1 Lane C Street',
      venue_city: 'Melbourne',
      venue_country: 'Australia',
      description: 'A lane-C verification row. Created and deleted by scripts/verify/seo5-states-drive.mjs.',
      ...(accessibility ?? {}),
    })
    .select('id, slug')
    .single()
  if (error) throw new Error(`could not insert the lane-C ${kind} event: ${error.message}`)
  created.push(event.id)

  const { error: tierError } = await db.from('ticket_tiers').insert({
    event_id: event.id,
    name: 'Lane C general admission',
    price: 2850,
    currency: 'AUD',
    total_capacity: capacity,
    sold_count: sold,
    max_per_order: 10,
  })
  if (tierError) throw new Error(`could not insert the lane-C ${kind} tier: ${tierError.message}`)

  say(`created /events/${event.slug} (${kind}, ${status}, ${sold}/${capacity} sold)`)
  return event.slug
}

/**
 * The lane-C venue, with an image to judge and access details to render.
 *
 * `resolveVenueProfile` finds a venue by DERIVING the slug from the name in
 * memory, so the name decides the URL. It is stamped with the run so two runs
 * never collide, and the handle is returned rather than guessed.
 */
async function createLaneCVenue(donor) {
  const name = `Lane C Access Rooms ${Date.now().toString(36)}`
  const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const row = {
    organisation_id: donor.organisationId,
    name,
    address: '1 Lane C Street',
    city: 'Melbourne',
    state: 'VIC',
    country: 'Australia',
    postal_code: '3000',
    capacity: 400,
    description: 'A lane-C verification venue. Created and deleted by scripts/verify/seo5-states-drive.mjs.',
    image_url: donor.coverImageUrl,
    is_active: true,
  }
  const withAccess = {
    ...row,
    step_free_access: true,
    hearing_loop: true,
    accessibility_notes: 'Ring the bell at the laneway door and staff will meet you.',
  }
  let inserted = await db.from('venues').insert(withAccess).select('id').single()
  if (inserted.error) {
    // The accessibility columns come with a PARKED migration. Without them the
    // venue still exists and the alt-text half of the check still runs.
    venueAccessibilityAvailable = false
    say('the venue accessibility columns are NOT on this database, so that half is skipped')
    inserted = await db.from('venues').insert(row).select('id').single()
    if (inserted.error) {
      fail(`could not create the lane-C venue: ${inserted.error.message}`)
      return null
    }
  }
  createdVenues.push(inserted.data.id)
  say(`created /venues/${handle}`)
  return handle
}

/* ------------------------------------------------------------------- helpers */

/** The wall clock an instant shows in a named zone. */
function localWallClock(iso, timeZone) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function fromIcsUtc(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  if (!m) throw new Error(`not an ICS UTC value: ${value}`)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

function icsProperty(text, property) {
  const line = text.split(/\r?\n/).find(l => l.startsWith(`${property}:`))
  return line ? line.slice(property.length + 1) : null
}

/**
 * LOAD A PAGE AND WAIT FOR IT TO ACTUALLY BE THERE.
 *
 * THE FIRST RUN OF THIS DRIVE REPORTED FIFTEEN FAULTS AND EVERY ONE WAS THIS
 * FUNCTION MISSING. It used `domcontentloaded` plus a 600ms pause, which on a
 * dev server compiling a route for the first time is a screenshot of a
 * skeleton. `Add to calendar` is a CLIENT component, so it is a lazy reference
 * in the streamed payload and does not exist in the DOM until hydration; the
 * accessibility section and the state banners are server-rendered but arrive
 * after the shell. A drive that asserts before any of that is a drive that
 * reports the product broken when the harness was early.
 *
 * It also RAISES a page error rather than swallowing it. The same first run hid
 * a genuine crash (`Invalid OpenGraph type: event`, which took the whole page
 * down) behind fifteen "element not found" lines, and the crash is the thing
 * worth knowing.
 */
async function open(page, path) {
  const errors = []
  const onPageError = e => errors.push(String(e.message))
  page.on('pageerror', onPageError)
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 180000 })
  await page.waitForSelector('h1', { timeout: 90000 })
  // Hydration: the client components mount after the server payload lands.
  await page.waitForTimeout(2500)
  page.off('pageerror', onPageError)
  const heading = await page.locator('h1').first().innerText().catch(() => '')
  if (/hit a snag|went wrong|error/i.test(heading)) {
    fail(`${path} rendered an error boundary ("${heading}")${errors.length ? `: ${errors[0]}` : ''}`)
    return false
  }
  if (errors.length > 0) {
    fail(`${path} raised a page error: ${errors[0]}`)
    return false
  }
  return true
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

async function shoot(page, name) {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })
}

/**
 * THE REVERSAL SWITCH, FLIPPED FOR REAL.
 *
 * SEO5's reversal condition is "One flag hides the availability indicator and
 * the accessibility section while leaving the calendar links in place." A
 * reversal condition nobody has ever executed is a paragraph, so this drive
 * executes it: the row is written, the cached value is deleted, the page is
 * reloaded and read, and the row is put back in the `finally`.
 *
 * THE CACHE DELETE IS NOT OPTIONAL. `isFeatureEnabled` caches for 30 seconds in
 * Upstash, and `src/lib/redis/client.ts` namespaces every key by the Supabase
 * project ref, so the key is `<ref>:ff:v2:<flag>`. Without the delete this
 * would read the previous value and report the reversal working when it had not
 * taken effect, or not working when it had.
 */
async function setReversalFlag(enabled) {
  const { error } = await db
    .from('feature_flags')
    .upsert(
      { flag: REVERSAL_FLAG, enabled, description: 'Close-out SEO5 reversal condition.' },
      { onConflict: 'flag' },
    )
  if (error) throw new Error(`could not set ${REVERSAL_FLAG}: ${error.message}`)
  flagRowWritten = true
  await deleteFlagCache()
}

async function deleteFlagCache() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return
  const ref = /https?:\/\/([a-z0-9]+)\.supabase\./i.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1] ?? 'unknown'
  const key = `${ref}:ff:v2:${REVERSAL_FLAG}`
  const res = await fetch(`${url.replace(/\/$/, '')}/del/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) say(`WARNING: could not clear the flag cache (${res.status}); the read may be stale`)
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const donor = await findDonor()
  say(`donor organisation ${donor.organisationSlug}`)

  const future = new Date(Date.now() + 21 * 24 * 3600 * 1000)
  const past = new Date(Date.now() - 21 * 24 * 3600 * 1000)

  /*
   * THE NORMAL EVENT CARRIES ACCESS DETAILS, the sold-out and past ones do not.
   * That is the emptiness rule proven on a running page rather than in jsdom:
   * one page must show the section and two must have no trace of it.
   *
   * The accessibility columns are created by a PARKED migration
   * (docs/migrations-pending/20260914000002_accessibility_fields.sql). This
   * database has them; production does not until the founder applies it. So the
   * insert is attempted and, if the columns are absent, the drive says so and
   * skips the access assertions rather than reporting a product failure.
   */
  const accessFields = {
    wheelchair_accessible: true,
    companion_card_accepted: true,
    accessibility_notes: 'The accessible entrance is on the laneway side and staff will meet you there.',
    accessibility_contact: '03 9000 0000',
  }

  let accessibilityAvailable = true
  let normalSlug
  try {
    normalSlug = await createEvent(donor, {
      kind: 'normal',
      status: 'published',
      startIso: START_UTC,
      endIso: END_UTC,
      capacity: 100,
      sold: 0,
      accessibility: accessFields,
    })
  } catch (error) {
    if (!/column .* does not exist|accessibility/i.test(String(error.message))) throw error
    accessibilityAvailable = false
    say('the accessibility columns are NOT on this database, so the access assertions are skipped')
    normalSlug = await createEvent(donor, {
      kind: 'normal',
      status: 'published',
      startIso: START_UTC,
      endIso: END_UTC,
      capacity: 100,
      sold: 0,
    })
  }

  const soldOutSlug = await createEvent(donor, {
    kind: 'soldout',
    status: 'published',
    startIso: future.toISOString(),
    endIso: new Date(future.getTime() + 4 * 3600 * 1000).toISOString(),
    capacity: 50,
    sold: 50,
  })

  const pastSlug = await createEvent(donor, {
    kind: 'past',
    status: 'completed',
    startIso: past.toISOString(),
    endIso: new Date(past.getTime() + 4 * 3600 * 1000).toISOString(),
    capacity: 100,
    sold: 40,
  })

  /*
   * A LANE-C VENUE WITH AN IMAGE AND WITH ACCESS DETAILS.
   *
   * No venue on TEST carries an image_url (18 active venues, zero with one,
   * checked on 14 September 2026), so a drive that borrowed one would assert
   * alt text on a branded gradient fallback and prove nothing. This owns its
   * venue exactly as it owns its events, and deletes it in the same `finally`.
   */
  const venueHandle = await createLaneCVenue(donor)
  const organiserSlug = donor.organisationSlug

  const browser = await chromium.launch()
  try {
    /* ---------------------------------------------------------- the ICS file */
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
      const page = await context.newPage()
      await open(page, `/events/${normalSlug}`)

      const trigger = page.getByRole('button', { name: /add to calendar/i })
      if ((await trigger.count()) === 0) {
        fail('the normal event page renders no Add to calendar control at all')
      } else {
        await trigger.first().click()
        const download = page.waitForEvent('download', { timeout: 15000 })
        await page.getByRole('menuitem', { name: /Apple or Outlook/i }).click()
        const file = await download
        const path = await file.path()
        const ics = readFileSync(path, 'utf8')

        if (!/^lane-c-seo5-normal-.*\.ics$/.test(file.suggestedFilename())) {
          fail(`the downloaded file is named ${file.suggestedFilename()}, which no buyer would recognise`)
        } else {
          pass(`the ICS downloads as ${file.suggestedFilename()}`)
        }

        const dtstart = icsProperty(ics, 'DTSTART')
        const dtend = icsProperty(ics, 'DTEND')
        const uid = icsProperty(ics, 'UID')
        const dtstamp = icsProperty(ics, 'DTSTAMP')

        if (!uid) fail('the downloaded VEVENT carries no UID, so a re-import duplicates rather than updates')
        else pass(`the VEVENT carries a UID (${uid})`)
        if (!dtstamp) fail('the downloaded VEVENT carries no DTSTAMP, which RFC 5545 requires')
        else pass('the VEVENT carries a DTSTAMP')

        try {
          const startLocal = localWallClock(fromIcsUtc(dtstart), ZONE)
          const endLocal = localWallClock(fromIcsUtc(dtend), ZONE)
          if (startLocal !== EXPECTED_LOCAL_START) {
            fail(`the ICS start reads ${startLocal} in ${ZONE}, expected ${EXPECTED_LOCAL_START}`)
          } else {
            pass(`the ICS start converts back to ${startLocal} in ${ZONE}`)
          }
          if (endLocal !== EXPECTED_LOCAL_END) {
            fail(`the ICS end reads ${endLocal} in ${ZONE}, expected ${EXPECTED_LOCAL_END}`)
          } else {
            pass(`the ICS end converts back to ${endLocal} in ${ZONE}`)
          }
        } catch (error) {
          fail(`the ICS dates do not parse: ${error.message}`)
        }

        if (OUT) {
          mkdirSync(OUT, { recursive: true })
          writeFileSync(join(OUT, 'downloaded.ics'), ics)
        }
      }

      /* --------------------------------------- the Google Calendar link too */
      /*
       * THE MENU IS RE-OPENED FIRST. Downloading the ICS closes it, because the
       * component closes on any choice, so the first version of this check
       * looked for a menu item in a closed menu and reported the link missing.
       * The drive was wrong, not the product.
       */
      await page.getByRole('button', { name: /add to calendar/i }).first().click()
      await page.waitForTimeout(300)
      const google = page.getByRole('menuitem', { name: /Google Calendar/i })
      if ((await google.count()) === 0) {
        fail('the Add to calendar menu offers no Google Calendar link')
      } else {
        const href = await google.first().getAttribute('href')
        const dates = new URL(href).searchParams.get('dates') ?? ''
        const [gStart, gEnd] = dates.split('/')
        const ok =
          localWallClock(fromIcsUtc(gStart), ZONE) === EXPECTED_LOCAL_START &&
          localWallClock(fromIcsUtc(gEnd), ZONE) === EXPECTED_LOCAL_END
        if (ok) pass('the Google Calendar link carries the same two instants')
        else fail(`the Google Calendar link carries ${dates}, which is not the event`)
      }

      /* -------------------------------------------------- og:type, rendered */
      const ogType = await page
        .locator('meta[property="og:type"]')
        .first()
        .getAttribute('content')
        .catch(() => null)
      if (ogType === 'event') pass('the served HTML declares og:type = event')
      else fail(`the served HTML declares og:type = ${ogType ?? 'nothing'}, expected event`)

      await context.close()
    }

    /* ------------------------------------- the three states at three widths */
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        deviceScaleFactor: viewport.deviceScaleFactor,
      })
      const page = await context.newPage()

      /* NORMAL */
      await open(page, `/events/${normalSlug}`)
      await shoot(page, `normal-${viewport.name}`)

      if ((await page.getByRole('button', { name: /add to calendar/i }).count()) > 0) {
        pass(`${viewport.name} normal: Add to calendar is on the page`)
      } else {
        fail(`${viewport.name} normal: no Add to calendar control`)
      }

      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      if (/This event has ended|sold out/i.test(body)) {
        fail(`${viewport.name} normal: the page claims a state it is not in`)
      } else {
        pass(`${viewport.name} normal: no sold-out or ended claim`)
      }

      if (accessibilityAvailable) {
        const heading = page.getByRole('heading', { name: 'Accessibility', exact: true })
        if ((await heading.count()) === 0) {
          fail(`${viewport.name} normal: the accessibility section did not render for a filled event`)
        } else {
          const section = page.locator('section[aria-labelledby="accessibility-heading"]')
          const text = (await section.first().innerText()).replace(/\s+/g, ' ')
          const wants = ['Wheelchair accessible', 'Companion Card accepted', '03 9000 0000']
          const missing = wants.filter(w => !text.includes(w))
          const unwanted = ['Hearing loop', 'Auslan interpreted'].filter(w => text.includes(w))
          if (missing.length > 0) fail(`${viewport.name} normal: the access section omits ${missing.join(', ')}`)
          else pass(`${viewport.name} normal: the access section names every stated feature`)
          if (unwanted.length > 0) fail(`${viewport.name} normal: the access section shows unstated ${unwanted.join(', ')}`)
          else pass(`${viewport.name} normal: the access section shows nothing that was not stated`)
        }
      }

      if (await hasHorizontalOverflow(page)) fail(`${viewport.name} normal: horizontal overflow`)
      else pass(`${viewport.name} normal: no horizontal overflow`)

      /* SOLD OUT */
      await open(page, `/events/${soldOutSlug}`)
      await shoot(page, `soldout-${viewport.name}`)

      const soldBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      if (/sold out/i.test(soldBody)) pass(`${viewport.name} sold out: the page says so`)
      else fail(`${viewport.name} sold out: nothing on the page says the event is sold out`)

      /*
       * THE CTA IS THE POINT. A sold-out page that still offers a buy control is
       * the Law 5 dead end on the money path: the buyer clicks and the server
       * refuses. Every button and link is swept rather than one being named.
       */
      const buyish = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a'))
          .map(el => (el.textContent ?? '').trim())
          .filter(t => /^(buy|checkout|get tickets|book now|add to cart)/i.test(t)),
      )
      if (buyish.length > 0) fail(`${viewport.name} sold out: a buy control is still offered (${buyish.join(', ')})`)
      else pass(`${viewport.name} sold out: no buy control anywhere on the page`)

      if (accessibilityAvailable) {
        const heading = page.getByRole('heading', { name: 'Accessibility', exact: true })
        if ((await heading.count()) > 0) {
          fail(`${viewport.name} sold out: an empty accessibility section rendered`)
        } else {
          pass(`${viewport.name} sold out: no accessibility section, because nothing was stated`)
        }
      }

      if (await hasHorizontalOverflow(page)) fail(`${viewport.name} sold out: horizontal overflow`)
      else pass(`${viewport.name} sold out: no horizontal overflow`)

      /* PAST */
      await open(page, `/events/${pastSlug}`)
      await shoot(page, `past-${viewport.name}`)

      const pastBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      if (/This event has ended/i.test(pastBody)) pass(`${viewport.name} past: the ended banner is on the page`)
      else fail(`${viewport.name} past: no ended banner`)

      if ((await page.getByRole('button', { name: /add to calendar/i }).count()) === 0) {
        pass(`${viewport.name} past: no calendar link for a night that has been and gone`)
      } else {
        fail(`${viewport.name} past: still offering to put a finished event in a calendar`)
      }

      if (await hasHorizontalOverflow(page)) fail(`${viewport.name} past: horizontal overflow`)
      else pass(`${viewport.name} past: no horizontal overflow`)

      await context.close()
    }

    /* ---------------------- the venue page: alt text and the access section */
    /*
     * STEP 6 ("Add alt text to the venue image and the organiser logo, both of
     * which the audit found missing") and the VENUE half of step 4.
     *
     * The source read under step 1 found both alts already present, so this is
     * a VERIFICATION rather than a fix, and it is driven rather than asserted
     * from the source, because the audit's claim was about a rendered page and
     * a source read cannot settle a rendered page. Every content image on both
     * pages is swept, not only the two named: an alt the audit did not mention
     * going missing is the same defect.
     *
     * NO VENUE ON TEST CARRIES AN IMAGE, which is why the fixture sets one.
     * Without it the venue hero falls back to the branded gradient and the
     * assertion would pass by having nothing to judge.
     */
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })

        if (venueHandle && (await open(page, `/venues/${venueHandle}`))) {
          const bad = await page.evaluate(() =>
            Array.from(document.querySelectorAll('img'))
              .filter(img => {
                const r = img.getBoundingClientRect()
                if (r.width < 24 || r.height < 24) return false
                if (img.getAttribute('aria-hidden') === 'true') return false
                return (img.getAttribute('alt') ?? '').trim() === ''
              })
              .map(img => img.getAttribute('src')?.slice(0, 80) ?? '(no src)'),
          )
          if (bad.length > 0) fail(`${viewport.name} venue: ${bad.length} content image(s) with no alt: ${bad.join(', ')}`)
          else pass(`${viewport.name} venue: every content image carries alt text`)

          if (venueAccessibilityAvailable) {
            const heading = page.getByRole('heading', { name: 'Accessibility', exact: true })
            if ((await heading.count()) === 0) {
              fail(`${viewport.name} venue: the accessibility section did not render for a filled venue`)
            } else {
              const text = (
                await page.locator('section[aria-labelledby="accessibility-heading"]').first().innerText()
              ).replace(/\s+/g, ' ')
              if (!text.includes('Step-free entry') || !text.includes('Hearing loop')) {
                fail(`${viewport.name} venue: the access section omits a stated feature`)
              } else if (text.includes('Auslan interpreted')) {
                fail(`${viewport.name} venue: a per-performance service leaked onto a building`)
              } else {
                pass(`${viewport.name} venue: the access section names the venue features and only those`)
              }
            }
          }

          await shoot(page, `venue-${viewport.name}`)
          if (await hasHorizontalOverflow(page)) fail(`${viewport.name} venue: horizontal overflow`)
          else pass(`${viewport.name} venue: no horizontal overflow`)
        }

        if (organiserSlug && (await open(page, `/organisers/${organiserSlug}`))) {
          const bad = await page.evaluate(() =>
            Array.from(document.querySelectorAll('img'))
              .filter(img => {
                const r = img.getBoundingClientRect()
                if (r.width < 24 || r.height < 24) return false
                if (img.getAttribute('aria-hidden') === 'true') return false
                return (img.getAttribute('alt') ?? '').trim() === ''
              })
              .map(img => img.getAttribute('src')?.slice(0, 80) ?? '(no src)'),
          )
          if (bad.length > 0) fail(`${viewport.name} organiser: ${bad.length} content image(s) with no alt: ${bad.join(', ')}`)
          else pass(`${viewport.name} organiser: every content image carries alt text, logo included`)
        }
      }

      await context.close()
    }


    /* ---------------------------------------- the reversal condition, executed */
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()

      /*
       * THE SECTION IS FOUND BY ITS ELEMENT, NEVER BY THE WORD "Accessibility".
       *
       * The first version of this check read the page text for that word and
       * reported the reversal failing. The reversal was fine: the SITE FOOTER
       * carries an "Accessibility" link, on every page, so the word is present
       * whatever the flag says. An assertion that can never go green is as
       * useless as one that can never go red, and this one managed both at
       * once, passing ON for the wrong reason and failing OFF for the wrong
       * reason.
       */
      const accessSection = () => page.locator('section[aria-labelledby="accessibility-heading"]')

      // ON first, explicitly, so the OFF reading is a comparison rather than an
      // assumption about what a missing row resolves to.
      await setReversalFlag(true)
      if (await open(page, `/events/${normalSlug}`)) {
        if ((await accessSection().count()) > 0) pass('reversal ON: the access section is on the page')
        else fail('reversal ON: the access section is missing before the switch was even flipped')
      }

      await setReversalFlag(false)
      if (await open(page, `/events/${normalSlug}`)) {
        const off = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
        if ((await accessSection().count()) > 0) fail('reversal OFF: the access section is still rendering')
        else pass('reversal OFF: the access section is gone')

        if (/Only \d+ left/.test(off) || /Selling Fast|Almost Sold Out/i.test(off)) {
          fail('reversal OFF: an availability message is still rendering')
        } else {
          pass('reversal OFF: no availability or scarcity message anywhere on the page')
        }

        if ((await page.getByRole('button', { name: /add to calendar/i }).count()) > 0) {
          pass('reversal OFF: the calendar links are still there, which the close-out requires')
        } else {
          fail('reversal OFF: the calendar links went with it, and the close-out says they must not')
        }

        await shoot(page, 'reversal-off-desktop-1440')
      }

      await setReversalFlag(true)
      if (await open(page, `/events/${normalSlug}`)) {
        if ((await accessSection().count()) > 0) pass('reversal back ON: the access section returned')
        else fail('reversal back ON: the access section did not come back')
      }

      await context.close()
    }

  } finally {
    await browser.close()
  }
}

main()
  .catch(error => {
    fail(`the drive stopped: ${error.stack ?? error.message}`)
  })
  .finally(async () => {
    /*
     * THE FLAG ROW GOES BACK, and it is DELETED rather than set to true: there
     * was no row before this drive, and leaving one behind would turn a
     * fallback-to-default into an explicit row that nobody decided on.
     */
    if (flagRowWritten) {
      await db.from('feature_flags').delete().eq('flag', REVERSAL_FLAG)
      await deleteFlagCache()
      say(`removed the ${REVERSAL_FLAG} row, leaving the seeded default in charge`)
    }

    if (process.env.SEO5_KEEP === '1') {
      say(`KEPT ${created.length} lane-C fixture event(s) and ${createdVenues.length} venue(s) because SEO5_KEEP=1`)
    } else {
      for (const id of created) {
        await db.from('ticket_tiers').delete().eq('event_id', id)
        await db.from('events').delete().eq('id', id)
      }
      for (const id of createdVenues) await db.from('venues').delete().eq('id', id)
      say(`removed ${created.length} lane-C fixture event(s) and ${createdVenues.length} venue(s)`)
    }

    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(join(OUT, 'seo5-states-drive.txt'), log.join('\n') + '\n')
    }
    if (faults.length > 0) {
      console.error(`\n${TAG} ${faults.length} fault(s)`)
      process.exit(1)
    }
    console.log(`\n${TAG} every state, the calendar file and the access section behaved at all three widths`)
  })
