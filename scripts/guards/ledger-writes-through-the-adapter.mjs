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

const problems = []
let filesRead = 0
let confirmSites = 0

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

if (!existsSync(join(SRC, 'lib', 'ledger', 'adapter.ts'))) {
  problems.push('src/lib/ledger/adapter.ts does not exist, so there is no boundary to defend')
}

console.log(`${TAG} ${filesRead} source file(s) read, ${confirmSites} order-confirmation site(s) judged`)

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
  did: { 'source file read': filesRead, 'order-confirmation site judged': confirmSites },
  found: { 'write that walks past the adapter': problems.length },
  zeroIsFine: {
    'write that walks past the adapter':
      'zero is the goal state; the guard exists because this repository has twice shipped one write site that forgot a call the others made',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - one door in, and all ${confirmSites} order-confirmation site(s) use it.`)
process.exit(0)
