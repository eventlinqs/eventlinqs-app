/**
 * GUARD: A PREFIX IS ASKED AS A PREFIX, NEVER AS A TEXT RANGE (WINDOW 5A, 20 November 2026, the PM's 08:08 item 2).
 *
 * The social read back asked production for every post still held by its Blotato reference with
 * .gte('published_ref', 'blotato:').lt('published_ref', 'blotato;'): the next character after ':' as the upper bound.
 * That holds only in byte order. The column collates as en_US.UTF-8, and production answered 0 rows where
 * like 'blotato:%' answered 4 (C:\dev\EVIDENCE\EL-20NOV\amcf\q-readback-range.sql), so from the day it was built no
 * Blotato post's URL was read back and its status never asked.
 *
 * The class: a query that bounds one column from below and above with two text literals (neither a date nor a number)
 * in the same chain is a text range, and its answer depends on the database's collation, not on the words. A prefix is
 * asked with .like('<column>', '<prefix>%'); a genuine text range needs its collation written in SQL, never here.
 * Reads src only (on the build host). Comments are stripped before reading.
 *
 * Run: node scripts/guards/no-text-range-for-a-prefix.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[no-text-range-for-a-prefix]'
const ROOT = 'src'
const NEAR = 400
// Comments go, their line breaks stay, so a line named below is the line in the file.
const stripComments = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/^\s*\/\/.*$/gm, '')
const notText = (v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^-?\d+(\.\d+)?$/.test(v) || v === ''

function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const BOUND = /\.(gte|gt|lte|lt)\(\s*'([A-Za-z_][A-Za-z0-9_.]*)'\s*,\s*'([^'\\]*)'\s*\)/g
const faults = []
let read = 0
for (const file of files(ROOT)) {
  const text = stripComments(readFileSync(file, 'utf8'))
  read += 1
  const bounds = [...text.matchAll(BOUND)].map((m) => ({ op: m[1], column: m[2], value: m[3], at: m.index }))
  for (const lower of bounds.filter((b) => b.op === 'gte' || b.op === 'gt')) {
    for (const upper of bounds.filter((b) => (b.op === 'lt' || b.op === 'lte') && b.column === lower.column && Math.abs(b.at - lower.at) < NEAR)) {
      const between = text.slice(Math.min(lower.at, upper.at), Math.max(lower.at, upper.at))
      if (/;\s*\n|\n\s*\n/.test(between)) continue
      if (notText(lower.value) || notText(upper.value)) continue
      const line = text.slice(0, lower.at).split('\n').length
      faults.push(`${file}:${line}: '${lower.column}' is bounded as a text range ('${lower.value}' to '${upper.value}'), so its answer depends on the collation; ask a prefix with .like('${lower.column}', '<prefix>%')`)
    }
  }
}

declareWork('no-text-range-for-a-prefix', { did: { file: read }, found: { fault: faults.length } })
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${faults.length} text range(s) standing in for a prefix.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${read} source files read: no column is bounded as a text range; every prefix is asked as a prefix.`)
