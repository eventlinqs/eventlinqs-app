/**
 * THE STANDING PARITY REVIEW, RUN AGAINST PRODUCTION.
 *
 * Close-out PARITY1. The judging is pure and lives in
 * `scripts/lib/parity-spec.mjs`; this file is the half that touches the world.
 *
 * ============================================================================
 * WHY IT DRIVES A BROWSER RATHER THAN FETCHING HTML
 * ============================================================================
 *
 * Three of the fifteen lines cannot be seen in the served bytes at all. "Add to
 * calendar" is a client component, so the streamed payload carries a lazy
 * reference and not the words; this was established the hard way on 14
 * September, when a plain fetch of an event page carrying the control reported
 * it missing. Alt text has to be judged on the images that actually LAY OUT,
 * because a one-pixel tracking image is not a content image. And the
 * accessibility section only exists once the page has rendered.
 *
 * So every page is opened in a real browser, exactly as a person opens it. That
 * is also the only reading of "the check runs against production, not against a
 * local build, because the defects found on 13 September were all visible only
 * in what production actually served" that means anything.
 *
 * ============================================================================
 * IT IS READ ONLY, AND IT SAYS SO IN CODE
 * ============================================================================
 *
 * Production is the founder's. This script performs GET requests and nothing
 * else: it signs in to nothing, submits nothing, and buys nothing. There is no
 * credential in it, because an anonymous visitor is the exact viewer whose
 * experience the parity list describes.
 *
 * Usage:
 *   node scripts/ops/parity-check.mjs [--site https://...] [--json out.json]
 *                                     [--write-queue] [--dry-run]
 *
 * Exit codes:
 *   0  the check ran (whatever it found; a failing line is a finding, not a
 *      crash, and the report is the deliverable)
 *   2  the check could not run at all
 */
import { chromium } from 'playwright'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeParity, parityHeadline, renderParityReport } from '../lib/parity-spec.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[parity]'

const argv = process.argv.slice(2)
const argOf = name => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}

const SITE = (argOf('--site') || process.env.PARITY_SITE || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const JSON_OUT = argOf('--json')
/*
 * THE SNAPSHOT, DUMPED AND RE-READ.
 *
 * Opening two dozen production pages in a browser costs about two minutes, and
 * every correction to a check's WORDING would otherwise pay that again. With
 * `--snapshot-out` the observation is kept; with `--snapshot-in` the judging
 * runs against a kept one. It is also the evidence: a report that says a page
 * carried no alt text is worth more beside the snapshot that says so.
 *
 * A snapshot is never a substitute for a real run. The state file and the queue
 * report are only written by a run that actually looked.
 */
const SNAPSHOT_OUT = argOf('--snapshot-out')
const SNAPSHOT_IN = argOf('--snapshot-in')
const WRITE_QUEUE = argv.includes('--write-queue')
const DRY_RUN = argv.includes('--dry-run')

/**
 * WHERE THE RESULT GOES SO THE DIGEST CAN CARRY ONE LINE OF IT.
 *
 * PARITY1 step 4: "One line in the owner digest: parity checks passed, parity
 * checks failed, and the worst failure." The digest is
 * `scripts/ops/state-report.mjs` and runs on its own schedule, so the two
 * cannot pass a value in memory. A small JSON file is the handoff, in the same
 * place the stall band's state file lives, and the digest treats an old or
 * missing one as "no parity run yet" rather than as good news.
 */
export const PARITY_STATE_FILE = join(ROOT, '.parity', 'last-run.json')

/**
 * The lane file the report is appended to.
 *
 * It lives OUTSIDE the repository, which is deliberate and is also why this is
 * behind a flag: a scheduled run on a machine that has no `C:\\dev` must not
 * fail for it. When the file is not there the report is printed and the JSON is
 * still written, so nothing is lost.
 */
const QUEUE_FILE = process.env.PARITY_QUEUE_FILE || join(ROOT, '..', '..', 'REVIEW-QUEUE-C.md')

const say = m => console.log(`${TAG} ${m}`)

/**
 * THE REVERSAL CONDITION, WHICH IS A SWITCH ON THE JOB AND NEVER ON THE LIST.
 *
 * PARITY1: "The job can be disabled by configuration but the specification
 * cannot be deleted, because the specification is the record of what the
 * platform has promised itself."
 *
 * So the switch lives HERE, on the run, and not in `scripts/lib/parity-spec.mjs`,
 * which holds the promises. Setting `PARITY_CHECK_DISABLED=1` stops the check
 * from running and says so in one line; the specification is still in version
 * control, still guarded by `scripts/guards/parity-spec-complete.mjs`, and still
 * the thing anybody can read to learn what this platform said it would do.
 *
 * An environment variable rather than a flag in the file, because the whole
 * point of a reversal is that it takes effect without a deploy.
 */
export function checkIsDisabled(env = process.env) {
  const raw = (env.PARITY_CHECK_DISABLED ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/* ---------------------------------------------------------------- the probes */

/**
 * The routes probed with a plain request rather than a browser.
 *
 * A probe answers a question of the form "does this exist", where rendering it
 * would tell us nothing extra. The wallet-pass paths are the ones that decide
 * line 5, and they are written out rather than guessed at: each is a shape a
 * ticketing platform serves a pass from, and all of them answering 404 is the
 * finding.
 */
const WALLET_PROBES = ['/api/tickets/pass.pkpass', '/api/wallet/pass', '/tickets/wallet']

/* ------------------------------------------------------------- the snapshot */

async function readPage(context, url) {
  const page = await context.newPage()
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 60000 })
    // Hydration: the client components mount after the server payload lands, and
    // three of the fifteen lines are about things only a hydrated page has.
    await page.waitForTimeout(2000)

    const status = response?.status() ?? 0
    const data = await page.evaluate(() => {
      const meta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => {
          try {
            return JSON.parse(s.textContent ?? '')
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .flatMap(b => (Array.isArray(b) ? b : [b]))
      const images = Array.from(document.querySelectorAll('img')).map(img => {
        const r = img.getBoundingClientRect()
        return {
          src: img.getAttribute('src') ?? '',
          alt: img.getAttribute('alt'),
          width: Math.round(r.width),
          height: Math.round(r.height),
          ariaHidden: img.getAttribute('aria-hidden') === 'true',
        }
      })
      return {
        title: document.title || null,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        metaRobots: meta('robots'),
        h1s: Array.from(document.querySelectorAll('h1')).map(h => (h.textContent ?? '').trim()),
        text: document.body?.innerText ?? '',
        jsonLd,
        images,
        hasAddToCalendar: Array.from(document.querySelectorAll('button, a')).some(el =>
          /add to calendar/i.test((el.textContent ?? '').trim()),
        ),
        hasAccessibilitySection:
          document.querySelector('section[aria-labelledby="accessibility-heading"]') !== null,
      }
    })

    return { status, url, html: await page.content(), ...data }
  } catch (error) {
    return {
      status: 0,
      url,
      error: error.message,
      title: null,
      canonical: null,
      metaRobots: null,
      h1s: [],
      text: '',
      html: '',
      jsonLd: [],
      images: [],
      hasAddToCalendar: false,
      hasAccessibilitySection: false,
    }
  } finally {
    await page.close()
  }
}

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' })
    return res.status
  } catch (error) {
    /*
     * A PROBE THAT COULD NOT BE MADE IS NOT A 404, AND THE DIFFERENCE MATTERS.
     *
     * Zero is the shape every check already reads as "not served", so the
     * verdict is right either way. What would be wrong is letting a dropped
     * socket LOOK like a platform gap in the report with nothing anywhere
     * saying the request never happened. So it is said, here, in the run log
     * that sits beside the report.
     */
    console.warn(`${TAG} the probe of ${url} could not be made: ${error.message}`)
    return 0
  }
}

/**
 * EVERY URL IS PUT BACK ON THE SITE UNDER TEST, and this is not tidiness.
 *
 * A sitemap carries ABSOLUTE URLs, and it builds them from the origin the
 * application was CONFIGURED with, not the origin it was served from. Point this
 * check at a preview or a local build and the sitemap it serves still says
 * `https://www.eventlinqs.com.au/...`, because that is what NEXT_PUBLIC_SITE_URL
 * holds.
 *
 * Measured on 14 September 2026, running with `--site http://localhost:3200`
 * against a tree that HAD the structured data, the calendar links and the
 * accessibility fields: nine lines came back FAIL, every one of them citing a
 * production URL, and one of them read
 *
 *     1 sitemap URL(s) do not answer 200, first:
 *     https://www.eventlinqs.com.au/events/afro-fusion-showcase-... (404)
 *
 * which is a TEST slug read out of the local sitemap and then requested against
 * production. The check was judging production while reporting on the target, and
 * a reader would have concluded the work was missing when it had never been
 * looked at. That is the worst failure a verification tool can have, because it
 * fails in the direction of "your fix is not there".
 *
 * So the path is what is taken from the sitemap and the origin is always the one
 * being asked about. A URL that cannot be parsed is kept verbatim rather than
 * dropped, so a malformed sitemap is still visible to the lines that judge it.
 */
export function onSite(url, site = SITE) {
  try {
    const parsed = new URL(url, `${site}/`)
    return `${site}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

async function readSitemap() {
  try {
    const res = await fetch(`${SITE}/sitemap.xml`)
    const xml = await res.text()
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => onSite(m[1].trim()))
    return { status: res.status, urls }
  } catch (error) {
    return { status: 0, urls: [], error: error.message }
  }
}

/**
 * Which pages are opened.
 *
 * The sitemap is the platform's own claim about what it wants indexed, so it is
 * the right corpus for the indexability and uniqueness lines rather than a list
 * typed here that would drift. It is capped because this is a fortnightly
 * digest and not a crawl; the cap is stated in the report so a reader knows
 * what was and was not judged.
 */
const MAX_SITEMAP_PAGES = 24

/** Pages that must be judged whether or not the sitemap happens to list them. */
const ALWAYS = ['/organisers', '/pricing', '/legal/organiser-terms', '/help/payments-and-payouts']

export async function takeSnapshot() {
  const sitemap = await readSitemap()
  say(`sitemap: ${sitemap.status}, ${sitemap.urls.length} URL(s)`)

  const leafEventUrl = sitemap.urls.find(u => /\/events\/[^/]+$/.test(u)) ?? null
  say(leafEventUrl ? `leaf event: ${leafEventUrl}` : 'no leaf event URL in the sitemap')

  const wanted = new Set([
    ...sitemap.urls.slice(0, MAX_SITEMAP_PAGES),
    ...ALWAYS.map(p => `${SITE}${p}`),
  ])
  if (leafEventUrl) wanted.add(leafEventUrl)

  const browser = await chromium.launch()
  const pages = {}
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      // A parity check reads what an ordinary visitor is served. Nothing here
      // pretends to be anything else.
      userAgent: undefined,
    })
    for (const url of wanted) {
      const record = await readPage(context, url)
      pages[url] = record
      say(`${record.status} ${url}`)
    }
    await context.close()
  } finally {
    await browser.close()
  }

  const probes = {}
  for (const path of WALLET_PROBES) probes[path] = await probe(`${SITE}${path}`)

  /*
   * THE CATEGORY PROBES COME FROM THE SITEMAP, NEVER FROM A TYPED LIST. A list
   * written here would be a second source for the taxonomy and would rot the
   * first time a category is added or renamed. When the sitemap carries none,
   * the line reports blind rather than inventing a slug to ask about.
   */
  for (const url of sitemap.urls.filter(u => /\/categories\/[^/]+$/.test(u)).slice(0, 6)) {
    probes[new URL(url).pathname] = pages[url]?.status ?? (await probe(url))
  }

  /*
   * A SOLD-OUT AND A PAST EVENT, IF PRODUCTION HAS ONE TO SHOW. Both are read
   * out of what was already fetched rather than guessed at: a sold-out event
   * says so on its page, and a past one carries the ended banner. When neither
   * exists the two lines report blind, which is the honest answer for a
   * catalogue that has not contained one yet.
   */
  const eventPages = Object.values(pages).filter(p => /\/events\/[^/]+$/.test(p.url) && p.status === 200)
  const soldOutEventUrl = eventPages.find(p => /sold out/i.test(p.text))?.url ?? null
  const pastEventUrl = eventPages.find(p => /this event has ended/i.test(p.text))?.url ?? null

  return {
    site: SITE,
    at: new Date().toISOString(),
    sitemap,
    pages,
    probes,
    leafEventUrl,
    soldOutEventUrl,
    pastEventUrl,
  }
}

/* ------------------------------------------------------------------- report */

async function main() {
  if (checkIsDisabled()) {
    say('PARITY_CHECK_DISABLED is set, so the check did not run. The specification is untouched.')
    return
  }

  let snapshot
  if (SNAPSHOT_IN) {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_IN, 'utf8'))
    say(`JUDGING A KEPT SNAPSHOT of ${snapshot.site} taken at ${snapshot.at}. Nothing was fetched.`)
  } else {
    say(`running against ${SITE}`)
    snapshot = await takeSnapshot()
    if (SNAPSHOT_OUT) {
      writeFileSync(SNAPSHOT_OUT, JSON.stringify(snapshot, null, 2))
      say(`wrote the snapshot to ${SNAPSHOT_OUT}`)
    }
  }
  const results = judgeParity(snapshot)

  console.log('')
  for (const r of results) {
    const mark = r.state === 'pass' ? 'PASS ' : r.state === 'fail' ? 'FAIL ' : 'BLIND'
    console.log(`${TAG} ${mark} ${r.line}`)
    console.log(`${TAG}       ${r.observation}`)
  }
  console.log('')
  say(parityHeadline(results))

  const state = {
    at: snapshot.at,
    site: SITE,
    headline: parityHeadline(results),
    passed: results.filter(r => r.state === 'pass').length,
    failed: results.filter(r => r.state === 'fail').length,
    blind: results.filter(r => r.state === 'blind').length,
    worst: results.find(r => r.state === 'fail') ?? null,
    results,
  }

  if (!DRY_RUN && !SNAPSHOT_IN) {
    mkdirSync(dirname(PARITY_STATE_FILE), { recursive: true })
    writeFileSync(PARITY_STATE_FILE, JSON.stringify(state, null, 2))
    say(`wrote ${PARITY_STATE_FILE}`)
  }
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(state, null, 2))
    say(`wrote ${JSON_OUT}`)
  }

  /*
   * WHAT IT LOOKED AT, DECLARED. `scripts/guards/steps-declare-work.mjs` fails
   * a CI step that claims work without saying how much, and it is right to: a
   * parity run that opened no page and judged nothing would otherwise print a
   * clean-looking summary made of fifteen blinds.
   */
  declareWork('parity', {
    did: {
      'production page opened': Object.keys(snapshot.pages ?? {}).length,
      'table-stakes line judged': results.length,
      'route probed': Object.keys(snapshot.probes ?? {}).length,
    },
    found: {
      'table-stakes failure': state.failed,
      'line that could not be observed': state.blind,
    },
  })

  const report = renderParityReport(results, { site: SITE, at: snapshot.at.slice(0, 10) })
  if (WRITE_QUEUE) {
    if (existsSync(QUEUE_FILE)) {
      appendFileSync(QUEUE_FILE, report)
      say(`appended the report to ${QUEUE_FILE}`)
    } else {
      say(`${QUEUE_FILE} is not on this machine, so the report was not appended. It is above and in the JSON.`)
      console.log(report)
    }
  } else {
    console.log(report)
  }
}

const isMain = process.argv[1] && /parity-check\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  main().catch(error => {
    console.error(`${TAG} the check could not run: ${error.stack ?? error.message}`)
    process.exit(2)
  })
}
