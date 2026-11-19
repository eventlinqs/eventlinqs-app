/**
 * GUARD: EVERY HOLD WRITTEN NAMES ITS NEXT ACTION (WINDOW 5A, 20 November 2026, the listings run's 'eight failed').
 *
 * Every open hold must name the next source the resolver reads and when: the database refuses any other
 * (listing_holds_open_carries_its_next_action, supabase/migrations/20261107170001_listing_holds_next_action.sql). The
 * occurrence run's hold for a held series' new night (src/lib/listings/held-night.ts holdRowFor) named neither, so
 * production refused it every hour for eight held weekly series and the run took each new night away again ('1171
 * nights, 0 made, 8 failed ... its hold could not be written: new row for relation "listing_holds" violates check
 * constraint "listing_holds_o...', the listings row of 08:10 that day). Every unit test passed: none wrote to a database.
 *
 * The class: every insert or upsert into listing_holds in src carries next_source and next_check_at, written in the row
 * itself or in the named row builder it calls. A row this guard cannot read is a fault too.
 * Reads src only (on the build host). Comments are stripped before reading.
 *
 * Run: node scripts/guards/listing-holds-carry-next-action.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[listing-holds-carry-next-action]'
const ROOT = 'src'
// Comments go, their line breaks stay, so a line named below is the line in the file.
const stripComments = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/^\s*\/\/.*$/gm, '')

function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** The text from an opening bracket to its match. */
function balanced(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const stack = []
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return text.slice(open, i + 1)
    } else if (c === "'" || c === '"' || c === '`') {
      const end = text.indexOf(c, i + 1)
      if (end < 0) return null
      i = end
    }
  }
  return null
}

const sources = files(ROOT).map((file) => ({ file, text: stripComments(readFileSync(file, 'utf8')) }))
const carries = (body) => /\bnext_source\s*:/.test(body) && /\bnext_check_at\s*:/.test(body)
const faults = []
let writes = 0
for (const { file, text } of sources) {
  for (const m of text.matchAll(/\.from\('listing_holds'\)\s*\.(insert|upsert)\(/g)) {
    writes += 1
    const line = text.slice(0, m.index).split('\n').length
    const argument = balanced(text, m.index + m[0].length - 1)
    const inner = argument ? argument.slice(1, -1).trim() : ''
    if (inner.startsWith('{')) {
      if (!carries(inner)) faults.push(`${file}:${line}: the hold written here names no next_source and next_check_at, so the database refuses it`)
      continue
    }
    const call = inner.match(/^([A-Za-z_$][\w$]*)\(/)
    if (!call) {
      faults.push(`${file}:${line}: the hold written here ('${inner.slice(0, 60)}') cannot be read for its next action; write the row or call a named row builder`)
      continue
    }
    const builder = sources.map((s) => ({ s, at: s.text.search(new RegExp(`export function ${call[1]}\\(`)) })).find((x) => x.at >= 0)
    const body = builder ? balanced(builder.s.text, builder.s.text.indexOf('{', builder.s.text.indexOf(')', builder.at))) : null
    if (!body) faults.push(`${file}:${line}: the row builder ${call[1]} could not be found in src`)
    else if (!carries(body)) faults.push(`${file}:${line}: ${call[1]} (${builder.s.file}) writes a hold with no next_source and next_check_at, so the database refuses it`)
  }
}
if (writes === 0) faults.push('no insert into listing_holds was found in src; the guard reads nothing, so it is wrong')

declareWork('listing-holds-carry-next-action', { did: { write: writes }, found: { fault: faults.length } })
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${faults.length} hold write(s) the database would refuse.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${writes} hold writes in src, each naming its next source and check time.`)
