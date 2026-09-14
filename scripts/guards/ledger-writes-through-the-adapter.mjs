/**
 * GUARD THREE OF THREE ON THE SLOT LEDGER: ONE DOOR IN, AND EVERY SALE USES IT.
 *
 * THE INVARIANT (close-out D1): "EventLinqs writes to the ledger through a
 * single adapter module... Nothing else in the codebase writes to the ledger
 * directly. A registered guard must assert this, because the adapter boundary is
 * the entire portability of the business and it will erode within a month if
 * nothing defends it."
 *
 * TWO CLAUSES, because "one door" is worthless if half the traffic walks past it.
 *
 * CLAUSE ONE, THE DOOR. No file outside src/lib/ledger may write to the ledger
 * tables or call the writer function. A read is fine and is expected: the
 * organiser's dashboard reads the ledger to draw the pace curve, and the point
 * of the boundary is that the MAPPING lives in one place, not that the data is
 * secret from the application that owns it.
 *
 * CLAUSE TWO, THE TRAFFIC. Every place an order is confirmed must record the
 * sale. This repository already carries two receipts for what "remember to call
 * it" is worth without a guard behind it:
 *
 *   discount usage was recorded in the free branch of checkout and not the paid
 *   one, so max_uses went unenforced on exactly the orders that take money;
 *
 *   payout_status was written by the deauthorize handler and not by
 *   account.updated, so it became a one-way door that stranded an organiser.
 *
 * Both were one missing call at one write site, in a file that compiled, passed
 * every test and shipped. A ledger with a hole in it is worse than both, because
 * the hole is invisible: the missing rows look exactly like slots that sold
 * nothing.
 *
 * CLAUSE THREE, THE READING (added 13 September 2026 with the second surface).
 * Every surface that DRAWS a slot's curve must get it from `paceForSlot`, and no
 * surface may compose a curve out of literals. Until today there was one reader,
 * the organiser's dashboard, and "it obviously reads the ledger" was true by
 * inspection. There are now two: /admin/events/[id] renders the same panel for
 * the platform owner, because the one real production event belongs to an
 * outside organiser and the owner had nowhere to read its curve.
 *
 * The failure this stops is a specific and tempting one. A panel that draws
 * nothing looks broken, and the quickest way to make it look right is to hand it
 * a shaped object. That is Law 1's placeholder defect wearing a chart, and it
 * would be worse here than anywhere else: the whole claim of the ledger is that
 * the numbers on that panel came out of recorded rows, so a literal curve is not
 * a cosmetic stub, it is a fabricated sales history on an organiser's screen.
 *
 * Run standalone:  node scripts/guards/ledger-writes-through-the-adapter.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const ENGINE_PREFIX = join('src', 'lib', 'ledger')
const TAG = '[ledger-writes-through-the-adapter]'

/** The database function that writes a ledger row. */
const WRITER = 'record_ledger_entry'
/** What the adapter is called from everywhere else. */
const CONFIRMED_ORDER_RECORDER = 'recordConfirmedOrder'
/** The one gate every confirmed order passes through. */
const ORDER_CONFIRM_RPC = 'confirm_order'
/** The component that draws a slot's curve, and the only reader that may feed it. */
const PACE_PANEL = 'SalesPacePanel'
const PACE_READER = 'paceForSlot'

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const WRITE_CHAIN = /from\(\s*['"](ledger_entries|ledger_slots)['"]\s*\)[\s\S]{0,240}?\.(insert|update|delete|upsert)\s*\(/g
const WRITER_CALL = new RegExp(`rpc\\(\\s*['"]${WRITER}['"]`)
const CONFIRM_CALL = new RegExp(`rpc\\(\\s*['"]${ORDER_CONFIRM_RPC}['"]`, 'g')

/** Source with every comment removed, so a mention in prose proves nothing. */
export function withoutComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

/** True when this file actually CALLS the recorder, rather than merely naming it. */
export function callsRecorder(text, name = CONFIRMED_ORDER_RECORDER) {
  const live = withoutComments(text)
    // An import names it without calling it, and a file that imports and never
    // calls is precisely the failure this clause is for.
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, ' ')
  return new RegExp(`\\b${name}\\s*\\(`).test(live)
}

/** `<SalesPacePanel ... />` rendered, in live code rather than named in a comment. */
const PANEL_RENDER = new RegExp(`<${PACE_PANEL}[\\s/>]`)
/**
 * A curve composed out of literals. It looks for the two fields that only a
 * PaceCurve has, appearing as object keys close together: `priceMoves` and
 * `totals`. A page reading the real thing never writes either of them down.
 */
const LITERAL_CURVE = /priceMoves\s*:[\s\S]{0,400}?totals\s*:|totals\s*:[\s\S]{0,400}?priceMoves\s*:/

const problems = []
let filesRead = 0
let confirmSites = 0
let panelRenders = 0

for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8')
  filesRead += 1
  const rel = relative(ROOT, file)
  const inTheEngine = rel.startsWith(ENGINE_PREFIX)

  /* CLAUSE ONE: the door. */
  if (!inTheEngine) {
    for (const m of text.matchAll(WRITE_CHAIN)) {
      const line = text.slice(0, m.index).split('\n').length
      problems.push(
        `${rel}:${line} writes to ${m[1]} directly. Every write goes through src/lib/ledger/adapter.ts, ` +
          'because that boundary is what lets the engine be pointed at another business tomorrow.',
      )
    }
    if (WRITER_CALL.test(text)) {
      problems.push(
        `${rel} calls ${WRITER}() directly. Only src/lib/ledger/writer.ts may, and only the adapter may reach it.`,
      )
    }
  }

  /* CLAUSE TWO: the traffic. */
  const confirms = [...text.matchAll(CONFIRM_CALL)]
  if (confirms.length > 0) {
    confirmSites += confirms.length
    /*
     * A CALL, IN LIVE CODE. `text.includes(name)` was the first version and this
     * file's own drill caught it in one run: commenting the call out left the
     * name in an import and in the comment itself, so the guard went green on a
     * money path that had stopped recording anything. Comments are stripped
     * first, then a call is what counts.
     */
    if (!callsRecorder(text)) {
      problems.push(
        `${rel} confirms an order (${confirms.length} call(s) to ${ORDER_CONFIRM_RPC}) and never calls ` +
          `${CONFIRMED_ORDER_RECORDER}. Those sales would be missing from the ledger, and missing rows look ` +
          'exactly like a slot that sold nothing.',
      )
    }
  }

  /* CLAUSE THREE: the reading. Comments stripped, for the same reason as above. */
  const live = withoutComments(text)
  if (PANEL_RENDER.test(live)) {
    panelRenders += 1
    if (!callsRecorder(text, PACE_READER)) {
      problems.push(
        `${rel} renders <${PACE_PANEL}> and never calls ${PACE_READER}(). A curve on that panel is a claim ` +
          'that those units sold on those days at those prices, so it comes out of the ledger or it does not ' +
          'get drawn.',
      )
    }
    if (LITERAL_CURVE.test(live)) {
      problems.push(
        `${rel} composes a curve out of literals beside a <${PACE_PANEL}>. A panel that draws nothing looks ` +
          'broken and a shaped object is the quickest way to make it look right, which is a fabricated sales ' +
          'history on an organiser screen rather than a cosmetic stub.',
      )
    }
  }
}

/*
 * A guard that reads nothing reports no problems. If the confirm sites vanish,
 * the second clause has stopped judging anything and must say so rather than go
 * quietly green.
 */
if (confirmSites === 0) {
  problems.push(
    `no call to ${ORDER_CONFIRM_RPC} was found anywhere under src/. Either the money path has been renamed, ` +
      'in which case this guard is now blind, or something much worse has happened.',
  )
}

/* The same honesty for clause three: no readers found means it judged nothing. */
if (panelRenders === 0) {
  problems.push(
    `no surface renders <${PACE_PANEL}> anywhere under src/. Either the panel has been renamed, in which case ` +
      'clause three is now blind, or the organiser and the owner have both lost the one screen that says when ' +
      'their units sold.',
  )
}

if (!existsSync(join(SRC, 'lib', 'ledger', 'adapter.ts'))) {
  problems.push('src/lib/ledger/adapter.ts does not exist, so there is no boundary to defend')
}

console.log(
  `${TAG} ${filesRead} source file(s) read, ${confirmSites} order-confirmation site(s) judged, ` +
    `${panelRenders} surface(s) drawing a slot curve judged`,
)

if (problems.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${problems.length} problem(s):`)
  for (const p of problems) console.error(`    ${p}`)
  console.error('')
  console.error('  One door in, and every sale uses it. A ledger with a hole in it is worse')
  console.error('  than no ledger, because the missing rows look like slots that sold nothing.')
  process.exit(1)
}

declareWork('ledger-writes-through-the-adapter', {
  did: {
    'source file read': filesRead,
    'order-confirmation site judged': confirmSites,
    'surface drawing a slot curve judged': panelRenders,
  },
  found: { 'write that walks past the adapter': problems.length },
  zeroIsFine: {
    'write that walks past the adapter':
      'zero is the goal state; the guard exists because this repository has twice shipped one write site that forgot a call the others made',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - one door in, and all ${confirmSites} order-confirmation site(s) use it; ` +
    `all ${panelRenders} surface(s) that draw a curve read it through ${PACE_READER}().`,
)
process.exit(0)
