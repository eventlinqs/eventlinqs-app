/**
 * THE DRIVEN HALF OF THE `sizes` CONTRACT (close-out C8B.3, 18 September 2026).
 *
 * ============================================================================
 * WHY A DRIVE AND NOT ONLY A GUARD
 * ============================================================================
 *
 * `scripts/guards/image-hints-match-the-cell.mjs` proves that a RAIL hint is
 * derived from its cell, which is decidable from source. It says in its own
 * header what it cannot do: a GRID's rendered width comes from the column count,
 * the gaps, the page padding and the container cap, resolved by a browser at a
 * viewport. Deriving that statically would mean reimplementing CSS inside a
 * guard and then trusting the reimplementation.
 *
 * So this drives a real browser and asks the only question that matters:
 *
 *     for every image on the page, is the candidate the browser CHOSE at least
 *     as wide as the slot the image LANDED in?
 *
 * ============================================================================
 * WHY UNDER-FETCH IS THE FAILURE AND OVER-FETCH IS A COST
 * ============================================================================
 *
 * They are not symmetric and treating them as one "accuracy" number hides the
 * difference. A hint larger than the slot costs bytes, which is measured and
 * reported. A hint SMALLER than the slot renders a soft, blurry tile on any 2x
 * screen, which the premium bar forbids, and it is invisible to every static
 * check because the markup is perfectly well formed.
 *
 * It was also live. Before this item, the city tiles on the homepage and on
 * /cities asked for 288px for a slot that renders at 338 and fetched 640px where
 * 644 were needed (`C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`).
 *
 * THE ONE EXEMPTION IS NAMED, NOT TOLERATED. `MEDIA_SIZES.fullBleed` asks for
 * 75vw on mobile deliberately: the hero is a photographic backdrop under a 40 to
 * 80 percent navy scrim, so a smaller source is visually identical and the hero
 * owns the LCP. That decision is written in `src/components/media/sizes.ts` and
 * is exempted here BY ITS LITERAL, so a second under-fetch cannot hide behind
 * it and widening a tolerance cannot excuse one.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * - Whether any of this reaches the Lighthouse score. Almost every image here is
 *   lazy and below the fold, so it is not on the paint path: what it costs is
 *   bytes and radio time on a phone at a venue. Read the score off
 *   `scripts/perf/lh-local-median.mjs`, never off this.
 * - An image that never scrolls into view. A horizontal rail holds more cards
 *   than a viewport shows, and this scrolls the PAGE, not each rail. The report
 *   prints how many of the images in the DOM were judged so the coverage is a
 *   number rather than an impression.
 *
 * ============================================================================
 * THE DEFAULT ROUTE LIST, AND THE TWO ROUTES DELIBERATELY NOT IN IT
 * ============================================================================
 *
 * The default was `/`, `/events`, `/cities`, `/communities`: the three routes the
 * C8B.1 cost table named, plus the community index.
 *
 * `/organisers`, `/about` and `/waitlist` JOINED THAT LIST on 19 September 2026,
 * and the reason is worth keeping because it is the whole lesson of this file.
 * They were left out, so nothing measured them, so they shipped bands that were
 * under-fetched at every desktop width while every gate stayed green:
 *
 *     /organisers 1280   a 1214px band needed 2428, the browser chose 1920  x0.79
 *     /organisers 1440   a 1334px band needed 2668, the browser chose 1920  x0.72
 *     /about      1920   a 1920px band needed 3840, the browser chose 1920  x0.50
 *
 * `MarketingMedia` now carries one variant per band layout and all three pass.
 * A route list is only a default until somebody forgets to extend it, so
 * `scripts/guards/marketing-bands-are-supplyable.mjs` walks the import graph and
 * FAILS THE BUILD if a page renders a marketing band on a route that is not in
 * the list below. Forgetting is no longer possible quietly.
 *
 * THE HALF THIS DRIVE STILL CANNOT SEE, and it is named here rather than in a
 * closed session: it compares the width the browser REQUESTED with the slot, and
 * never opens the bytes that came back. Two bands are still soft because the
 * licensed raster caps at 1920 (`ROLE_WIDTH.hero`), which no hint can raise.
 * That guard's clause 3 holds it; this drive would report PASS over it.
 *
 *   node --env-file=.env.local scripts/verify/image-hint-fidelity-drive.mjs --serve --port=3200
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { readLadder } from '../guards/lib/candidate-ladder.mjs'

const TAG = '[image-hint-fidelity-drive]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const NO_AUTHED = args.includes('--no-authed')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
let BASE = (args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '')
const OUT = args.find(a => a.startsWith('--out='))?.slice('--out='.length) ?? 'C:/dev/EVIDENCE/C8B3-HINTS/driven'
const DPR = 2

/** Every viewport the contract is claimed at, including both sides of each breakpoint. */
const WIDTHS = [360, 390, 430, 640, 768, 1024, 1280, 1440, 1920]
/** The three the screenshots are taken at. */
const SHOT_WIDTHS = [390, 768, 1440]

/**
 * The hero hint is the ONE deliberate under-fetch on the platform, exempted by
 * its literal rather than by a tolerance. If this string stops matching what
 * sizes.ts declares, the exemption stops applying and the drive goes red, which
 * is the correct direction to fail in.
 */
const DELIBERATE_UNDERFETCH = '(max-width: 768px) 75vw, 1920px'

const rawPaths = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
const paths = (rawPaths.length ? rawPaths : ['home', 'events', 'cities', 'communities', 'organisers', 'about', 'waitlist']).map(p => {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
    console.error(
      `${TAG} REFUSING: --path=${p} arrived with a leading slash or a drive letter.\n` +
        '             MSYS rewrites a leading slash before this process starts, and a harness that\n' +
        '             silently measures the wrong route is worse than one that stops.',
    )
    process.exit(1)
  }
  return p === 'home' ? '/' : `/${p}`
})

/**
 * ============================================================================
 * THE AUTHED ROUTES, ADDED 19 SEPTEMBER 2026, AND WHY THEY ARE HERE AT ALL
 * ============================================================================
 *
 * This drive signed in to NOTHING until today, and one hint on the platform was
 * left uncorrected for exactly that reason. `MEDIA_SIZES.featureTile` claimed
 * `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px`, which describes a
 * three-up grid inside a public container. Its ONE call site is the invitation
 * card on the organiser Launch Kit, which is a HALF of the 1400px dashboard
 * column beside a sidebar, so the claim was wrong in both directions at once and
 * nothing could see it: the guard cannot resolve a grid, and the drive could not
 * reach the page.
 *
 * Correcting a hint nobody can measure would have been claiming a number, so the
 * previous session refused to touch it and wrote the refusal into
 * C:\dev\REVIEW-QUEUE-B.md. This is that hole closed rather than argued away.
 *
 * The list is in Next.js dynamic-segment form because that is the form
 * `scripts/guards/marketing-bands-are-supplyable.mjs` derives from the app
 * directory, so the guard can require that a page rendering a marketing TILE
 * appears here, exactly as it already requires it of a page rendering a BAND.
 * The concrete id is resolved from the row this drive creates, never guessed.
 */
const AUTHED_PATHS = ['/dashboard/events/[id]/launch-kit']

/**
 * Only TEST is ever written to. Production is a different project ref and the
 * drive stops rather than discovering that from a row.
 *
 * IT IS CALLED `TEST_REF` RATHER THAN ANYTHING MORE DESCRIPTIVE, on purpose.
 * `scripts/guards/no-unguarded-production-write.mjs` recognises three guarded
 * shapes, and the one this file uses is a ref token within five lines of a
 * refusal. It spells the recognised tokens out, `TEST_REF` among them, and the
 * first draft here named the constant `TEST_PROJECT_REF` forty lines above the
 * throw. The guard was right to refuse: a reader of the check site could not see
 * which project it admitted. The preflight is NOT used instead because it
 * refuses outright when it cannot resolve a project, and a public-only
 * `--no-authed` run against a preview legitimately has no Supabase at all.
 */
const TEST_REF = 'vkapkibzokmfaxqogypq'

/**
 * A lane-B organiser with one published event, signed in through the real login
 * form, so the Launch Kit renders the way its organiser sees it.
 *
 * WHAT IS BORROWED AND WHAT IS MADE. The cover photograph is an existing
 * published event's, read from the database: an invented URL would render the
 * branded placeholder and this drive would then measure a gradient instead of a
 * photograph. Everything else is made here and deleted in `release`.
 *
 * THE EVENT IS UNLISTED AND THE ORGANISATION IS PENDING, which is not caution
 * for its own sake. An active organisation publishes /organisers/<slug> into
 * src/app/sitemap.ts and a public event publishes /events/<slug>; three lanes
 * share this TEST database and the sitemap holds its snapshot for 300 seconds,
 * so a fixture that is visible for the minutes it lives leaves another lane's
 * gate reading URLs that 404. That refused lane A's push on 14 September 2026.
 */
async function buildAuthedFixture(browser) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl.includes(TEST_REF)) {
    throw new Error(
      `the authed routes only ever touch TEST ${TEST_REF}, and NEXT_PUBLIC_SUPABASE_URL is ${supabaseUrl || '(empty)'}`,
    )
  }
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not in the environment, so no fixture can be made')

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const stamp = `${Date.now().toString(36)}`
  const email = `lane-b-hints-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const made = { userId: null, organisationId: null, eventId: null }

  const release = async () => {
    if (made.eventId) {
      await db.from('ticket_tiers').delete().eq('event_id', made.eventId)
      await db.from('events').delete().eq('id', made.eventId)
    }
    if (made.organisationId) await db.from('organisations').delete().eq('id', made.organisationId)
    if (made.userId) await db.auth.admin.deleteUser(made.userId)
  }

  try {
    const { data: city } = await db.from('cities').select('slug').eq('is_active', true).order('display_order').limit(1).single()
    const { data: category } = await db.from('event_categories').select('id').eq('is_active', true).order('sort_order').limit(1).single()
    const { data: cover } = await db
      .from('events')
      .select('cover_image_url')
      .eq('status', 'published')
      .not('cover_image_url', 'is', null)
      .limit(1)
      .single()
    if (!cover?.cover_image_url) throw new Error('no published event carries a cover photograph to borrow')

    const owner = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (owner.error) throw new Error(`create organiser: ${owner.error.message}`)
    made.userId = owner.data.user.id
    await db.from('profiles').upsert({ id: made.userId, email, full_name: 'Lane B hint fidelity' })

    const org = await db
      .from('organisations')
      .insert({ name: `Lane B hints ${stamp}`, slug: `lane-b-hints-${stamp}`, owner_id: made.userId, status: 'pending' })
      .select('id')
      .single()
    if (org.error) throw new Error(`create organisation: ${org.error.message}`)
    made.organisationId = org.data.id

    const start = new Date(Date.now() + 30 * 86_400_000)
    const event = await db
      .from('events')
      .insert({
        title: `Lane B hint fidelity night ${stamp}`,
        slug: `lane-b-hints-night-${stamp}`,
        organisation_id: made.organisationId,
        created_by: made.userId,
        category_id: category.id,
        status: 'published',
        visibility: 'unlisted',
        published_at: new Date().toISOString(),
        start_date: start.toISOString(),
        end_date: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
        timezone: 'Australia/Melbourne',
        city_primary: city.slug,
        venue_name: 'Lane B hint room',
        venue_city: city.slug,
        venue_postal_code: '3220',
        cover_image_url: cover.cover_image_url,
        summary: 'An event created by the image-hint fidelity drive so the Launch Kit can be measured. It is deleted when the drive ends.',
      })
      .select('id')
      .single()
    if (event.error) throw new Error(`create event: ${event.error.message}`)
    made.eventId = event.data.id

    const tier = await db
      .from('ticket_tiers')
      .insert({ event_id: made.eventId, name: 'Free entry', price: 0, currency: 'AUD', total_capacity: 200, is_active: true })
    if (tier.error) throw new Error(`create tier: ${tier.error.message}`)

    /*
     * THE SESSION, THROUGH THE REAL LOGIN FORM, because a hand-built cookie
     * proves the page renders for a cookie rather than for an organiser.
     *
     * IT IS RETRIED, AND THE REFUSAL IS READ OFF THE SCREEN, for a reason this
     * drive was taught the hard way on its first afternoon: the second run in a
     * row timed out at the form with nothing in the server log, because login
     * runs CLIENT-side against Supabase GoTrue and GoTrue keeps its own per-IP
     * limit that the server never sees (the same fault
     * scripts/verify/lib/proof-session.mjs was written for). A bare
     * "Timeout 120000ms exceeded" is indistinguishable from a broken selector,
     * and this branch has already been fooled three times in two days by a
     * harness fault wearing a product fault's clothes. So the message says which
     * one it was.
     */
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    let signedIn = false
    let lastRefusal = 'no attempt was made'
    for (let attempt = 1; attempt <= 3 && !signedIn; attempt += 1) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      await page.getByLabel(/email/i).first().fill(email)
      await page.getByLabel(/password/i).first().fill(password)
      await page.getByRole('button', { name: /sign in|log in/i }).first().click()
      /*
       * POLLED, NOT `waitForURL`. Sign-in ends in a client-side router push, a
       * SAME-DOCUMENT navigation, and `waitForURL` waits for `load` by default,
       * which such a navigation never fires. The first draft used it and timed
       * out at 120 seconds on a page that had in fact reached /dashboard, and a
       * probe of the identical form landed on /dashboard in under 15 seconds.
       * That was the fourth time in three days a harness in this branch accused
       * a working product, so the wait now asks the only question it means:
       * where is the browser.
       */
      const deadline = Date.now() + 45_000
      while (Date.now() < deadline && !signedIn) {
        await page.waitForTimeout(500)
        if (!new URL(page.url()).pathname.startsWith('/login')) signedIn = true
      }
      if (!signedIn) {
        const onScreen = await page
          .locator('[role="alert"], [aria-live], .text-red-600, .text-error')
          .allTextContents()
          .catch(() => [])
        const said = onScreen.map(s => s.trim()).filter(Boolean).join(' // ')
        lastRefusal =
          `attempt ${attempt} stayed on ${new URL(page.url()).pathname}` +
          (said ? `, and the form said: ${said}` : ', and the form said nothing at all, which is the shape a GoTrue per-IP limit takes')
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 20_000))
      }
    }
    if (!signedIn) {
      await context.close()
      throw new Error(`the login form never left /login after 3 attempts. ${lastRefusal}`)
    }
    const storageState = await context.storageState()
    await context.close()

    return {
      release,
      targets: AUTHED_PATHS.map(template => ({
        path: template,
        url: BASE + template.replace('[id]', made.eventId),
        storageState,
      })),
    }
  } catch (err) {
    await release()
    throw err
  }
}

/**
 * The configured ladder, read from next.config.ts by the same reader the guard
 * uses. Not retyped here: a drive with its own copy of the list would agree with
 * itself about a number neither of them holds.
 */
const ladderConfig = readLadder(readFileSync('next.config.ts', 'utf8'))
if (ladderConfig === null) {
  console.error(`${TAG} REFUSING: deviceSizes and imageSizes could not be read out of next.config.ts.`)
  process.exit(1)
}
const LADDER = ladderConfig.ladder

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
}

const PROBE = () => {
  const widthOf = url => {
    const m = /[?&]w=(\d+)/.exec(url ?? '')
    return m ? Number(m[1]) : null
  }
  return [...document.querySelectorAll('img')].map(img => {
    const r = img.getBoundingClientRect()
    const section = img.closest('section, [aria-label]')
    return {
      sizes: img.getAttribute('sizes'),
      slotWidth: Math.round(r.width),
      chosenWidth: widthOf(img.currentSrc),
      /* The URL the browser actually fetched, recorded so the OTHER half of the
         claim can be taken from the same run: this drive judges the width that
         was REQUESTED, and only opening those bytes says what arrived. Two
         marketing bands pass clause 1 and are still soft for exactly that
         reason (marketing-bands-are-supplyable.mjs, clause 3). */
      currentSrc: img.currentSrc || null,
      decoded: img.naturalWidth > 0,
      heading:
        section?.getAttribute('aria-label') ??
        section?.querySelector('h1, h2, h3')?.textContent?.trim().slice(0, 48) ??
        null,
    }
  })
}

/**
 * Every distinct `w=` a candidate list OFFERS, as opposed to the one the browser
 * CHOSE. Clause 1 judges the choice; this judges the bill: an offered width no
 * slot can select is still ~230 bytes of document, once per image.
 */
const OFFERED = () => {
  const widths = new Set()
  for (const img of document.querySelectorAll('img')) {
    for (const m of (img.getAttribute('srcset') ?? '').matchAll(/[?&]w=(\d+)/g)) {
      widths.add(Number(m[1]))
    }
  }
  return [...widths].sort((a, b) => a - b)
}

const BYTES = () =>
  performance
    .getEntriesByType('resource')
    .filter(e => e.initiatorType === 'img' || /\/_next\/image/.test(e.name))
    .reduce((a, e) => ({ n: a.n + 1, bytes: a.bytes + (e.encodedBodySize || 0) }), { n: 0, bytes: 0 })

async function revealEverything(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 200))
  })
  await page.waitForLoadState('networkidle').catch(() => {})
}

let stopServer = null
const report = { takenAt: new Date().toISOString(), dpr: DPR, routes: [] }

try {
  if (SERVE) {
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/image-hint-drive-server.log', { port: PORT })
    if (started.error) {
      console.error(`${TAG} could not serve the build: ${started.error}`)
      process.exit(1)
    }
    BASE = started.base
    stopServer = started.stop
    console.log(`${TAG} serving the production build on ${BASE}`)
  }
  report.base = BASE
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch()
  let releaseFixture = null
  try {
    const targets = paths.map(path => ({ path, url: BASE + path, storageState: null }))

    /*
     * A public-only run is a legitimate thing to want (against a preview, for
     * instance, where there is no service role key and no TEST database). It is
     * not a legitimate thing to get by accident, because "nothing looked" is the
     * fault this whole file exists to end. So it is opted into by name and the
     * absence of a fixture is a FAILED check rather than a quiet shorter run.
     */
    if (NO_AUTHED) {
      console.log(`${TAG} --no-authed: the ${AUTHED_PATHS.length} authed route(s) are NOT measured in this run.`)
    } else {
      try {
        const authed = await buildAuthedFixture(browser)
        releaseFixture = authed.release
        targets.push(...authed.targets)
        record(
          `the ${AUTHED_PATHS.length} authed route(s) have a signed-in organiser to be measured as`,
          true,
          `${AUTHED_PATHS.join(', ')} resolved against a lane-B fixture on TEST`,
        )
      } catch (err) {
        record(
          `the ${AUTHED_PATHS.length} authed route(s) have a signed-in organiser to be measured as`,
          false,
          `${err.message}. Pass --no-authed to declare a public-only run; a run that cannot sign in must not read as a full sweep.`,
        )
      }
    }

    for (const target of targets) {
      const { path, url, storageState } = target
      if (!storageState) {
        const head = await fetch(url, { headers: { 'user-agent': 'eventlinqs-image-hint-drive' } })
        if (!head.ok) {
          record(`${path} is served`, false, `answered ${head.status}; nothing on it can be judged`)
          continue
        }
      }

      const route = { path, widths: [] }
      const under = []
      const offered = new Set()
      let judgedTotal = 0
      let inDomTotal = 0
      let worst = { ratio: Infinity }
      /* The image asking the ORIGIN for the most pixels on this route. It is a
         different question from the tightest ratio and it is the one that
         decides whether the raster behind the slot can supply it at all. */
      let widestNeed = { need: -1 }

      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 1000 },
          deviceScaleFactor: DPR,
          ...(storageState ? { storageState } : {}),
        })
        const page = await context.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        /* A session that expired mid-run lands on /login, whose images are not
           this route's images. Measuring them would report a comfortable PASS
           about a page nobody asked for. */
        if (storageState && new URL(page.url()).pathname.startsWith('/login')) {
          record(`${path} is reached signed in at ${width}`, false, `landed on ${new URL(page.url()).pathname}`)
          await context.close()
          continue
        }
        await revealEverything(page)
        const images = await page.evaluate(PROBE)
        const bytes = await page.evaluate(BYTES)
        for (const w of await page.evaluate(OFFERED)) offered.add(w)

        const judged = images.filter(i => i.decoded && i.chosenWidth && i.slotWidth > 0)
        judgedTotal += judged.length
        inDomTotal += images.length

        for (const i of judged) {
          const need = Math.round(i.slotWidth * DPR)
          const ratio = i.chosenWidth / need
          if (i.sizes === DELIBERATE_UNDERFETCH) continue
          if (ratio < 1) {
            under.push({ width, ...i, need, ratio: Number(ratio.toFixed(3)) })
          }
          if (ratio < worst.ratio) {
            worst = { ratio, width, sizes: i.sizes, slot: i.slotWidth, need, chose: i.chosenWidth, heading: i.heading, currentSrc: i.currentSrc }
          }
          if (need > widestNeed.need) {
            widestNeed = { ratio, width, sizes: i.sizes, slot: i.slotWidth, need, chose: i.chosenWidth, heading: i.heading, currentSrc: i.currentSrc }
          }
        }

        route.widths.push({
          viewport: width,
          imagesInDom: images.length,
          judged: judged.length,
          imageRequests: bytes.n,
          imageBytes: bytes.bytes,
        })

        if (SHOT_WIDTHS.includes(width)) {
          const rendered = await page.evaluate(() => ({
            header: Boolean(document.querySelector('header')),
            painted: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length,
            links: document.querySelectorAll('a[href^="/"]').length,
          }))
          record(
            `clause 2: ${path} renders at ${width}`,
            rendered.header && rendered.painted > 0 && rendered.links > 0,
            `header ${rendered.header}; ${rendered.painted} images decoded; ${rendered.links} internal links`,
          )
          await page.screenshot({
            path: join(OUT, `${(path === '/' ? 'home' : path.slice(1)).replace(/[^a-z0-9]+/gi, '-')}-${width}.png`),
            fullPage: false,
          })
        }

        await context.close()
      }

      record(
        `clause 1: no image on ${path} is fetched SMALLER than its slot, at any of ${WIDTHS.length} viewports`,
        under.length === 0,
        under.length === 0
          ? `${judgedTotal} of ${inDomTotal} images judged; tightest margin x${worst.ratio === Infinity ? 'n/a' : worst.ratio.toFixed(2)}` +
            (worst.sizes ? ` (${worst.slot}px slot needing ${worst.need}, chose ${worst.chose}, ${worst.heading ?? 'unnamed'})` : '')
          : /*
             * THE COUNT LEADS, AND THE TRUNCATION SAYS SO. This printed six
             * lines and nothing else, so a run with seven under-fetches read as
             * a run with six, and the one it dropped was the WORST: the launch
             * kit tile at 1920, x0.50, sat in report.json while the console
             * showed x0.59 as the floor. A summary that quietly contradicts the
             * record underneath it is worse than no summary.
             */
            `${under.length} under-fetch(es), worst x${Math.min(...under.map(u => u.ratio)).toFixed(3)}` +
            (under.length > 6 ? `, first 6 shown, all of them in report.json` : '') +
            '\n        ' +
            under
              .slice(0, 6)
              .map(u => `${u.width}: a ${u.slotWidth}px slot needs ${u.need} and the browser chose ${u.chosenWidth} (x${u.ratio}) - ${u.heading ?? 'unnamed'}, sizes=${u.sizes}`)
              .join('\n        '),
      )

      /*
       * CLAUSE 3, added 19 September 2026 with the width ladder.
       * `scripts/guards/candidate-ladder-has-no-dead-rung.mjs` proves from SOURCE
       * that every configured width is one some declared slot can select. This
       * proves the other end of the same claim, from the bytes a browser was
       * actually served: nothing is offered that the ladder no longer carries.
       * The guard can be right about a config the build does not use; this
       * cannot.
       */
      const offLadder = [...offered].filter(w => !LADDER.includes(w))
      record(
        `clause 3: every width offered on ${path} is on the configured ladder`,
        offLadder.length === 0,
        offLadder.length === 0
          ? `${offered.size} distinct widths offered across ${WIDTHS.length} viewports, ` +
            `smallest ${Math.min(...offered)}, largest ${Math.max(...offered)}`
          : `offered and not on the ladder: ${offLadder.join(', ')}. The served build and ` +
            'next.config.ts disagree, so the guard is judging a config this build did not use.',
      )
      route.offeredWidths = [...offered]

      route.judged = judgedTotal
      route.imagesInDom = inDomTotal
      route.underfetched = under
      /* The tightest image on the route, with the URL it fetched, so the
         delivered pixels can be decoded from the report rather than from a
         second run that would have to rebuild the fixture. */
      route.tightest = worst.ratio === Infinity ? null : worst
      route.widestNeed = widestNeed.need < 0 ? null : widestNeed
      report.routes.push(route)
    }
  } finally {
    /* TEST is left as it was found, and the deletion is reported rather than
       assumed: a fixture that survives a crashed run is another lane's puzzle. */
    if (releaseFixture) {
      try {
        await releaseFixture()
        console.log(`${TAG} the lane-B fixture was deleted from TEST`)
      } catch (err) {
        console.error(`${TAG} THE FIXTURE WAS NOT DELETED: ${err.message}`)
      }
    }
    await browser.close()
  }
} finally {
  if (stopServer) stopServer()
}

/* Clause 3: the byte cost, reported rather than asserted. There is no
   threshold here on purpose: the number is compared to the SAME number taken
   before the change, and a threshold invented now would be a number nobody
   measured. */
console.log('')
console.log(`${TAG} image bytes from the optimiser, per route per viewport:`)
for (const r of report.routes) {
  const row = r.widths.map(w => `${w.viewport}:${Math.round(w.imageBytes / 1024)}K`).join('  ')
  console.log(`  ${r.path.padEnd(14)} ${row}`)
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))

const failed = results.filter(r => !r.ok)
console.log('')
console.log(`${TAG} ${results.length - failed.length} of ${results.length} checks passed; evidence in ${OUT}`)
if (failed.length) process.exit(1)
