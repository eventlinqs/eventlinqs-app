/**
 * GUARD: THE TWO PRODUCT LOOPS ARE THERE, AND EVERY LINK CARRIES ITS SOURCE.
 *
 * Close-out PL1. Every attendee who buys a ticket has just seen the product
 * work and every organiser who publishes has friends who run events, so the
 * platform now asks both of them. The failure this guards against is the quiet
 * one, and it is quiet in the direction that costs the most: the loop still
 * works, people still arrive, nothing looks broken, and the parameter that says
 * WHERE THEY CAME FROM is gone, so the item is judged on a number that was
 * never collected. Nobody notices until somebody asks how the loop is doing and
 * the answer is that they all arrived from nowhere.
 *
 * WHAT IT CHECKS.
 *
 *   1. THE TICKET EMAIL IS RENDERED, both bodies, from a fixture, with the real
 *      builders, and must carry the line and BOTH parameters. Rendered rather
 *      than read, because a line inside a branch that never runs is in the
 *      source and not in the email, and that is precisely the bug worth
 *      catching. The render is a child process: the builders are TypeScript
 *      under src/ reaching the @/ alias, and a guard cannot turn on a loader
 *      for itself once it is running.
 *   2. THE CONFIRMATION PAGE links through the shared builder. Read rather than
 *      rendered, because it is a React server component that needs a database,
 *      a session and an order, none of which exist on a build host. The driven
 *      half is scripts/verify/pl1-loops-drive.mjs and is where the rendered
 *      page is actually inspected; this half is what fails a build.
 *   3. EVERY SHARED EVENT LINK carries the share source, applied at the ONE
 *      place every channel reads rather than at each of the seven.
 *   4. THE ORGANISER REFERRAL LINK is on the dashboard and is built by the
 *      shared builder, so the code is derived on the server and the browser
 *      never holds the encoder.
 *   5. NOTHING TYPES A LOOP LINK BY HAND. A second place that writes
 *      `/organisers?...` is the one that will lose a parameter.
 *
 * Proven red and green five ways, each drill restoring what it broke:
 * C:\\dev\\EVIDENCE\\PL1\\guard-drills.txt, harness drill-guard.mjs beside it.
 *
 * Run: node scripts/guards/product-loops-carry-their-parameters.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[product-loops-carry-their-parameters]'

const LOOPS = 'src/lib/growth/loops.ts'
const CONFIRMATION = 'src/app/orders/[order_id]/confirmation/page.tsx'
const SHARE_BAR = 'src/components/features/events/event-share-bar.tsx'
const DASHBOARD = 'src/app/(dashboard)/dashboard/page.tsx'
const REFERRAL_PANEL = 'src/components/dashboard/organiser-referral-panel.tsx'
const CARD = 'src/lib/broadcast/social-cards.tsx'

const faults = []
const did = { 'surface read': 0, 'rendered body judged': 0, 'source file swept': 0 }

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    faults.push(`${rel} is missing, and the loop it carries cannot be judged without it`)
    return null
  }
  did['surface read'] += 1
  return readFileSync(file, 'utf8')
}

/* ------------------------------------------------- the source of every value */

const loops = read(LOOPS)
/**
 * The `src` values are read OUT of the module rather than repeated here. A
 * guard that carries its own copy of the thing it is checking is a guard that
 * passes after somebody renames the thing.
 */
const sources = loops
  ? Object.fromEntries(
      [...loops.matchAll(/^\s{2}([A-Z_]+):\s*'([a-z-]+)',$/gm)].map(m => [m[1], m[2]]),
    )
  : {}
for (const key of ['TICKET', 'CONFIRMATION', 'SHARE', 'ORGANISER_REFERRAL']) {
  if (!sources[key]) {
    faults.push(`${LOOPS} no longer declares LOOP_SOURCES.${key}, so the surface that used it is pointing at nothing`)
  }
}

/* --------------------------------- 1. the ticket email, rendered and read back */

{
  const render = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/lib/server-only-shim.mjs',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      'scripts/guards/lib/render-ticket-email.mjs',
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )

  if (render.status !== 0) {
    faults.push(
      `the ticket email could not be rendered, so this guard cannot say what it contains: ${(render.stderr ?? '').trim().split('\n').slice(-3).join(' ')}`,
    )
  } else {
    let bodies = null
    try {
      bodies = JSON.parse(render.stdout)
    } catch {
      faults.push('the ticket email renderer did not return the two bodies as JSON, so nothing could be judged')
    }
    if (bodies) {
      const wanted = [
        { what: 'the run-your-event line', needle: 'Do you run events' },
        { what: 'the organiser path', needle: '/organisers?' },
        { what: `the source parameter src=${sources.TICKET}`, needle: `src=${sources.TICKET}` },
        { what: 'the referral source parameter', needle: 'via=organiser-invite' },
      ]
      for (const [name, body] of [['html', bodies.html], ['text', bodies.text]]) {
        did['rendered body judged'] += 1
        for (const { what, needle } of wanted) {
          if (!body.includes(needle)) {
            faults.push(
              `the RENDERED ticket email (${name}) is missing ${what}. A buyer who has just watched the product work is the only person who will ever wonder whether they could use it, and this is the one line that asks them.`,
            )
          }
        }
      }
    }
  }
}

/* ------------------------------------------- 2. the confirmation page, read */

{
  const page = read(CONFIRMATION)
  if (page) {
    if (!page.includes('organiserLoopPath(LOOP_SOURCES.CONFIRMATION)')) {
      faults.push(
        `${CONFIRMATION} does not build its organiser link through organiserLoopPath(LOOP_SOURCES.CONFIRMATION). A typed href is how one of these loses a parameter.`,
      )
    }
    if (!page.includes('RUN_YOUR_EVENT_LEAD') || !page.includes('RUN_YOUR_EVENT_CALL')) {
      faults.push(`${CONFIRMATION} no longer prints the shared run-your-event sentence`)
    }
    if (!page.includes('data-loop="organiser-invite"')) {
      faults.push(
        `${CONFIRMATION} has lost the data-loop marker the driven proof finds this block by, so nothing can check where it sits on the page`,
      )
    }
  }
}

/* --------------------------------------- 3. every shared link carries src=share */

{
  const bar = read(SHARE_BAR)
  if (bar) {
    if (!/const urlFor = [^\n]*withShareSource\(/.test(bar)) {
      faults.push(
        `${SHARE_BAR} no longer passes every shared link through withShareSource. There are seven channels and the one that gets missed is the one nobody notices.`,
      )
    }
    if (!bar.includes('onInstagram')) {
      faults.push(`${SHARE_BAR} has no Instagram control, which PL1 names explicitly as copy-link-with-a-note`)
    }
  }
}

/* ------------------------------------ 4. the organiser referral link, on the dashboard */

{
  const dashboard = read(DASHBOARD)
  const panel = read(REFERRAL_PANEL)
  if (dashboard && !dashboard.includes('organiserReferralUrl(')) {
    faults.push(
      `${DASHBOARD} does not build the referral link through organiserReferralUrl, so either it is gone or the code is being made somewhere it should not be`,
    )
  }
  if (panel && !panel.includes('data-loop="organiser-referral"')) {
    faults.push(`${REFERRAL_PANEL} has lost the data-loop marker the driven proof finds it by`)
  }
}

/* --------------------------------------------- 5. nothing types a loop link by hand */

function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) yield* walk(rel)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield rel
  }
}

/**
 * Files allowed to write the organiser path with a query string, and why.
 * Every one is a place the link is DEFINED rather than used.
 */
const TYPED_LINK_ALLOWED = new Set([LOOPS])

for (const rel of walk('src')) {
  did['source file swept'] += 1
  if (TYPED_LINK_ALLOWED.has(rel)) continue
  const source = readFileSync(join(ROOT, rel), 'utf8')
  /*
   * AN ATTRIBUTED organiser link, which is the only kind this guard is about.
   * `/organisers?city=geelong` is a FILTER and is none of its business; the
   * first version of this swept for any query string at all and named three
   * city landing pages that were doing nothing wrong. What must never be typed
   * by hand is a link carrying `via` or `src`, because those are the two the
   * count depends on.
   */
  if (/['"`][^'"`]*\/organisers\?[^'"`]*(via=|src=)/.test(source)) {
    faults.push(
      `${rel} types a loop link by hand. Every one of them is built in ${LOOPS}, so the two parameter systems can never disagree, because one function writes them.`,
    )
  }
}

/* --------------------------------------------- the card line, composed not typed */

{
  const card = read(CARD)
  if (card && !card.includes('ORGANISER_PATH')) {
    faults.push(
      `${CARD} no longer composes its run-your-event line from ORGANISER_PATH. A raster cannot carry a parameter, but it can at least name the same path as everything else.`,
    )
  }
}

/* ------------------------------------------------------------------ verdict */

declareWork('product-loops-carry-their-parameters', {
  did,
  found: { 'loop missing or unparameterised': faults.length },
})

console.log(
  `${TAG} judged ${did['rendered body judged']} rendered email body(ies) and ${did['surface read']} surface(s), and swept ${did['source file swept']} source file(s) for a typed loop link`,
)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} way(s) a loop is missing or arriving uncounted.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - both loops are present and every link carries the source that counts it.`)
