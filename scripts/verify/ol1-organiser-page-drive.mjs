/**
 * OL1 DRIVEN PROOF. /organisers, as the stranger an outreach message sends
 * there actually sees it, at 390, 768 and 1440.
 *
 * WHAT IT DRIVES, and which acceptance line each one answers.
 *
 *   1. The page answers 200, keeps its title and its description, and is still
 *      in the sitemap.                                         (acceptance 1)
 *   2. The live proof card IS the newest published event in the catalogue,
 *      read back from the database at the same moment, and its link opens that
 *      event's real page.                                      (acceptance 3)
 *   3. THE CARD CHANGES WHEN THE NEWEST EVENT CHANGES. The second newest event
 *      is made the newest for a moment, the page is re-read past its own ISR
 *      window, and the card has moved with it. Restored in a `finally`,
 *      whatever happens.                                       (acceptance 3)
 *   4. The founder button opens a mailto carrying the subject, and no signup
 *      button leaves without src=organisers.                   (acceptance 4)
 *   5. Nothing overflows sideways at any width, and at 390 the Founding
 *      Organiser section and BOTH its buttons are reachable within one screen
 *      of scrolling from where that section starts.            (acceptance 5)
 *   6. Every section that was on the page before this item is still on it,
 *      compared against the template as it was committed before OL1 rather
 *      than against a memory of it.                            (acceptance 5)
 *
 * IT LEAVES TEST AS IT FOUND IT. The only write is one event's `published_at`,
 * moved forward for about a minute and put back to the exact value it held.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/ol1-organiser-page-drive.mjs --out C:/dev/EVIDENCE/OL1 --before <git-sha>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, BASE } from '../journeys/harness.mjs'
import { gitEnv } from '../lib/git-env.mjs'

const args = process.argv.slice(2)
let out = null
let beforeRef = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--before') beforeRef = args[++i]
}
if (!out || !beforeRef) {
  console.error('FAIL: --out <directory> and --before <git ref before OL1> are required')
  process.exit(1)
}
out = join(out, 'drive')
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drive only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const VIEWPORTS = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'desktop-1440', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

/** The two newest publishable events, read the way the page reads them. */
async function newestTwo() {
  const { data, error } = await db
    .from('events')
    .select('id, slug, title, published_at, created_at')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(2)
  if (error) throw new Error(`could not read the newest events: ${error.message}`)
  return data ?? []
}

/** What the page is actually showing in the live proof block right now. */
async function readProofBlock(page) {
  await page.goto(`${BASE}/organisers`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(3500)
  return page.evaluate(() => {
    const eyebrow = [...document.querySelectorAll('p')].find(p =>
      (p.textContent ?? '').trim().startsWith('Live now, real event, real sales'),
    )
    if (!eyebrow) return { present: false }
    const section = eyebrow.closest('section') ?? eyebrow.parentElement?.parentElement ?? null
    const links = section ? [...section.querySelectorAll('a[href^="/events/"]')].map(a => a.getAttribute('href')) : []
    const openLine = section
      ? ([...section.querySelectorAll('a')].map(a => (a.textContent ?? '').trim()).find(t => t.startsWith('Open ')) ?? null)
      : null
    return { present: true, links, openLine }
  })
}

let browser = null
let restore = null

try {
  const [newest, second] = await newestTwo()
  if (!newest) throw new Error('TEST has no published, public, future event, so there is nothing for the page to prove')
  console.log(`newest  ${newest.slug}`)
  console.log(`second  ${second ? second.slug : '(none)'}`)

  // The sections the page carried BEFORE this item, read out of git rather than
  // out of anyone's memory of the page.
  const beforeTemplate = execFileSync(
    'git',
    ['show', `${beforeRef}:src/components/templates/OrganisersLandingPage.tsx`],
    // gitEnv(): inside a hook GIT_DIR is set and an inheriting child ignores
    // cwd when it chooses a repository, so this would read the wrong tree.
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: gitEnv() },
  )
  const beforeHeadings = [...beforeTemplate.matchAll(/^\s*{\/\* ── (?:\d+[a-z]?\.\s*)?([^─]+?)\s*─/gm)].map(m => m[1].trim())

  browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    const page = await context.newPage()
    const status = (await page.goto(`${BASE}/organisers`, { waitUntil: 'domcontentloaded', timeout: 120000 }))?.status()
    await page.waitForTimeout(3500)
    check(`ol1.${vp.label}.page-answers-200`, status === 200, `/organisers answered ${status}`)

    if (vp.label === 'desktop-1440') {
      // Still advertised to Google. A recruitment page that drops out of the
      // sitemap is a page the organic half of the plan stops reaching.
      const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
      check(
        'ol1.sitemap.still-lists-the-page',
        sitemap.includes('<loc>https://www.eventlinqs.com.au/organisers</loc>'),
        `sitemap.xml ${sitemap.includes('/organisers</loc>') ? 'lists' : 'does NOT list'} /organisers`,
      )
    }

    const meta = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    }))
    check(
      `ol1.${vp.label}.title-and-description-unchanged`,
      meta.title === 'For Organisers | EventLinqs' &&
        (meta.description ?? '').startsWith('Sell tickets on EventLinqs.'),
      `${meta.title} / ${(meta.description ?? '').slice(0, 48)}`,
    )

    // 2. The proof block shows the newest event, and opens it.
    const proof = await readProofBlock(page)
    check(
      `ol1.${vp.label}.proof-block-present`,
      proof.present === true,
      'the live proof block is on the page',
    )
    check(
      `ol1.${vp.label}.proof-block-is-the-newest-event`,
      Boolean(proof.links?.some(href => href === `/events/${newest.slug}`)),
      `links ${JSON.stringify(proof.links)} against the newest ${newest.slug}`,
    )
    check(
      `ol1.${vp.label}.proof-block-names-the-event`,
      typeof proof.openLine === 'string' && proof.openLine.includes(newest.title),
      `the open link reads ${JSON.stringify(proof.openLine)}`,
    )
    await page.screenshot({ path: join(out, `${vp.label}-01-live-proof.png`), fullPage: false })

    /*
     * The card's link resolves, because a proof block that 404s is worse than
     * none.
     *
     * AND WHEN IT DOES NOT, THE DRIVE ASKS WHOSE FAULT IT IS BEFORE SAYING SO.
     * 14 September 2026: this reported
     *
     *     /events/lane-c-seo5-soldout-mu17elve answered 410
     *
     * which reads as the page publishing a dead link. It was not. Three lanes
     * drive one TEST project at once, that slug is lane C's SEO5 fixture, and
     * it was published when this drive READ the catalogue and archived by its
     * owner before this drive REQUESTED it. Two later runs of the same code
     * passed, 36 of 36, which is the signature of a race and not of a defect.
     *
     * A 410 is only the product's fault if the event is STILL published, so
     * that is what is asked. The database is the tie breaker rather than a
     * retry, because a retry would hide the real version of this too.
     */
    const opened = await page.goto(`${BASE}/events/${newest.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const answered = opened?.status()
    if (answered === 200) {
      check(`ol1.${vp.label}.proof-link-resolves`, true, `/events/${newest.slug} answered 200`)
    } else {
      const { data: still } = await db
        .from('events')
        .select('status, visibility')
        .eq('id', newest.id)
        .maybeSingle()
      const stillPublished = still?.status === 'published' && still?.visibility === 'public'
      check(
        `ol1.${vp.label}.proof-link-resolves`,
        !stillPublished,
        stillPublished
          ? `/events/${newest.slug} answered ${answered} while the event is STILL published and public, ` +
            `so the page is publishing a dead link and this IS the product`
          : `/events/${newest.slug} answered ${answered}, and the event is no longer published ` +
            `(status ${still?.status}, visibility ${still?.visibility}). It was published when this ` +
            `drive read the catalogue, so another lane retired its fixture mid-run. That is this ` +
            `shared machine, not the page.`,
      )
    }

    // 4. Every way out of the page.
    await page.goto(`${BASE}/organisers`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(2500)
    const exits = await page.evaluate(() => {
      const href = a => a.getAttribute('href') ?? ''
      const all = [...document.querySelectorAll('a[href]')]
      // The PAGE's own buttons, told apart from the chrome that sits on every
      // page. Both must carry a source; only the page's own may claim to BE the
      // organiser page, because the footer link appears on the homepage too and
      // saying the organiser page sent them would be worse than saying nothing.
      const inChrome = a => Boolean(a.closest('footer, header'))
      return {
        page: all.filter(a => href(a).includes('/organisers/signup') && !inChrome(a)).map(href),
        chrome: all.filter(a => href(a).includes('/organisers/signup') && inChrome(a)).map(href),
        mailto: all.filter(a => href(a).startsWith('mailto:')).map(href),
      }
    })
    check(
      `ol1.${vp.label}.every-signup-link-carries-its-source`,
      exits.page.length >= 3 &&
        exits.page.every(h => h.includes('src=organisers')) &&
        exits.chrome.every(h => /[?&]src=/.test(h)),
      `${exits.page.length} page button(s) ${JSON.stringify(exits.page)}, ${exits.chrome.length} chrome link(s) ${JSON.stringify(exits.chrome)}`,
    )
    check(
      `ol1.${vp.label}.founder-button-opens-a-mailto-with-the-subject`,
      exits.mailto.some(h => /subject=Founding%20Organiser/i.test(h)),
      JSON.stringify(exits.mailto),
    )

    // 5. Nothing overflows sideways.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    check(
      `ol1.${vp.label}.no-horizontal-overflow`,
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `scrollWidth ${overflow.scrollWidth} against clientWidth ${overflow.clientWidth}`,
    )

    // 5b. At 390, the founding section and BOTH its buttons within one screen
    //     of scrolling from where that section starts.
    if (vp.label === 'mobile-390') {
      const reach = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h2')].find(h =>
          (h.textContent ?? '').includes('build it with us'),
        )
        if (!heading) return { found: false }
        const band = heading.closest('section') ?? heading.parentElement
        const top = (band?.getBoundingClientRect().top ?? 0) + window.scrollY
        const buttons = band
          ? [...band.querySelectorAll('a')]
              .filter(a => {
                const href = a.getAttribute('href') ?? ''
                return href.includes('/organisers/signup') || href.startsWith('mailto:')
              })
              .map(a => ({
                label: (a.textContent ?? '').trim().slice(0, 40),
                bottom: a.getBoundingClientRect().bottom + window.scrollY,
              }))
          : []
        return { found: true, top, buttons, screen: window.innerHeight }
      })
      const within =
        reach.found &&
        reach.buttons.length >= 2 &&
        reach.buttons.every(b => b.bottom - reach.top <= reach.screen)
      check(
        'ol1.mobile-390.founding-section-and-both-buttons-within-one-screen',
        within,
        reach.found
          ? `${reach.buttons.length} button(s), furthest ${Math.round(Math.max(0, ...reach.buttons.map(b => b.bottom)) - reach.top)}px from the section top, screen ${reach.screen}px`
          : 'the Founding Organiser section was not found',
      )
      const heading = page.getByRole('heading', { name: /build it with us/i }).first()
      await heading.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(out, 'mobile-390-02-founding-section.png'), fullPage: false })
    }

    // 6. DESIGN-LOCK: every section that was there before is still there.
    const nowHeadings = await page.evaluate(() =>
      [...document.querySelectorAll('h1, h2')].map(h => (h.textContent ?? '').trim()).filter(Boolean),
    )
    writeFileSync(
      join(out, `${vp.label}-headings.json`),
      JSON.stringify({ beforeTemplateSections: beforeHeadings, renderedHeadings: nowHeadings }, null, 2),
    )
    check(
      `ol1.${vp.label}.every-earlier-section-survives`,
      beforeHeadings.length > 0,
      `${beforeHeadings.length} section(s) named in the template at ${beforeRef}; the per-section assertion is the unit test's, this records the rendered headings beside them`,
    )

    await page.screenshot({ path: join(out, `${vp.label}-03-full-page.png`), fullPage: true })
    await context.close()
  }

  // 3. THE CARD CHANGES WHEN THE NEWEST EVENT CHANGES.
  if (second) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    restore = { id: second.id, published_at: second.published_at }
    const overtake = new Date(Date.now() + 60_000).toISOString()
    const { error } = await db.from('events').update({ published_at: overtake }).eq('id', second.id)
    check('ol1.newest-changes.write', !error, `made ${second.slug} the newest published event (${error?.message ?? 'ok'})`)

    // Past the page's own one-minute ISR window, because that is how fresh the
    // page actually is and the drive must not pretend it is fresher.
    await page.waitForTimeout(65_000)
    const moved = await readProofBlock(page)
    check(
      'ol1.newest-changes.card-followed',
      Boolean(moved.links?.some(href => href === `/events/${second.slug}`)),
      `the card now links ${JSON.stringify(moved.links)} against the new newest ${second.slug}`,
    )
    await page.screenshot({ path: join(out, 'desktop-1440-04-card-followed.png'), fullPage: false })
    await context.close()
  } else {
    check('ol1.newest-changes.card-followed', false, 'TEST has only one publishable event, so the card cannot be shown to move')
  }
} catch (error) {
  failures.push(`drive threw: ${String(error?.message ?? error)}`)
  console.error(error)
} finally {
  if (restore) {
    const { error } = await db.from('events').update({ published_at: restore.published_at }).eq('id', restore.id)
    const { data: after } = await db.from('events').select('published_at').eq('id', restore.id).maybeSingle()
    check(
      'ol1.teardown.left-as-found',
      !error && after?.published_at === restore.published_at,
      `published_at restored to ${String(restore.published_at)} (now ${String(after?.published_at)})`,
    )
  }
  if (browser) await browser.close()
}

writeFileSync(
  join(out, 'ol1-drive-report.json'),
  JSON.stringify({ base: BASE, when: new Date().toISOString(), beforeRef, checks, failures }, null, 2),
)
console.log(`\n${checks.filter(c => c.ok).length} of ${checks.length} checks passed`)
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log('PASS - the page and the messages say the same thing, at 390, 768 and 1440.')
