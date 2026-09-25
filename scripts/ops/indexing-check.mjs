/**
 * THE WEEKLY INDEXING CHECK, THE IMPURE HALF (close-out SEO2 step 3).
 *
 * The judging and the wording are in `scripts/lib/indexing-check.mjs` and are
 * pure. This file does the looking: it fetches the live sitemap, requests every
 * URL in it, and, when a Search Console credential exists, asks Google what it
 * did with each one. It writes `.indexing/last-run.json`, which the daily owner
 * digest reads and turns into one line.
 *
 * THE HANDOFF IS A FILE, for the same reason the parity check's is: this runs
 * weekly and the digest runs daily, so the two cannot pass a value in memory. A
 * missing file means the check has not run on this machine, and the digest says
 * that rather than printing good news.
 *
 * WHAT IT COSTS. One request for the sitemap and one per URL, at a small fixed
 * concurrency, plus one URL Inspection call per URL when connected. Google
 * publishes "2000 QPD" and "600 QPM" per site for that API
 * (https://developers.google.com/webmaster-tools/limits, fetched 2026-09-14), so
 * the inspection half is paced below the per-minute figure and refuses to start
 * a sweep it cannot finish inside the daily one, rather than being cut off
 * half-way and reporting a partial answer as a whole one.
 *
 *   node scripts/ops/indexing-check.mjs [--site https://...] [--json out.json]
 *                                       [--limit N] [--no-inspect] [--dry-run]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createSign } from 'node:crypto'
import { declareWork } from '../lib/work-report.mjs'
import {
  INDEXING_CADENCE,
  VERIFY_COMMAND,
  parseSitemapLocs,
  robotsFromHtml,
  summarise,
  credentialState,
  coverageFromInspections,
} from '../lib/indexing-check.mjs'

const ROOT = process.cwd()
const TAG = '[indexing-check]'
const argv = process.argv.slice(2)
const argOf = flag => {
  const i = argv.indexOf(flag)
  return i >= 0 && typeof argv[i + 1] === 'string' ? argv[i + 1] : null
}

/** Where the result goes so the digest can carry one line of it. */
export const INDEXING_STATE_FILE = join(ROOT, '.indexing', 'last-run.json')

const SITE = (argOf('--site') || process.env.INDEXING_SITE || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const JSON_OUT = argOf('--json')
const LIMIT = Number(argOf('--limit') || process.env.INDEXING_LIMIT || 0) || 0
const NO_INSPECT = argv.includes('--no-inspect')
const DRY_RUN = argv.includes('--dry-run')

/** Concurrency for the sweep. Eight is polite to our own host and fast enough. */
const CONCURRENCY = 8

/**
 * The per-site daily ceiling Google publishes, used as a refusal rather than as
 * a target: a sweep larger than this cannot be completed today, and half an
 * answer reported as a whole one is the failure this check exists to prevent.
 */
export const INSPECTION_DAILY_CEILING = 2000
/** The per-minute ceiling, with headroom. 600 QPM published; 300 used. */
export const INSPECTIONS_PER_MINUTE = 300

const say = m => console.log(`${TAG} ${m}`)

/* ------------------------------------------------------------------ the sweep */

/** Fetch one URL and record what it answered. Never throws. */
async function look(url) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'eventlinqs-indexing-check', Accept: 'text/html' },
    })
    // A redirect is not a 200 and must not be followed into one: Google's own
    // sitemap guidance is "Don't include URLs that redirect", so a 301 here is a
    // finding rather than a detour.
    const status = res.status
    const html = status === 200 ? await res.text() : ''
    return { url, status, robots: robotsFromHtml(html), error: null }
  } catch (e) {
    return { url, status: 0, robots: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Run `worker` over `items` at a fixed concurrency, in order-independent fashion. */
async function pool(items, worker, concurrency = CONCURRENCY) {
  const out = []
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return out
}

/* ------------------------------------------------------- the Search Console half */

/**
 * A Google OAuth access token from a service-account key, signed here rather
 * than through a client library.
 *
 * One dependency avoided, and the whole flow is forty lines of documented JWT:
 * https://developers.google.com/identity/protocols/oauth2/service-account
 * (fetched 2026-09-14). The scope is the read-only Search Console one, so a
 * credential that leaks can read what Google thinks and change nothing.
 */
export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: key.client_email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(claim)}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new Error(`Google refused the service-account assertion: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body.access_token
}

/** One URL Inspection call. Returns { url, result } or { url, error }. */
async function inspect(token, siteUrl, url) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { url, error: `HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}` }
  return { url, result: body }
}

/* -------------------------------------------------------------------- the run */

async function main() {
  say(`${INDEXING_CADENCE}. Looking at ${SITE}.`)

  const sitemapRes = await fetch(`${SITE}/sitemap.xml`, { headers: { 'User-Agent': 'eventlinqs-indexing-check' } })
  if (!sitemapRes.ok) {
    // A sitemap that cannot be read is the one condition under which nothing
    // below can be said, so it is written down as an error rather than as zero.
    const state = { at: new Date().toISOString(), site: SITE, error: `the sitemap answered HTTP ${sitemapRes.status}`, headline: `The sitemap at ${SITE}/sitemap.xml answered HTTP ${sitemapRes.status}.` }
    persist(state)
    console.error(`${TAG} FAIL: ${state.error}`)
    process.exitCode = 1
    return
  }
  const locs = parseSitemapLocs(await sitemapRes.text())
  say(`${locs.length} URL(s) in the sitemap.`)

  const sweepList = LIMIT > 0 ? locs.slice(0, LIMIT) : locs
  if (LIMIT > 0) say(`--limit ${LIMIT}: requesting the first ${sweepList.length} of them.`)
  const fetched = await pool(sweepList, look)
  say(`${fetched.filter(r => r.status === 200).length} of ${fetched.length} answered 200.`)

  let searchConsole = null
  const credential = credentialState(process.env)
  if (!credential.connected || NO_INSPECT) {
    searchConsole = {
      connected: false,
      reason: NO_INSPECT ? '--no-inspect: Google was not asked on this run' : credential.reason,
      indexed: null,
      excluded: [],
    }
    say(searchConsole.reason)
  } else if (sweepList.length > INSPECTION_DAILY_CEILING) {
    searchConsole = {
      connected: false,
      reason:
        `${sweepList.length} URLs is above the ${INSPECTION_DAILY_CEILING} per-site daily URL Inspection quota Google ` +
        'publishes, so a sweep would be cut off part way and report a partial answer as a whole one',
      indexed: null,
      excluded: [],
    }
    say(searchConsole.reason)
  } else {
    try {
      const token = await accessToken(JSON.parse(process.env.GOOGLE_SEARCH_CONSOLE_KEY))
      say(`asking Search Console about ${sweepList.length} URL(s) as ${credential.clientEmail}.`)
      const perSlot = Math.max(1, Math.floor(INSPECTIONS_PER_MINUTE / 60))
      const inspections = await pool(sweepList.map(r => r.url ?? r), url => inspect(token, `${SITE}/`, typeof url === 'string' ? url : url.url), perSlot)
      const coverage = coverageFromInspections(inspections)
      searchConsole = { connected: true, reason: null, indexed: coverage.indexed, excluded: coverage.excluded }
      say(`Google reports ${coverage.indexed} indexed and ${coverage.excluded.length} excluded.`)
    } catch (e) {
      searchConsole = { connected: false, reason: `Search Console could not be asked: ${e instanceof Error ? e.message : String(e)}`, indexed: null, excluded: [] }
      console.error(`${TAG} ${searchConsole.reason}`)
    }
  }

  const state = summarise({ site: SITE, at: new Date().toISOString(), submitted: locs.length, fetched, searchConsole })

  /*
   * WHAT THIS RUN DID, IN NUMBERS THAT MOVE. A weekly job that quietly fetched
   * nothing would otherwise report "0 URLs submitted, none excluded" and read as
   * a clean bill of health, which is the exact register this check exists to
   * refuse. Zero URLs requested is a failure and says so.
   */
  declareWork('indexing-check', {
    did: { 'sitemap read': 1, 'URL requested': fetched.length, 'URL inspected by Google': searchConsole.connected ? fetched.length : 0 },
    found: { 'broken sitemap URL': state.faults.length, 'exclusion reported by Google': searchConsole.excluded?.length ?? 0 },
    zeroIsFine: {
      'URL inspected by Google': searchConsole.connected
        ? 'connected, and the sweep was empty'
        : `Search Console is not connected: ${searchConsole.reason}`,
    },
    exitOnZero: false,
  })
  say(state.headline)
  for (const fault of state.faults) console.error(`${TAG} IN THE SITEMAP AND BROKEN: ${fault.url} ${fault.fault}`)
  if (!searchConsole.connected) say(`To connect Google: ${VERIFY_COMMAND}`)
  persist(state)
}

function persist(state) {
  if (DRY_RUN) {
    say('dry run: nothing written.')
    return
  }
  mkdirSync(dirname(INDEXING_STATE_FILE), { recursive: true })
  writeFileSync(INDEXING_STATE_FILE, JSON.stringify(state, null, 2))
  say(`wrote ${INDEXING_STATE_FILE}`)
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(state, null, 2))
    say(`wrote ${JSON_OUT}`)
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('indexing-check.mjs')) {
  await main()
}
