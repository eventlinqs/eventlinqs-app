/**
 * A STALE CODE AND A BLINKED READ ARE DIFFERENT FACTS. THIS DRIVES BOTH.
 *
 * `/s/[code]` is what the QR code on an organiser's printed poster resolves to.
 * Its own comment says a link whose event has been DELETED degrades to the
 * browse page rather than a dead end, which is right, and until 21 September
 * 2026 the read deciding it discarded its error, so a dropped socket took that
 * same door. The buyer standing in front of the poster was sent to a generic
 * browse page, concluded the poster was wrong, and the organiser lost the sale
 * and was never told, because at HTTP 302 nothing failed.
 *
 * TWO HALVES, AND THE SECOND ONE IS NOT A BROWSER, WHICH IS STATED RATHER THAN
 * GLOSSED.
 *
 *   PART ONE, in a real browser at 390, 768 and 1440: a real short code lands
 *   on its real event page, and a code with no link row still degrades to the
 *   browse page. That second direction is the one a careless version of this
 *   fix breaks, by turning a genuinely deleted event into a 500.
 *
 *   PART TWO, in this process, against the same real TEST database, with
 *   `globalThis.fetch` wrapped so the events read and the artists read fail
 *   exactly as a dropped socket fails. This proves what the route does when a
 *   read gives up.
 *
 *   It is done in two halves because the blink has to be injected INSIDE the
 *   process that reads the database. The dev server on port 3100 was started by
 *   an earlier session of this lane, this lane's brief says not to restart a
 *   process this session did not start, and the existing preload
 *   (scripts/verify/lib/blink-fetch-preload.mjs) matches an events read by
 *   `slug=eq.`, while both reads this item fixed filter by `id=eq.`. So the
 *   server is used as it is and the blink is driven where it can be injected
 *   honestly. What is NOT produced is a photograph of the browser during a
 *   blink; that is recorded in the ledger rather than implied.
 *
 * NOTHING IS GUESSED. The event, the share code and the artist are all read out
 * of the database at run time. A code that must NOT resolve is generated and
 * then checked against the table, rather than assumed to be absent.
 *
 * BLAST RADIUS. Two other lanes build against this same TEST project. This
 * drive PREFERS an existing untagged row and writes nothing at all when it
 * finds one. If it has to mint a share link it tags the code `lane-b` and the
 * teardown deletes it in a finally and VERIFIES the delete rather than trusting
 * its own call. No row belonging to another lane is read for its own sake,
 * edited or removed.
 *
 * RUN IT, and every flag on this line is load-bearing:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/server-only-shim.mjs \
 *          --import ./scripts/lib/src-alias-loader.mjs \
 *          --env-file=.env.local scripts/verify/a-blink-is-not-a-stale-link-drive.mjs
 *
 *   env -u ...        this shell carries the PRODUCTION Supabase URL, so without
 *                     it the drive reads and writes the live database. The
 *                     refusal below is the backstop, not the plan.
 *   server-only-shim  the resolver is a `server-only` module and fails at
 *                     IMPORT without it, which reads as a product defect.
 *   src-alias-loader  the resolver imports through `@/`, which node does not
 *                     resolve on its own.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const EVIDENCE = 'C:/dev/EVIDENCE/LB-BLINKLINK'
const SHOTS = join(EVIDENCE, 'drive')
mkdirSync(SHOTS, { recursive: true })
const LOG = join(EVIDENCE, 'drive.log')
writeFileSync(LOG, '')

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

let passed = 0
let failed = 0

function say(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

function check(ok, what, detail = '') {
  if (ok) {
    passed += 1
    say(`  PASS  ${what}${detail ? ' :: ' + detail : ''}`)
  } else {
    failed += 1
    say(`  FAIL  ${what}${detail ? ' :: ' + detail : ''}`)
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required.')
  process.exit(1)
}
if (!url.includes('vkapkibzokmfaxqogypq')) {
  console.error(`REFUSING: this drive writes, and ${url} is not the TEST project.`)
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/** A share code this drive minted and must remove. Null when it reused a row. */
let mintedLinkId = null

async function pickSubject() {
  /*
   * A LINK WHOSE EVENT IS ACTUALLY VISIBLE. A share link pointing at a draft
   * resolves and then lands on a 404, which would read as this item's defect
   * and would not be. The join is done in two reads rather than one embed so
   * the failure, if there is one, names which half was empty.
   */
  const links = await db
    .from('share_links')
    .select('id, code, event_id, artist_id, destination_url, retired_at')
    .is('retired_at', null)
    .is('destination_url', null)
    .not('event_id', 'is', null)
    .limit(200)
  if (links.error) throw new Error('could not read share_links: ' + links.error.message)

  const ids = [...new Set((links.data ?? []).map((l) => l.event_id))]
  const events = await db
    .from('events')
    .select('id, slug, title')
    .in('id', ids)
    .eq('status', 'published')
    .eq('visibility', 'public')
  if (events.error) throw new Error('could not read events: ' + events.error.message)
  const visible = new Map((events.data ?? []).map((e) => [e.id, e]))

  const usable = (links.data ?? []).filter((l) => visible.has(l.event_id))
  if (usable.length > 0) {
    const link = usable[0]
    say(`  reusing an existing share link, so this drive writes nothing: ${link.code}`)
    return { link, event: visible.get(link.event_id) }
  }

  // Nothing usable existed, so mint one, tagged, and remember to remove it.
  const event = (events.data ?? [])[0]
  if (!event) throw new Error('no published public event is reachable from any share link')
  const code = 'laneb' + Math.random().toString(36).slice(2, 7)
  const made = await db
    .from('share_links')
    .insert({ code, channel: 'email', event_id: event.id })
    .select('id, code, event_id, artist_id, destination_url')
    .single()
  if (made.error) throw new Error('could not mint a share link: ' + made.error.message)
  mintedLinkId = made.data.id
  say(`  minted a share link tagged lane-b: ${made.data.code}`)
  return { link: made.data, event }
}

/** A code of the right SHAPE that no row carries. Checked, never assumed. */
async function absentCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = 'zz' + Math.random().toString(36).slice(2, 10)
    const hit = await db.from('share_links').select('id').eq('code', code).maybeSingle()
    if (hit.error) throw new Error('could not check a code for absence: ' + hit.error.message)
    if (!hit.data) return code
  }
  throw new Error('could not find a code that is absent')
}

async function driveBrowser(subject, missing) {
  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      })
      const page = await context.newPage()

      // 1. The poster: a real code lands on its real event page.
      await page.goto(`${BASE}/s/${subject.link.code}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      const landed = new URL(page.url()).pathname
      check(
        landed.startsWith(`/events/${subject.event.slug}`),
        `${vp.name}: the scanned code lands on the event`,
        `${landed}`,
      )
      await page.screenshot({ path: join(SHOTS, `${vp.name}-1-poster-lands.png`), fullPage: false })

      // 2. The fallback the defect was hiding behind, still intact.
      await page.goto(`${BASE}/s/${missing}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      const degraded = new URL(page.url()).pathname
      check(
        degraded === '/events',
        `${vp.name}: a code with no row still degrades to browse, not to an error`,
        `${degraded}`,
      )
      await page.screenshot({ path: join(SHOTS, `${vp.name}-2-absent-degrades.png`), fullPage: false })

      await context.close()
    }
  } finally {
    await browser.close()
  }
}

/**
 * PART TWO. The same real database, with the transport failing on cue.
 *
 * supabase-js resolves `fetch` from the global at call time, so wrapping it
 * here puts the blink in front of the module's own reads with the real database
 * on the other side. Every interception is counted, because a proof that
 * injected nothing is a pass over nothing.
 */
async function driveBlink(subject) {
  const { resolveShortCode } = await import('../../src/lib/broadcast/resolve-short-link.ts').catch(
    () => import('@/lib/broadcast/resolve-short-link'),
  )

  const realFetch = globalThis.fetch
  let failing = null
  let intercepted = 0
  globalThis.fetch = async function blinkFetch(input, init) {
    const href =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '')
    if (failing && href.includes(`/rest/v1/${failing}?`)) {
      intercepted += 1
      const cause = new Error('other side closed')
      cause.code = 'UND_ERR_SOCKET'
      cause.name = 'SocketError'
      throw new TypeError('fetch failed', { cause })
    }
    return realFetch.call(globalThis, input, init)
  }

  try {
    // The baseline, so everything below is measured against a working read.
    failing = null
    intercepted = 0
    const healthy = await resolveShortCode(subject.link.code)
    check(
      healthy !== null && healthy.kind === 'event' && healthy.slug === subject.event.slug,
      'in-process: a healthy read resolves to the event',
      JSON.stringify(healthy),
    )

    // The defect itself. Before the fix this returned null, which the route
    // turns into the browse redirect written for a DELETED event.
    failing = 'events'
    intercepted = 0
    let threw = null
    let answered
    try {
      answered = await resolveShortCode(subject.link.code)
    } catch (error) {
      threw = error
    }
    check(
      threw !== null,
      'in-process: a blinked events read RAISES rather than answering "deleted"',
      threw ? String(threw.message) : `it answered ${JSON.stringify(answered)}`,
    )
    check(
      intercepted > 0,
      'in-process: the blink was actually injected, so the case above is not a pass over nothing',
      `${intercepted} events request(s) failed on cue`,
    )

    // The artist read, on a link that carries one.
    if (subject.link.artist_id) {
      failing = 'artists'
      intercepted = 0
      let artistThrew = null
      try {
        await resolveShortCode(subject.link.code)
      } catch (error) {
        artistThrew = error
      }
      check(
        artistThrew !== null,
        'in-process: a blinked artists read RAISES rather than dropping the credit',
        artistThrew ? String(artistThrew.message) : 'it answered without the artist',
      )
      check(intercepted > 0, 'in-process: the artist blink was actually injected', `${intercepted}`)
    } else {
      say(
        '  n/a   in-process: the artist read, because no usable share link on TEST carries an ' +
          'artist_id. The unit test drives that half against the same module ' +
          '(tests/unit/growth/a-blink-is-not-a-stale-link.test.ts).',
      )
    }

    // And back to healthy, so a wrapper left armed cannot flatter the run above.
    failing = null
    intercepted = 0
    const again = await resolveShortCode(subject.link.code)
    check(
      again !== null && again.slug === subject.event.slug,
      'in-process: the read works again once the transport does, so nothing was left broken',
    )
  } finally {
    globalThis.fetch = realFetch
  }
}

async function teardown() {
  if (!mintedLinkId) {
    say('  teardown: nothing was minted, so nothing is removed.')
    return
  }
  await db.from('share_links').delete().eq('id', mintedLinkId)
  const left = await db.from('share_links').select('id').eq('id', mintedLinkId).maybeSingle()
  check(
    !left.error && left.data === null,
    'teardown: the minted share link is gone, checked by reading rather than by trusting the delete',
  )
}

async function main() {
  say(`=== a blink is not a stale link, driven ${new Date().toISOString()} ===`)
  say(`base ${BASE}, database ${url}`)
  const subject = await pickSubject()
  say(`  subject: code ${subject.link.code} -> /events/${subject.event.slug}`)
  const missing = await absentCode()
  say(`  a code checked to be absent: ${missing}`)

  try {
    say('--- part one: the browser, at 390, 768 and 1440 ---')
    await driveBrowser(subject, missing)
    say('--- part two: the blink, in-process, against the same database ---')
    await driveBlink(subject)
  } finally {
    say('--- teardown ---')
    await teardown()
  }

  say(`\n=== ${passed} of ${passed + failed} checks passed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  say(`DRIVE FAILED: ${error.stack ?? error.message}`)
  process.exit(1)
})
